/**
 * @file workspace-intelligence.ts
 * The ultimate workspace discovery and analysis engine
 * 
 * Consolidates: listWorkspaces, listWorkspacesEnhanced, analyzeWorkspace, 
 * selectWorkspace, workspaceWizard
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import sqlite3 from 'sqlite3';
import { logger } from '../../lib/logger.js';
import { 
  formatQueryResults, 
  formatError, 
  FormattingOptions, 
  DEFAULT_FORMAT_OPTIONS 
} from '../formatting.js';
import { analyzeWorkspaceContent, WorkspaceAnalysis, ConversationData, ComposerSession } from '../analysis.js';

/**
 * Workspace folder metadata interface
 */
interface WorkspaceFolder {
  id: string;           // Workspace folder ID (hash)
  lastModified: string; // ISO timestamp of last modification
  creationDate: string; // ISO timestamp of creation
  label: string;        // Human-friendly label extracted from first prompt
  hasStateDb: boolean;  // Whether workspace has a state.vscdb file
  promptCount?: number; // Number of prompts in aiService.prompts
  generationCount?: number; // Number of generations in aiService.generations
}

/**
 * Workspace intelligence mode types
 */
export type WorkspaceIntelligenceMode = 'list' | 'search' | 'analyze' | 'discover' | 'wizard';

/**
 * Filter options for workspace operations
 */
interface WorkspaceFilters {
  technology?: string[];
  status?: string[];
  timeRange?: string;
  minActivity?: number;
  searchType?: string;
  includeInactive?: boolean;
}

/**
 * Options for workspace operations
 */
interface WorkspaceOptions {
  limit?: number;
  includeAnalysis?: boolean;
  includeScore?: boolean;
  format?: 'table' | 'json';
}

/**
 * Wizard configuration for guided discovery
 */
interface WorkspaceWizardConfig {
  intent?: string;
  currentProject?: string;
  preferences?: object;
  stepMode?: boolean;
}

/**
 * Input schema for workspace intelligence tool
 */
export const workspaceIntelligenceInputSchema = {
  mode: z.enum(['list', 'search', 'analyze', 'discover', 'wizard']).describe('Operation mode'),
  query: z.string().optional().describe('Search/discovery query'),
  workspaceId: z.string().optional().describe('Specific workspace analysis'),
  filters: z.object({
    technology: z.array(z.string()).optional(),
    status: z.array(z.string()).optional(),
    timeRange: z.string().optional(),
    minActivity: z.number().optional(),
    searchType: z.string().optional(),
    includeInactive: z.boolean().optional()
  }).optional().describe('Filtering criteria'),
  options: z.object({
    limit: z.number().optional(),
    includeAnalysis: z.boolean().optional(),
    includeScore: z.boolean().optional(),
    format: z.enum(['table', 'json']).optional()
  }).optional().describe('Output options'),
  wizard: z.object({
    intent: z.string().optional(),
    currentProject: z.string().optional(),
    preferences: z.object({}).optional(),
    stepMode: z.boolean().optional()
  }).optional().describe('Wizard configuration')
};

/**
 * Main workspace intelligence handler function
 */
export async function handleWorkspaceIntelligence(input: {
  mode: 'list' | 'search' | 'analyze' | 'discover' | 'wizard';
  query?: string;
  workspaceId?: string;
  filters?: WorkspaceFilters;
  options?: WorkspaceOptions;
  wizard?: WorkspaceWizardConfig;
}) {
  logger.info(`Workspace Intelligence called with mode: ${input.mode}`);
  
  const formatOptions: FormattingOptions = {
    format: input.options?.format || DEFAULT_FORMAT_OPTIONS.format,
    pretty: true,
  };

  try {
    switch (input.mode) {
      case 'list':
        return await handleWorkspaceList(input, formatOptions);
      case 'search':
        return await handleWorkspaceSearch(input, formatOptions);
      case 'analyze':
        return await handleWorkspaceAnalyze(input, formatOptions);
      case 'discover':
        return await handleWorkspaceDiscover(input, formatOptions);
      case 'wizard':
        return await handleWorkspaceWizard(input, formatOptions);
      default:
        throw new Error(`Unsupported mode: ${input.mode}`);
    }
  } catch (error) {
    logger.error(`Workspace Intelligence error:`, error);
    return {
      content: [{ 
        type: 'text' as const, 
        text: formatError(`Workspace Intelligence Error: ${error instanceof Error ? error.message : 'Unknown error'}`) 
      }],
      isError: true,
    };
  }
}

/**
 * Handle workspace listing operations
 */
async function handleWorkspaceList(input: any, formatOptions: FormattingOptions) {
  logger.info('Handling workspace list operation');
  
  const fs = await import('fs/promises');
  const path = await import('path');
  
  // Extract parameters with defaults
  const sortBy = input.filters?.sortBy || 'modified';
  const sortOrder = input.filters?.sortOrder || 'desc';
  const includeLabels = input.options?.includeAnalysis !== false; // default true
  const limit = input.options?.limit || 50;
  
  logger.info(`Workspace list: sortBy=${sortBy}, sortOrder=${sortOrder}, includeLabels=${includeLabels}, limit=${limit}`);
  
  // Default Cursor workspaceStorage path
  const workspaceStorageDir = path.join(
    process.env.HOME || process.env.USERPROFILE || '',
    'AppData', 'Roaming', 'Cursor', 'User', 'workspaceStorage'
  );
  
  let folders: WorkspaceFolder[] = [];
  let errors: string[] = [];
  
  try {
    const entries = await fs.readdir(workspaceStorageDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        try {
          const folderPath = path.join(workspaceStorageDir, entry.name);
          const stat = await fs.stat(folderPath);
          const stateDbPath = path.join(folderPath, 'state.vscdb');
          let hasStateDb = false;
          let label = '(no label)';
          
          try {
            await fs.access(stateDbPath);
            hasStateDb = true;
            
            // Extract label from first prompt if requested and database exists
            if (includeLabels) {
              label = await extractWorkspaceLabel(stateDbPath, entry.name);
            }
          } catch {
            // state.vscdb doesn't exist, which is fine
          }
          
          folders.push({
            id: entry.name,
            lastModified: stat.mtime.toISOString(),
            creationDate: stat.birthtime.toISOString(),
            label,
            hasStateDb,
          });
        } catch (err: any) {
          logger.warn(`Error processing workspace folder ${entry.name}:`, err);
          errors.push(`${entry.name}: ${err.message}`);
          // Continue processing other folders
        }
      }
    }
  } catch (err: any) {
    logger.error('Error accessing workspace storage directory:', err);
    return {
      content: [{ type: 'text' as const, text: formatError(`Error accessing workspace storage directory: ${err.message}`) }],
      isError: true,
    };
  }
  
  // Sort folders
  folders.sort((a, b) => {
    let comparison = 0;
    switch (sortBy) {
      case 'creation':
        comparison = new Date(a.creationDate).getTime() - new Date(b.creationDate).getTime();
        break;
      case 'modified':
        comparison = new Date(a.lastModified).getTime() - new Date(b.lastModified).getTime();
        break;
      case 'id':
        comparison = a.id.localeCompare(b.id);
        break;
    }
    return sortOrder === 'desc' ? -comparison : comparison;
  });
  
  // Apply limit
  if (limit && folders.length > limit) {
    folders = folders.slice(0, limit);
  }
  
  // Format output based on requested format
  if (formatOptions.format === 'json') {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(folders, null, 2) }],
    };
  } else {
    // Format as a plain text table
    let text = `Workspaces (sorted by ${sortBy} ${sortOrder})\n`;
    text += 'ID                                 | Last Modified          | Created              | Has DB | Label\n';
    text += '------------------------------------|------------------------|----------------------|--------|------------------\n';
    for (const f of folders) {
      const labelTrunc = f.label.length > 40 ? f.label.substring(0, 37) + '...' : f.label;
      text += `${f.id.padEnd(36)} | ${f.lastModified.slice(0,19)} | ${f.creationDate.slice(0,19)} | ${f.hasStateDb ? 'yes'.padEnd(6) : 'no'.padEnd(6)} | ${labelTrunc}\n`;
    }
    
    // Add summary
    text += `\nSummary: ${folders.length} workspace${folders.length !== 1 ? 's' : ''} found`;
    const withDb = folders.filter(f => f.hasStateDb).length;
    text += `, ${withDb} with state.vscdb`;
    
    // Add error summary if any errors occurred
    if (errors.length > 0) {
      text += '\n\nErrors encountered:\n';
      for (const error of errors) {
        text += `- ${error}\n`;
      }
    }
    
    return {
      content: [{ type: 'text' as const, text }],
    };
  }
}

/**
 * Handle workspace search operations
 */
async function handleWorkspaceSearch(input: any, formatOptions: FormattingOptions) {
  logger.info('Handling workspace search operation');
  
  if (!input.query) {
    throw new Error('Search mode requires a query');
  }
  
  const fs = await import('fs/promises');
  const path = await import('path');
  
  // Get search parameters
  const query = input.query.toLowerCase();
  const searchType = input.filters?.searchType || 'content';
  const limit = input.options?.limit || 10;
  const includeInactive = input.filters?.includeInactive || false;
  const includeScore = input.options?.includeScore !== false;
  
  logger.info(`Workspace search: query="${query}", type=${searchType}, limit=${limit}`);
  
  // Discover all workspaces
  const workspaceStorageDir = path.join(
    process.env.HOME || process.env.USERPROFILE || '',
    'AppData', 'Roaming', 'Cursor', 'User', 'workspaceStorage'
  );
  
  let searchResults: Array<{
    workspace: WorkspaceFolder;
    analysis?: WorkspaceAnalysis;
    score: number;
    matchReason: string;
  }> = [];
  
  try {
    const entries = await fs.readdir(workspaceStorageDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        try {
          const folderPath = path.join(workspaceStorageDir, entry.name);
          const stat = await fs.stat(folderPath);
          const stateDbPath = path.join(folderPath, 'state.vscdb');
          
          let hasStateDb = false;
          let workspace: WorkspaceFolder;
          let analysis: WorkspaceAnalysis | null = null;
          
          try {
            await fs.access(stateDbPath);
            hasStateDb = true;
            
            // Get workspace analysis for search
            analysis = await analyzeWorkspaceFromDb(entry.name, stateDbPath);
            
            workspace = {
              id: entry.name,
              lastModified: stat.mtime.toISOString(),
              creationDate: stat.birthtime.toISOString(),
              label: analysis?.smartLabel || await extractWorkspaceLabel(stateDbPath, entry.name),
              hasStateDb,
              promptCount: analysis?.metrics.promptCount,
              generationCount: analysis?.metrics.generationCount
            };
          } catch {
            // No state.vscdb, create basic workspace info
            workspace = {
              id: entry.name,
              lastModified: stat.mtime.toISOString(),
              creationDate: stat.birthtime.toISOString(),
              label: '(no database)',
              hasStateDb: false
            };
          }
          
          // Calculate search score and match reason
          const searchResult = calculateSearchScore(workspace, analysis, query, searchType);
          
          if (searchResult.score > 0) {
            // Filter out inactive workspaces if requested
            if (!includeInactive && analysis?.currentStatus === 'Abandoned') {
              continue;
            }
            
            searchResults.push({
              workspace,
              analysis: analysis || undefined,
              score: searchResult.score,
              matchReason: searchResult.reason
            });
          }
        } catch (err: any) {
          logger.warn(`Error processing workspace ${entry.name}:`, err);
          continue;
        }
      }
    }
    
    // Sort by score (highest first) and limit results
    searchResults.sort((a, b) => b.score - a.score);
    searchResults = searchResults.slice(0, limit);
    
    // Format results
    if (searchResults.length === 0) {
      return {
        content: [{ 
          type: 'text' as const, 
          text: `No workspaces found matching "${input.query}"` 
        }],
      };
    }
    
    let output = `🔍 **Workspace Search Results** (${searchResults.length} matches for "${input.query}")\n\n`;
    
    searchResults.forEach((result, index) => {
      const { workspace, analysis, score, matchReason } = result;
      const scoreDisplay = includeScore ? ` (${Math.round(score * 100)}%)` : '';
      const activityIcon = analysis ? getActivityIcon(analysis.currentStatus) : '📁';
      const techStack = analysis?.technologies.slice(0, 2).join(', ') || 'Unknown';
      
      output += `${index + 1}. **${workspace.label}**${scoreDisplay}\n`;
      output += `   ${activityIcon} ${analysis?.currentStatus || 'Unknown'} | ${techStack}\n`;
      output += `   💡 Match: ${matchReason}\n`;
      output += `   🆔 ID: \`${workspace.id.substring(0, 16)}...\`\n`;
      
      if (analysis?.currentGoals && analysis.currentGoals.length > 0) {
        output += `   🎯 Goal: ${analysis.currentGoals[0]}\n`;
      }
      
      output += '\n';
    });
    
    return {
      content: [{ type: 'text' as const, text: output }],
    };
    
  } catch (error: any) {
    logger.error('Workspace search error:', error);
    throw new Error(`Workspace search failed: ${error.message}`);
  }
}

/**
 * Handle workspace analysis operations
 */
async function handleWorkspaceAnalyze(input: any, formatOptions: FormattingOptions) {
  logger.info('Handling workspace analyze operation');
  
  if (!input.workspaceId) {
    return {
      content: [{ 
        type: 'text' as const, 
        text: formatError('workspaceId is required for workspace analysis') 
      }],
      isError: true,
    };
  }

  const fs = await import('fs/promises');
  const path = await import('path');
  
  // Find the workspace database
  const workspaceStorageDir = path.join(
    process.env.HOME || process.env.USERPROFILE || '',
    'AppData', 'Roaming', 'Cursor', 'User', 'workspaceStorage'
  );
  
  const dbPath = path.join(workspaceStorageDir, input.workspaceId, 'state.vscdb');
  
  try {
    await fs.access(dbPath);
  } catch (err: any) {
    return {
      content: [{ 
        type: 'text' as const, 
        text: formatError(`Workspace ${input.workspaceId} not found or has no database`) 
      }],
      isError: true,
    };
  }

  // Analyze the workspace
  const analysis = await analyzeWorkspaceFromDb(input.workspaceId, dbPath);
  if (!analysis) {
    return {
      content: [{ 
        type: 'text' as const, 
        text: formatError(`Could not analyze workspace ${input.workspaceId}`) 
      }],
      isError: true,
    };
  }

  // Format output based on requested format
  if (formatOptions.format === 'json') {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(analysis, null, 2) }],
    };
  } else {
    const formattedAnalysis = formatWorkspaceAnalysis(analysis);
    return {
      content: [{ type: 'text' as const, text: formattedAnalysis }],
    };
  }
}

/**
 * Handle workspace discovery operations
 */
async function handleWorkspaceDiscover(input: any, formatOptions: FormattingOptions) {
  logger.info('Handling workspace discover operation');
  
  if (!input.query) {
    throw new Error('Discover mode requires a query with natural language description');
  }
  
  const fs = await import('fs/promises');
  const path = await import('path');
  
  // Parse natural language query for intent
  const query = input.query.toLowerCase();
  const limit = input.options?.limit || 5;
  
  logger.info(`Natural language workspace discovery: "${input.query}"`);
  
  // Discover all workspaces
  const workspaceStorageDir = path.join(
    process.env.HOME || process.env.USERPROFILE || '',
    'AppData', 'Roaming', 'Cursor', 'User', 'workspaceStorage'
  );
  
  let discoveryResults: Array<{
    workspace: WorkspaceFolder;
    analysis?: WorkspaceAnalysis;
    score: number;
    matchReason: string;
  }> = [];
  
  try {
    const entries = await fs.readdir(workspaceStorageDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        try {
          const folderPath = path.join(workspaceStorageDir, entry.name);
          const stat = await fs.stat(folderPath);
          const stateDbPath = path.join(folderPath, 'state.vscdb');
          
          let hasStateDb = false;
          let workspace: WorkspaceFolder;
          let analysis: WorkspaceAnalysis | null = null;
          
          try {
            await fs.access(stateDbPath);
            hasStateDb = true;
            analysis = await analyzeWorkspaceFromDb(entry.name, stateDbPath);
            
            workspace = {
              id: entry.name,
              lastModified: stat.mtime.toISOString(),
              creationDate: stat.birthtime.toISOString(),
              label: analysis?.smartLabel || await extractWorkspaceLabel(stateDbPath, entry.name),
              hasStateDb,
              promptCount: analysis?.metrics.promptCount,
              generationCount: analysis?.metrics.generationCount
            };
          } catch {
            continue; // Skip workspaces without databases for discovery
          }
          
          // Calculate natural language discovery score
          const discoveryResult = calculateNaturalLanguageScore(workspace, analysis, query);
          
          if (discoveryResult.score > 0.1) { // Higher threshold for discovery
            discoveryResults.push({
              workspace,
              analysis: analysis || undefined,
              score: discoveryResult.score,
              matchReason: discoveryResult.reason
            });
          }
        } catch (err: any) {
          logger.warn(`Error processing workspace ${entry.name}:`, err);
          continue;
        }
      }
    }
    
    // Sort by score and limit results
    discoveryResults.sort((a, b) => b.score - a.score);
    discoveryResults = discoveryResults.slice(0, limit);
    
    if (discoveryResults.length === 0) {
      return {
        content: [{ 
          type: 'text' as const, 
          text: `No workspaces found matching the description: "${input.query}"\n\nTry being more specific about:\n- Technologies used (React, Python, etc.)\n- Project type (web app, API, etc.)\n- What you were building or working on` 
        }],
      };
    }
    
    let output = `🧠 **Natural Language Workspace Discovery**\n`;
    output += `Query: "${input.query}"\n\n`;
    
    discoveryResults.forEach((result, index) => {
      const { workspace, analysis, score, matchReason } = result;
      const confidence = Math.round(score * 100);
      const activityIcon = analysis ? getActivityIcon(analysis.currentStatus) : '📁';
      const techStack = analysis?.technologies.slice(0, 3).join(', ') || 'Unknown';
      
      output += `${index + 1}. **${workspace.label}** (${confidence}% match)\n`;
      output += `   ${activityIcon} ${analysis?.currentStatus || 'Unknown'} | ${techStack}\n`;
      output += `   🔍 Why this matches: ${matchReason}\n`;
      output += `   🆔 ID: \`${workspace.id.substring(0, 16)}...\`\n`;
      
      if (analysis?.activitySummary) {
        const summary = analysis.activitySummary.length > 100 
          ? analysis.activitySummary.substring(0, 97) + '...'
          : analysis.activitySummary;
        output += `   📝 ${summary}\n`;
      }
      
      output += '\n';
    });
    
    return {
      content: [{ type: 'text' as const, text: output }],
    };
    
  } catch (error: any) {
    logger.error('Workspace discovery error:', error);
    throw new Error(`Workspace discovery failed: ${error.message}`);
  }
}

/**
 * Handle workspace wizard operations
 */
async function handleWorkspaceWizard(input: any, formatOptions: FormattingOptions) {
  logger.info('Handling workspace wizard operation');
  
  const intent = input.wizard?.intent || input.query || '';
  const currentProject = input.wizard?.currentProject;
  const preferences = input.wizard?.preferences || {};
  const stepMode = input.wizard?.stepMode || false;
  
  if (!intent) {
    // Provide initial guidance
    return {
      content: [{ 
        type: 'text' as const, 
        text: `🧙‍♂️ **Workspace Discovery Wizard**

I'll help you find the right workspace! Tell me what you're looking for:

**Examples:**
- "I want to work on my React chat application"
- "Find the project where I was learning Python"
- "Show me the workspace with the API I was building"
- "I need the project where I was fixing database issues"

**Or describe your intent:**
- What are you trying to accomplish?
- What technology are you working with?
- What type of project is it?

Just describe what you're looking for in natural language!` 
      }],
    };
  }
  
  const fs = await import('fs/promises');
  const path = await import('path');
  
  logger.info(`Workspace wizard: intent="${intent}", stepMode=${stepMode}`);
  
  // Analyze the intent to provide guided discovery
  const intentAnalysis = analyzeUserIntent(intent);
  
  // Discover workspaces based on intent
  const workspaceStorageDir = path.join(
    process.env.HOME || process.env.USERPROFILE || '',
    'AppData', 'Roaming', 'Cursor', 'User', 'workspaceStorage'
  );
  
  let recommendations: Array<{
    workspace: WorkspaceFolder;
    analysis?: WorkspaceAnalysis;
    score: number;
    matchReason: string;
    confidence: 'high' | 'medium' | 'low';
  }> = [];
  
  try {
    const entries = await fs.readdir(workspaceStorageDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        try {
          const folderPath = path.join(workspaceStorageDir, entry.name);
          const stat = await fs.stat(folderPath);
          const stateDbPath = path.join(folderPath, 'state.vscdb');
          
          let hasStateDb = false;
          let workspace: WorkspaceFolder;
          let analysis: WorkspaceAnalysis | null = null;
          
          try {
            await fs.access(stateDbPath);
            hasStateDb = true;
            analysis = await analyzeWorkspaceFromDb(entry.name, stateDbPath);
            
            workspace = {
              id: entry.name,
              lastModified: stat.mtime.toISOString(),
              creationDate: stat.birthtime.toISOString(),
              label: analysis?.smartLabel || await extractWorkspaceLabel(stateDbPath, entry.name),
              hasStateDb,
              promptCount: analysis?.metrics.promptCount,
              generationCount: analysis?.metrics.generationCount
            };
          } catch {
            continue; // Skip workspaces without databases
          }
          
          // Apply preferences filtering
          if (preferences.recency === 'recent') {
            const daysSinceModified = (Date.now() - new Date(workspace.lastModified).getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceModified > 7) continue;
          } else if (preferences.recency === 'active') {
            if (analysis?.currentStatus !== 'Active') continue;
          }
          
          if (preferences.collaboration === true && analysis?.collaborators && analysis.collaborators.length === 0) {
            continue;
          } else if (preferences.collaboration === false && analysis?.collaborators && analysis.collaborators.length > 0) {
            continue;
          }
          
          // Calculate wizard score
          const wizardResult = calculateWizardScore(workspace, analysis, intentAnalysis, preferences);
          
          if (wizardResult.score > 0.1) {
            recommendations.push({
              workspace,
              analysis: analysis || undefined,
              score: wizardResult.score,
              matchReason: wizardResult.reason,
              confidence: wizardResult.score > 0.7 ? 'high' : wizardResult.score > 0.4 ? 'medium' : 'low'
            });
          }
        } catch (err: any) {
          logger.warn(`Error processing workspace ${entry.name}:`, err);
          continue;
        }
      }
    }
    
    // Sort by score and group by confidence
    recommendations.sort((a, b) => b.score - a.score);
    
    if (recommendations.length === 0) {
      return {
        content: [{ 
          type: 'text' as const, 
          text: `🤔 **No Perfect Matches Found**

Based on your request: "${intent}"

I couldn't find workspaces that closely match your description. Here are some suggestions:

1. **Be more specific** - Try mentioning:
   - Technologies (React, Python, Node.js, etc.)
   - Project type (web app, API, mobile app, etc.)
   - Specific features you were working on

2. **Check if you have workspaces** - Make sure you have some Cursor workspaces with conversation history

3. **Try different keywords** - Use alternative terms for what you're looking for

**Example:** Instead of "my project", try "the React chat app I was building" or "the Python data analysis project"` 
        }],
      };
    }
    
    // Format wizard response
    let output = `🧙‍♂️ **Workspace Discovery Wizard Results**\n`;
    output += `Your request: "${intent}"\n\n`;
    
    // Show analysis of intent
    if (intentAnalysis.technologies.length > 0 || intentAnalysis.projectType || intentAnalysis.action) {
      output += `🔍 **What I understood:**\n`;
      if (intentAnalysis.action) output += `- Action: ${intentAnalysis.action}\n`;
      if (intentAnalysis.projectType) output += `- Project type: ${intentAnalysis.projectType}\n`;
      if (intentAnalysis.technologies.length > 0) output += `- Technologies: ${intentAnalysis.technologies.join(', ')}\n`;
      output += '\n';
    }
    
    // Group by confidence level
    const highConfidence = recommendations.filter(r => r.confidence === 'high');
    const mediumConfidence = recommendations.filter(r => r.confidence === 'medium');
    const lowConfidence = recommendations.filter(r => r.confidence === 'low');
    
    if (highConfidence.length > 0) {
      output += `✅ **High Confidence Matches** (${highConfidence.length})\n`;
      highConfidence.slice(0, 3).forEach((rec, index) => {
        output += formatWizardRecommendation(rec, index + 1);
      });
      output += '\n';
    }
    
    if (mediumConfidence.length > 0 && highConfidence.length < 3) {
      output += `🤔 **Possible Matches** (${mediumConfidence.length})\n`;
      mediumConfidence.slice(0, 3 - highConfidence.length).forEach((rec, index) => {
        output += formatWizardRecommendation(rec, highConfidence.length + index + 1);
      });
      output += '\n';
    }
    
    if (stepMode && recommendations.length > 1) {
      output += `**🎯 Next Steps:**\n`;
      output += `1. Review the matches above\n`;
      output += `2. Use the workspace ID to analyze further\n`;
      output += `3. Or refine your search with more specific details\n\n`;
    }
    
    // Provide suggestions for better results
    if (recommendations.length > 0 && recommendations[0].confidence !== 'high') {
      output += `💡 **Tips for better results:**\n`;
      output += `- Be more specific about technologies or features\n`;
      output += `- Mention what you were trying to accomplish\n`;
      output += `- Include timeframe if relevant (recent, last week, etc.)\n`;
    }
    
    return {
      content: [{ type: 'text' as const, text: output }],
    };
    
  } catch (error: any) {
    logger.error('Workspace wizard error:', error);
    throw new Error(`Workspace wizard failed: ${error.message}`);
  }
}

/**
 * Helper function to extract a human-friendly label from workspace database.
 * 
 * This function connects to a workspace's state.vscdb file and extracts the first
 * prompt text from aiService.prompts to use as a human-readable workspace label.
 * The label is cleaned and truncated for display purposes.
 * 
 * @param dbPath - Full path to the state.vscdb file
 * @param workspaceId - Workspace ID for logging purposes
 * @returns Promise resolving to a human-friendly label string
 */
async function extractWorkspaceLabel(dbPath: string, workspaceId: string): Promise<string> {
  return new Promise((resolve) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        resolve('(db error)');
        return;
      }
    });

    // Set a short timeout for label extraction
    const timeout = setTimeout(() => {
      db.close();
      resolve('(timeout)');
    }, 3000);

    // Try to get the first prompt as a label
    db.get("SELECT value FROM ItemTable WHERE key = 'aiService.prompts';", [], (err, row) => {
      clearTimeout(timeout);
      if (err || !row) {
        db.close();
        resolve('(no prompts)');
        return;
      }

      try {
        const promptsData = JSON.parse((row as any).value.toString());
        if (Array.isArray(promptsData) && promptsData.length > 0 && promptsData[0].text) {
          let firstPrompt = promptsData[0].text.trim();
          // Clean up and truncate the prompt for use as a label
          firstPrompt = firstPrompt.replace(/\n/g, ' ').replace(/\s+/g, ' ');
          if (firstPrompt.length > 60) {
            firstPrompt = firstPrompt.substring(0, 57) + '...';
          }
          db.close();
          resolve(firstPrompt);
        } else {
          db.close();
          resolve('(empty prompts)');
        }
      } catch (parseErr) {
        db.close();
        resolve('(parse error)');
      }
    });
  });
}

/**
 * Analyze workspace from database path
 */
async function analyzeWorkspaceFromDb(workspaceId: string, dbPath: string): Promise<WorkspaceAnalysis | null> {
  return new Promise((resolve) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        logger.error(`Failed to connect to database: ${err}`);
        return resolve(null);
      }

      db.get("SELECT value FROM ItemTable WHERE key = 'aiService.prompts'", (err, promptsRow: any) => {
        if (err) {
          db.close();
          return resolve(null);
        }

        db.get("SELECT value FROM ItemTable WHERE key = 'aiService.generations'", (err, generationsRow: any) => {
          if (err) {
            db.close();
            return resolve(null);
          }

          db.get("SELECT value FROM ItemTable WHERE key = 'composer.composerData'", (err, composerRow: any) => {
            db.close();

            try {
              const conversationData: ConversationData = {
                prompts: promptsRow?.value ? JSON.parse(promptsRow.value.toString()) : [],
                generations: generationsRow?.value ? JSON.parse(generationsRow.value.toString()) : []
              };

              const composerData = composerRow?.value ? JSON.parse(composerRow.value.toString()) : null;
              const composerSessions: ComposerSession[] = composerData?.allComposers || [];

              analyzeWorkspaceContent(workspaceId, conversationData, composerSessions)
                .then(resolve)
                .catch(() => resolve(null));

            } catch (parseError) {
              logger.error('Parse error:', parseError);
              resolve(null);
            }
          });
        });
      });
    });
  });
}

/**
 * Format workspace analysis for display
 */
function formatWorkspaceAnalysis(analysis: WorkspaceAnalysis): string {
  const confidence = Math.round(analysis.confidence * 100);
  const activityIcon = getActivityIcon(analysis.currentStatus);
  
  let output = [
    `# 🧠 **Workspace Intelligence Report**`,
    `## ${analysis.smartLabel}`,
    '',
    `**📊 Overview**`,
    `- **ID:** \`${analysis.id.substring(0, 16)}...\``,
    `- **Project Type:** ${analysis.projectType}`,
    `- **Status:** ${activityIcon} ${analysis.currentStatus}`,
    `- **Primary Technology:** ${analysis.primaryTechnology}`,
    `- **Analysis Confidence:** ${confidence}%`,
    '',
    `**🛠️ Technology Stack**`,
    analysis.technologies.length > 0 
      ? analysis.technologies.map(tech => `- ${tech}`).join('\n')
      : '- None detected',
    '',
    `**📈 Activity Summary**`,
    analysis.activitySummary,
    '',
    `**🎯 Current Goals**`,
    analysis.currentGoals.length > 0 
      ? analysis.currentGoals.map(goal => `- ${goal}`).join('\n')
      : '- None identified',
    '',
    `**✅ Problems Solved**`,
    analysis.problemsSolved.length > 0 
      ? analysis.problemsSolved.map(problem => `- ${problem}`).join('\n')
      : '- None tracked',
    '',
    `**🔑 Key Topics**`,
    analysis.keyTopics.length > 0 
      ? analysis.keyTopics.slice(0, 8).map(topic => `- ${topic}`).join('\n')
      : '- None identified',
    '',
    `**📊 Detailed Metrics**`,
    `- **Conversations:** ${analysis.metrics.promptCount} prompts → ${analysis.metrics.generationCount} responses`,
    `- **Code Changes:** ${analysis.metrics.codeChanges} file applications`,
    `- **Sessions:** ${analysis.timeInvestment.sessionsCount} composer sessions`,
    `- **Time Investment:** ${analysis.timeInvestment.totalHours} hours total`,
    `- **Average Session:** ${analysis.timeInvestment.averageSessionLength} hours`,
    `- **Last Activity:** ${formatDate(analysis.lastActivity)}`,
    ''
  ];

  // Add recommendations if confidence is low
  if (analysis.confidence < 0.5) {
    output.push(`**⚠️ Analysis Notes**`);
    output.push(`Analysis confidence is ${confidence}%. This may indicate:`);
    output.push(`- Limited conversation data available`);
    output.push(`- Generic or unclear project context`);
    output.push(`- Early stage project with minimal activity`);
    output.push('');
  }

  return output.join('\n');
}

/**
 * Get activity icon for status
 */
function getActivityIcon(status: string): string {
  const icons = {
    'Setup': '🔧',
    'Active': '🚀',
    'Problem Solving': '🐛',
    'Documentation': '📝',
    'Complete': '✅',
    'Abandoned': '💤'
  };
  return icons[status as keyof typeof icons] || '📊';
}

/**
 * Format date for display
 */
function formatDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString();
}

/**
 * Calculate search relevance score based on query and search type
 */
function calculateSearchScore(
  workspace: WorkspaceFolder, 
  analysis: WorkspaceAnalysis | null, 
  query: string, 
  searchType: string
): { score: number; reason: string } {
  let score = 0;
  let reasons: string[] = [];
  
  // Normalize strings for comparison
  const label = workspace.label.toLowerCase();
  const queryWords = query.split(/\s+/).filter(word => word.length > 2);
  
  // Label matching (highest weight)
  queryWords.forEach(word => {
    if (label.includes(word)) {
      score += 0.4;
      reasons.push(`label contains "${word}"`);
    }
  });
  
  if (!analysis) {
    return { 
      score: score > 0 ? score * 0.5 : 0, // Reduce score for workspaces without analysis
      reason: reasons.length > 0 ? reasons.join(', ') : 'no detailed analysis available'
    };
  }
  
  // Technology matching
  if (searchType === 'technology' || searchType === 'content' || searchType === 'all') {
    analysis.technologies.forEach(tech => {
      if (tech.toLowerCase().includes(query) || query.includes(tech.toLowerCase())) {
        score += 0.3;
        reasons.push(`uses ${tech}`);
      }
    });
    
    // Check primary technology
    if (analysis.primaryTechnology.toLowerCase().includes(query)) {
      score += 0.2;
      reasons.push(`primary tech: ${analysis.primaryTechnology}`);
    }
  }
  
  // Project type matching
  if (analysis.projectType.toLowerCase().includes(query)) {
    score += 0.2;
    reasons.push(`project type: ${analysis.projectType}`);
  }
  
  // Key topics matching
  if (searchType === 'content' || searchType === 'all') {
    analysis.keyTopics.forEach(topic => {
      queryWords.forEach(word => {
        if (topic.toLowerCase().includes(word)) {
          score += 0.1;
          reasons.push(`topic: ${topic}`);
        }
      });
    });
  }
  
  // Problem/solution matching
  if (searchType === 'problem' || searchType === 'solution' || searchType === 'all') {
    analysis.problemsSolved.forEach(problem => {
      queryWords.forEach(word => {
        if (problem.toLowerCase().includes(word)) {
          score += 0.15;
          reasons.push(`solved: ${problem}`);
        }
      });
    });
    
    analysis.currentGoals.forEach(goal => {
      queryWords.forEach(word => {
        if (goal.toLowerCase().includes(word)) {
          score += 0.1;
          reasons.push(`goal: ${goal}`);
        }
      });
    });
  }
  
  // Activity summary matching
  if (analysis.activitySummary) {
    const activityLower = analysis.activitySummary.toLowerCase();
    queryWords.forEach(word => {
      if (activityLower.includes(word)) {
        score += 0.05;
        reasons.push(`activity mentions "${word}"`);
      }
    });
  }
  
  // Boost recent/active workspaces slightly
  if (analysis.currentStatus === 'Active') {
    score += 0.05;
  }
  
  return { 
    score: Math.min(score, 1.0), // Cap at 1.0
    reason: reasons.length > 0 ? reasons.slice(0, 3).join(', ') : 'weak match'
  };
}

/**
 * Calculate natural language discovery score for workspace descriptions
 */
function calculateNaturalLanguageScore(
  workspace: WorkspaceFolder,
  analysis: WorkspaceAnalysis | null,
  query: string
): { score: number; reason: string } {
  if (!analysis) {
    return { score: 0, reason: 'no analysis available' };
  }
  
  let score = 0;
  let reasons: string[] = [];
  
  // Normalize query
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(word => word.length > 2);
  
  // Intent detection patterns
  const intentPatterns = {
    building: ['build', 'building', 'create', 'creating', 'develop', 'developing', 'make', 'making'],
    working: ['work', 'working', 'project', 'app', 'application', 'site', 'website'],
    learning: ['learn', 'learning', 'tutorial', 'practice', 'study', 'studying'],
    fixing: ['fix', 'fixing', 'debug', 'debugging', 'error', 'bug', 'problem'],
    chat: ['chat', 'messaging', 'message', 'talk', 'conversation'],
    api: ['api', 'service', 'server', 'backend', 'endpoint'],
    web: ['web', 'website', 'site', 'frontend', 'ui', 'interface'],
    mobile: ['mobile', 'app', 'ios', 'android', 'phone'],
    data: ['data', 'database', 'db', 'analytics', 'analysis']
  };
  
  // Check for intent matches in workspace
  Object.entries(intentPatterns).forEach(([intent, patterns]) => {
    const hasQueryIntent = patterns.some(pattern => queryLower.includes(pattern));
    if (hasQueryIntent) {
      // Check if workspace matches this intent
      const workspaceText = [
        analysis.smartLabel,
        analysis.projectType,
        analysis.activitySummary,
        ...analysis.keyTopics,
        ...analysis.currentGoals
      ].join(' ').toLowerCase();
      
      const hasWorkspaceMatch = patterns.some(pattern => workspaceText.includes(pattern));
      if (hasWorkspaceMatch) {
        score += 0.3;
        reasons.push(`${intent} project match`);
      }
    }
  });
  
  // Technology mentions
  analysis.technologies.forEach(tech => {
    if (queryLower.includes(tech.toLowerCase()) || tech.toLowerCase().includes(queryLower)) {
      score += 0.25;
      reasons.push(`${tech} technology`);
    }
  });
  
  // Direct text matching in key areas
  const searchableText = [
    analysis.smartLabel,
    analysis.activitySummary,
    ...analysis.keyTopics.slice(0, 5),
    ...analysis.currentGoals.slice(0, 3),
    ...analysis.problemsSolved.slice(0, 3)
  ].join(' ').toLowerCase();
  
  queryWords.forEach(word => {
    if (searchableText.includes(word)) {
      score += 0.1;
      reasons.push(`mentions "${word}"`);
    }
  });
  
  // Project type matching
  if (queryLower.includes(analysis.projectType.toLowerCase()) || 
      analysis.projectType.toLowerCase().includes(queryLower)) {
    score += 0.2;
    reasons.push(`${analysis.projectType} type`);
  }
  
  // Boost based on confidence and activity
  score *= analysis.confidence;
  if (analysis.currentStatus === 'Active') {
    score *= 1.1;
  }
  
  return {
    score: Math.min(score, 1.0),
    reason: reasons.length > 0 ? reasons.slice(0, 3).join(', ') : 'general content match'
  };
}

/**
 * Analyze user intent from natural language input
 */
function analyzeUserIntent(intent: string): {
  action?: string;
  projectType?: string;
  technologies: string[];
  keywords: string[];
} {
  const intentLower = intent.toLowerCase();
  const result = {
    action: undefined as string | undefined,
    projectType: undefined as string | undefined,
    technologies: [] as string[],
    keywords: [] as string[]
  };
  
  // Detect action intent
  const actionPatterns = {
    'work on': ['work on', 'working on', 'continue', 'resume'],
    'find': ['find', 'show', 'locate', 'where is'],
    'build': ['build', 'building', 'create', 'creating', 'develop'],
    'learn': ['learn', 'learning', 'study', 'tutorial'],
    'fix': ['fix', 'debug', 'solve', 'troubleshoot']
  };
  
  for (const [action, patterns] of Object.entries(actionPatterns)) {
    if (patterns.some(pattern => intentLower.includes(pattern))) {
      result.action = action;
      break;
    }
  }
  
  // Detect project type
  const projectTypePatterns = {
    'Web Application': ['web app', 'website', 'web application', 'frontend', 'backend'],
    'API': ['api', 'rest api', 'service', 'endpoint', 'server'],
    'Mobile App': ['mobile app', 'ios app', 'android app', 'mobile'],
    'Chat App': ['chat', 'messaging', 'chat app', 'messenger'],
    'Learning Project': ['tutorial', 'learning', 'practice', 'course'],
    'Data Analysis': ['data', 'analytics', 'analysis', 'visualization']
  };
  
  for (const [type, patterns] of Object.entries(projectTypePatterns)) {
    if (patterns.some(pattern => intentLower.includes(pattern))) {
      result.projectType = type;
      break;
    }
  }
  
  // Detect technologies
  const techPatterns = [
    'react', 'vue', 'angular', 'svelte',
    'node', 'express', 'fastapi', 'django', 'flask',
    'typescript', 'javascript', 'python', 'java', 'go', 'rust',
    'mongodb', 'postgres', 'mysql', 'sqlite',
    'docker', 'kubernetes', 'aws', 'azure'
  ];
  
  techPatterns.forEach(tech => {
    if (intentLower.includes(tech)) {
      result.technologies.push(tech);
    }
  });
  
  // Extract keywords (words longer than 3 characters, excluding common words)
  const commonWords = ['the', 'and', 'for', 'with', 'was', 'were', 'that', 'this', 'have', 'had'];
  result.keywords = intentLower
    .split(/\s+/)
    .filter(word => word.length > 3 && !commonWords.includes(word))
    .slice(0, 10); // Limit to 10 keywords
  
  return result;
}

/**
 * Calculate wizard-specific scoring for workspace recommendations
 */
function calculateWizardScore(
  workspace: WorkspaceFolder,
  analysis: WorkspaceAnalysis | null,
  intentAnalysis: ReturnType<typeof analyzeUserIntent>,
  preferences: any
): { score: number; reason: string } {
  if (!analysis) {
    return { score: 0, reason: 'no analysis available' };
  }
  
  let score = 0;
  let reasons: string[] = [];
  
  // Action-based scoring
  if (intentAnalysis.action) {
    switch (intentAnalysis.action) {
      case 'work on':
      case 'continue':
        if (analysis.currentStatus === 'Active') {
          score += 0.3;
          reasons.push('active project');
        }
        break;
      case 'learn':
        if (analysis.projectType.includes('Learning')) {
          score += 0.4;
          reasons.push('learning project');
        }
        break;
      case 'fix':
        if (analysis.currentStatus === 'Problem Solving') {
          score += 0.3;
          reasons.push('problem-solving project');
        }
        break;
    }
  }
  
  // Project type matching
  if (intentAnalysis.projectType && analysis.projectType.includes(intentAnalysis.projectType)) {
    score += 0.4;
    reasons.push(`${intentAnalysis.projectType} match`);
  }
  
  // Technology matching with higher weight
  intentAnalysis.technologies.forEach(tech => {
    if (analysis.technologies.some(t => t.toLowerCase().includes(tech))) {
      score += 0.3;
      reasons.push(`${tech} technology`);
    }
  });
  
  // Keyword matching in key areas
  const searchableText = [
    analysis.smartLabel,
    analysis.activitySummary,
    ...analysis.keyTopics.slice(0, 5),
    ...analysis.currentGoals.slice(0, 3)
  ].join(' ').toLowerCase();
  
  intentAnalysis.keywords.forEach(keyword => {
    if (searchableText.includes(keyword)) {
      score += 0.1;
      reasons.push(`mentions "${keyword}"`);
    }
  });
  
  // Preference-based adjustments
  if (preferences.recency === 'recent') {
    const daysSinceModified = (Date.now() - new Date(workspace.lastModified).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceModified <= 7) {
      score += 0.1;
      reasons.push('recent activity');
    }
  }
  
  if (preferences.complexity) {
    const complexity = analysis.metrics.promptCount > 50 ? 'complex' : 
                     analysis.metrics.promptCount > 20 ? 'moderate' : 'simple';
    if (complexity === preferences.complexity) {
      score += 0.1;
      reasons.push(`${complexity} complexity`);
    }
  }
  
  // Boost based on analysis confidence
  score *= analysis.confidence;
  
  return {
    score: Math.min(score, 1.0),
    reason: reasons.length > 0 ? reasons.slice(0, 3).join(', ') : 'general match'
  };
}

/**
 * Format a wizard recommendation for display
 */
function formatWizardRecommendation(
  recommendation: {
    workspace: WorkspaceFolder;
    analysis?: WorkspaceAnalysis;
    score: number;
    matchReason: string;
    confidence: 'high' | 'medium' | 'low';
  },
  index: number
): string {
  const { workspace, analysis, score, matchReason, confidence } = recommendation;
  const confidenceIcon = confidence === 'high' ? '🎯' : confidence === 'medium' ? '🤔' : '💭';
  const activityIcon = analysis ? getActivityIcon(analysis.currentStatus) : '📁';
  const techStack = analysis?.technologies.slice(0, 2).join(', ') || 'Unknown';
  const scorePercent = Math.round(score * 100);
  
  let output = `${confidenceIcon} **${index}. ${workspace.label}** (${scorePercent}%)\n`;
  output += `   ${activityIcon} ${analysis?.currentStatus || 'Unknown'} | ${techStack}\n`;
  output += `   💡 ${matchReason}\n`;
  output += `   🆔 \`${workspace.id.substring(0, 16)}...\`\n`;
  
  if (analysis?.currentGoals && analysis.currentGoals.length > 0) {
    output += `   🎯 Current goal: ${analysis.currentGoals[0]}\n`;
  }
  
  if (analysis?.timeInvestment && analysis.timeInvestment.totalHours > 0) {
    output += `   ⏱️  ${analysis.timeInvestment.totalHours}h invested\n`;
  }
  
  output += '\n';
  return output;
}

/**
 * Register the workspace intelligence tool with the MCP server
 */
export function registerWorkspaceIntelligence(server: McpServer) {
  server.registerTool(
    'workspace_intelligence',
    {
      title: 'Workspace Intelligence Engine',
      description: 'Ultimate workspace discovery and analysis engine with multiple operation modes',
      inputSchema: workspaceIntelligenceInputSchema,
    },
    handleWorkspaceIntelligence
  );
  
  logger.info('✅ Registered workspace_intelligence super-tool');
} 