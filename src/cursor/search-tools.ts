/**
 * Content Search & Problem Solving Tools
 * 
 * Advanced search capabilities for finding conversations, problems, and solutions
 * across workspace conversation history.
 */

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import sqlite3 from 'sqlite3';
import { logger } from '../lib/logger.js';
import { ConversationData } from './analysis.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Search result interfaces
interface SearchResult {
  workspaceId: string;
  conversationId?: string;
  timestamp: Date;
  type: 'prompt' | 'generation' | 'solution';
  content: string;
  relevanceScore: number;
  contextSnippet: string;
  matchingTerms: string[];
}

interface SimilarProblem {
  workspaceId: string;
  problemDescription: string;
  solutionApproach: string;
  success: boolean;
  relevanceScore: number;
  conversationLink: string;
  technologyStack: string[];
}

interface SolutionPattern {
  id: string;
  problemType: string;
  solution: string;
  steps: string[];
  technologies: string[];
  sourceConversations: string[];
  effectivenessScore: number;
  lastUsed: Date;
}

// Search types for different kinds of content searches
type SearchType = 'content' | 'keywords' | 'technical' | 'problem' | 'solution' | 'all';

// Technology keywords for categorization
const TECH_KEYWORDS = [
  'react', 'vue', 'angular', 'typescript', 'javascript', 'python', 'java', 'node.js',
  'express', 'django', 'flask', 'spring', 'mongodb', 'postgresql', 'mysql', 'docker',
  'kubernetes', 'aws', 'azure', 'git', 'github', 'api', 'database', 'frontend',
  'backend', 'fullstack', 'mobile', 'web', 'app', 'development', 'devops', 'ci/cd'
];

// Problem/solution keywords
const PROBLEM_KEYWORDS = [
  'error', 'bug', 'issue', 'problem', 'fix', 'debug', 'troubleshoot', 'broken',
  'not working', 'failed', 'crash', 'exception', 'help', 'stuck', 'resolve'
];

const SOLUTION_KEYWORDS = [
  'fix', 'solve', 'solution', 'resolved', 'worked', 'success', 'implement',
  'approach', 'method', 'way to', 'how to', 'tutorial', 'guide', 'steps'
];

/**
 * Registers content search tools
 */
export function registerSearchTools(server: McpServer) {
  logger.info('Registering content search tools...');

  /**
   * Search conversations across workspace history
   */
  server.registerTool(
    'searchConversations',
    {
      title: 'Search Conversations',
      description: 'Semantic search across prompts and generations in workspace conversation history.',
      inputSchema: {
        workspaceId: z.string().describe('The workspace ID to search in'),
        query: z.string().describe('Search query text'),
        searchType: z.enum(['content', 'keywords', 'technical', 'problem', 'solution', 'all'])
          .optional()
          .describe('Type of search to perform (default: all)'),
        limit: z.number().optional().describe('Maximum number of results (default: 10)'),
      },
    },
    async (input: { workspaceId: string; query: string; searchType?: string; limit?: number }) => {
      try {
        const { workspaceId, query, searchType = 'all', limit = 10 } = input;
        
        const dbPath = await getWorkspaceDatabasePath(workspaceId);
        if (!dbPath) {
          return {
            content: [{ type: 'text' as const, text: `Workspace ${workspaceId} not found.` }],
            isError: true,
          };
        }

        const results = await searchWorkspaceConversations(dbPath, query, searchType as SearchType, limit);
        const output = formatSearchResults(results, query);

        return {
          content: [{ type: 'text' as const, text: output }],
        };

      } catch (error) {
        logger.error('Error in searchConversations:', error);
        return {
          content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  /**
   * Find similar problems and their solutions
   */
  server.registerTool(
    'findSimilarProblems',
    {
      title: 'Find Similar Problems',
      description: 'Find past conversations that solved similar technical issues.',
      inputSchema: {
        workspaceId: z.string().describe('The workspace ID to search in'),
        problemDescription: z.string().describe('Description of the current problem'),
        limit: z.number().optional().describe('Maximum number of results (default: 5)'),
      },
    },
    async (input: { workspaceId: string; problemDescription: string; limit?: number }) => {
      try {
        const { workspaceId, problemDescription, limit = 5 } = input;
        
        const dbPath = await getWorkspaceDatabasePath(workspaceId);
        if (!dbPath) {
          return {
            content: [{ type: 'text' as const, text: `Workspace ${workspaceId} not found.` }],
            isError: true,
          };
        }

        const problems = await findSimilarProblems(dbPath, problemDescription, limit);
        const output = formatSimilarProblems(problems, problemDescription);

        return {
          content: [{ type: 'text' as const, text: output }],
        };

      } catch (error) {
        logger.error('Error in findSimilarProblems:', error);
        return {
          content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  /**
   * Extract solution patterns from conversations
   */
  server.registerTool(
    'extractSolutions',
    {
      title: 'Extract Solutions',
      description: 'Find and extract solution patterns from conversation history.',
      inputSchema: {
        workspaceId: z.string().describe('The workspace ID to analyze'),
        searchTerm: z.string().optional().describe('Optional search term to filter solutions'),
        limit: z.number().optional().describe('Maximum number of solutions (default: 10)'),
      },
    },
    async (input: { workspaceId: string; searchTerm?: string; limit?: number }) => {
      try {
        const { workspaceId, searchTerm, limit = 10 } = input;
        
        const dbPath = await getWorkspaceDatabasePath(workspaceId);
        if (!dbPath) {
          return {
            content: [{ type: 'text' as const, text: `Workspace ${workspaceId} not found.` }],
            isError: true,
          };
        }

        const solutions = await extractSolutionPatterns(dbPath, searchTerm, limit);
        const output = formatSolutionPatterns(solutions);

        return {
          content: [{ type: 'text' as const, text: output }],
        };

      } catch (error) {
        logger.error('Error in extractSolutions:', error);
        return {
          content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  logger.info('Content search tools registered');
}

/**
 * Get database path for a workspace
 */
async function getWorkspaceDatabasePath(workspaceId: string): Promise<string | null> {
  const workspaceDirs: string[] = [];
  
  // Platform-specific paths
  if (os.platform() === 'win32') {
    const appDataPath = process.env.APPDATA;
    if (appDataPath) {
      workspaceDirs.push(
        path.join(appDataPath, 'Code', 'User', 'workspaceStorage'),
        path.join(appDataPath, 'Cursor', 'User', 'workspaceStorage')
      );
    }
  } else if (os.platform() === 'darwin') {
    const homeDir = os.homedir();
    workspaceDirs.push(
      path.join(homeDir, 'Library', 'Application Support', 'Code', 'User', 'workspaceStorage'),
      path.join(homeDir, 'Library', 'Application Support', 'Cursor', 'User', 'workspaceStorage')
    );
  } else {
    const homeDir = os.homedir();
    workspaceDirs.push(
      path.join(homeDir, '.config', 'Code', 'User', 'workspaceStorage'),
      path.join(homeDir, '.config', 'Cursor', 'User', 'workspaceStorage')
    );
  }

  for (const dir of workspaceDirs) {
    try {
      const dbPath = path.join(dir, workspaceId, 'state.vscdb');
      await fs.access(dbPath);
      return dbPath;
    } catch {
      // Continue to next path
    }
  }

  return null;
}

/**
 * Search workspace conversations with semantic matching
 */
async function searchWorkspaceConversations(
  dbPath: string,
  query: string,
  searchType: SearchType,
  limit: number
): Promise<SearchResult[]> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        return reject(err);
      }

      // Extract conversation data
      db.get(
        'SELECT value FROM ItemTable WHERE key = ?',
        ['aiService.prompts'],
        (err, promptRow: any) => {
          if (err) return reject(err);

          db.get(
            'SELECT value FROM ItemTable WHERE key = ?',
            ['aiService.generations'],
            (err, genRow: any) => {
              if (err) return reject(err);

              db.close();

              try {
                const results: SearchResult[] = [];
                const queryLower = query.toLowerCase();
                const queryTerms = queryLower.split(/\s+/).filter(term => term.length > 2);

                // Process prompts
                if (promptRow?.value) {
                  const prompts = JSON.parse(promptRow.value) || [];
                  for (const prompt of prompts) {
                    const text = (prompt.textDescription || prompt.text || '').toLowerCase();
                    const score = calculateRelevanceScore(text, queryTerms, searchType);
                    
                    if (score > 0.1) { // Minimum relevance threshold
                      results.push({
                        workspaceId: path.basename(path.dirname(dbPath)),
                        conversationId: prompt.generationUUID,
                        timestamp: new Date(prompt.unixMs || Date.now()),
                        type: 'prompt',
                        content: prompt.textDescription || prompt.text || '',
                        relevanceScore: score,
                        contextSnippet: createContextSnippet(text, queryTerms, 150),
                        matchingTerms: findMatchingTerms(text, queryTerms)
                      });
                    }
                  }
                }

                // Process generations
                if (genRow?.value) {
                  const generations = JSON.parse(genRow.value) || [];
                  for (const gen of generations) {
                    const text = (gen.textDescription || '').toLowerCase();
                    const score = calculateRelevanceScore(text, queryTerms, searchType);
                    
                    if (score > 0.1) {
                      results.push({
                        workspaceId: path.basename(path.dirname(dbPath)),
                        conversationId: gen.generationUUID,
                        timestamp: new Date(gen.unixMs || Date.now()),
                        type: gen.type === 'apply' ? 'solution' : 'generation',
                        content: gen.textDescription || '',
                        relevanceScore: score,
                        contextSnippet: createContextSnippet(text, queryTerms, 150),
                        matchingTerms: findMatchingTerms(text, queryTerms)
                      });
                    }
                  }
                }

                // Sort by relevance and limit results
                results.sort((a, b) => b.relevanceScore - a.relevanceScore);
                resolve(results.slice(0, limit));

              } catch (parseError) {
                reject(parseError);
              }
            }
          );
        }
      );
    });
  });
}

/**
 * Find problems similar to the given description
 */
async function findSimilarProblems(
  dbPath: string,
  problemDescription: string,
  limit: number
): Promise<SimilarProblem[]> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        return reject(err);
      }

      // Get conversation data
      db.get(
        'SELECT value FROM ItemTable WHERE key = ?',
        ['aiService.prompts'],
        (err, promptRow: any) => {
          if (err) return reject(err);

          db.get(
            'SELECT value FROM ItemTable WHERE key = ?',
            ['aiService.generations'],
            (err, genRow: any) => {
              if (err) return reject(err);

              db.close();

              try {
                const problems: SimilarProblem[] = [];
                const problemLower = problemDescription.toLowerCase();
                const problemTerms = problemLower.split(/\s+/).filter(term => term.length > 2);

                // Find problem-related conversations
                if (promptRow?.value) {
                  const prompts = JSON.parse(promptRow.value) || [];
                  const generations = genRow?.value ? JSON.parse(genRow.value) || [] : [];

                  for (const prompt of prompts) {
                    const text = (prompt.textDescription || prompt.text || '').toLowerCase();
                    
                    // Check if this looks like a problem description
                    if (containsProblemKeywords(text)) {
                      const similarity = calculateProblemSimilarity(text, problemTerms);
                      
                      if (similarity > 0.2) {
                        // Find corresponding solution
                        const solution = findCorrespondingSolution(prompt.generationUUID, generations);
                        
                        problems.push({
                          workspaceId: path.basename(path.dirname(dbPath)),
                          problemDescription: prompt.textDescription || prompt.text || '',
                          solutionApproach: solution?.textDescription || 'No solution found',
                          success: solution ? solution.type === 'apply' : false,
                          relevanceScore: similarity,
                          conversationLink: prompt.generationUUID || '',
                          technologyStack: extractTechnologies(text)
                        });
                      }
                    }
                  }
                }

                // Sort by relevance and limit
                problems.sort((a, b) => b.relevanceScore - a.relevanceScore);
                resolve(problems.slice(0, limit));

              } catch (parseError) {
                reject(parseError);
              }
            }
          );
        }
      );
    });
  });
}

/**
 * Extract solution patterns from workspace conversations
 */
async function extractSolutionPatterns(
  dbPath: string,
  searchTerm?: string,
  limit: number = 10
): Promise<SolutionPattern[]> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        return reject(err);
      }

      // Get generations (where solutions are typically found)
      db.get(
        'SELECT value FROM ItemTable WHERE key = ?',
        ['aiService.generations'],
        (err, genRow: any) => {
          if (err) return reject(err);

          db.close();

          try {
            const solutions: SolutionPattern[] = [];
            
            if (genRow?.value) {
              const generations = JSON.parse(genRow.value) || [];
              
              for (let i = 0; i < generations.length; i++) {
                const gen = generations[i];
                const text = (gen.textDescription || '').toLowerCase();
                
                // Check if this contains solution keywords
                if (containsSolutionKeywords(text)) {
                  // If searchTerm provided, filter by it
                  if (searchTerm && !text.includes(searchTerm.toLowerCase())) {
                    continue;
                  }

                  const steps = extractSolutionSteps(gen.textDescription || '');
                  const technologies = extractTechnologies(text);
                  
                  solutions.push({
                    id: gen.generationUUID || `solution_${i}`,
                    problemType: classifyProblemType(text),
                    solution: gen.textDescription || '',
                    steps: steps,
                    technologies: technologies,
                    sourceConversations: [gen.generationUUID || ''],
                    effectivenessScore: calculateEffectivenessScore(gen, generations),
                    lastUsed: new Date(gen.unixMs || Date.now())
                  });
                }
              }
            }

            // Sort by effectiveness and date
            solutions.sort((a, b) => {
              const scoreCompare = b.effectivenessScore - a.effectivenessScore;
              if (scoreCompare !== 0) return scoreCompare;
              return b.lastUsed.getTime() - a.lastUsed.getTime();
            });

            resolve(solutions.slice(0, limit));

          } catch (parseError) {
            reject(parseError);
          }
        }
      );
    });
  });
}

// Helper functions for search and analysis

function calculateRelevanceScore(text: string, queryTerms: string[], searchType: SearchType): number {
  let score = 0;
  let matchCount = 0;

  for (const term of queryTerms) {
    if (text.includes(term)) {
      matchCount++;
      // Boost score based on term frequency
      const frequency = (text.match(new RegExp(term, 'g')) || []).length;
      score += frequency * 0.1;
    }
  }

  // Base score from term matches
  const termScore = matchCount / queryTerms.length;
  score += termScore * 0.5;

  // Apply search type multipliers
  switch (searchType) {
    case 'technical':
      if (containsTechnicalTerms(text)) score *= 1.5;
      break;
    case 'problem':
      if (containsProblemKeywords(text)) score *= 1.5;
      break;
    case 'solution':
      if (containsSolutionKeywords(text)) score *= 1.5;
      break;
  }

  return Math.min(score, 1.0); // Cap at 1.0
}

function calculateProblemSimilarity(text: string, problemTerms: string[]): number {
  let matches = 0;
  for (const term of problemTerms) {
    if (text.includes(term)) {
      matches++;
    }
  }
  
  const similarity = matches / problemTerms.length;
  
  // Boost if contains problem indicators
  if (containsProblemKeywords(text)) {
    return similarity * 1.3;
  }
  
  return similarity;
}

function containsProblemKeywords(text: string): boolean {
  return PROBLEM_KEYWORDS.some(keyword => text.includes(keyword));
}

function containsSolutionKeywords(text: string): boolean {
  return SOLUTION_KEYWORDS.some(keyword => text.includes(keyword));
}

function containsTechnicalTerms(text: string): boolean {
  return TECH_KEYWORDS.some(keyword => text.includes(keyword));
}

function createContextSnippet(text: string, queryTerms: string[], maxLength: number): string {
  // Find the first occurrence of any query term
  let startIndex = -1;
  for (const term of queryTerms) {
    const index = text.indexOf(term);
    if (index !== -1 && (startIndex === -1 || index < startIndex)) {
      startIndex = index;
    }
  }

  if (startIndex === -1) {
    return text.substring(0, maxLength) + (text.length > maxLength ? '...' : '');
  }

  // Create snippet around the found term
  const snippetStart = Math.max(0, startIndex - 50);
  const snippetEnd = Math.min(text.length, startIndex + maxLength - 50);
  
  let snippet = text.substring(snippetStart, snippetEnd);
  if (snippetStart > 0) snippet = '...' + snippet;
  if (snippetEnd < text.length) snippet = snippet + '...';
  
  return snippet;
}

function findMatchingTerms(text: string, queryTerms: string[]): string[] {
  return queryTerms.filter(term => text.includes(term));
}

function findCorrespondingSolution(promptUUID: string, generations: any[]): any | null {
  // Look for generations that might be responses to this prompt
  return generations.find(gen => 
    gen.generationUUID === promptUUID || 
    (gen.unixMs && Math.abs((gen.unixMs || 0) - Date.now()) < 3600000) // Within 1 hour
  );
}

function extractTechnologies(text: string): string[] {
  const technologies: string[] = [];
  for (const tech of TECH_KEYWORDS) {
    if (text.includes(tech) && !technologies.includes(tech)) {
      technologies.push(tech);
    }
  }
  return technologies.slice(0, 5); // Limit to top 5
}

function extractSolutionSteps(text: string): string[] {
  const steps: string[] = [];
  
  // Look for numbered steps
  const numberedSteps = text.match(/^\d+\.\s+.+$/gm);
  if (numberedSteps) {
    steps.push(...numberedSteps);
  }
  
  // Look for bullet points
  const bulletSteps = text.match(/^[-*]\s+.+$/gm);
  if (bulletSteps) {
    steps.push(...bulletSteps.slice(0, 5)); // Limit bullet points
  }
  
  // If no clear steps, break into sentences
  if (steps.length === 0) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    steps.push(...sentences.slice(0, 3));
  }
  
  return steps.slice(0, 8); // Max 8 steps
}

function classifyProblemType(text: string): string {
  if (text.includes('error') || text.includes('exception')) return 'Error/Exception';
  if (text.includes('bug') || text.includes('broken')) return 'Bug Fix';
  if (text.includes('performance') || text.includes('slow')) return 'Performance';
  if (text.includes('security') || text.includes('vulnerability')) return 'Security';
  if (text.includes('deploy') || text.includes('build')) return 'Deployment';
  if (text.includes('config') || text.includes('setup')) return 'Configuration';
  if (text.includes('api') || text.includes('endpoint')) return 'API/Integration';
  if (text.includes('ui') || text.includes('interface')) return 'UI/UX';
  if (text.includes('database') || text.includes('query')) return 'Database';
  
  return 'General Development';
}

function calculateEffectivenessScore(generation: any, allGenerations: any[]): number {
  let score = 0.5; // Base score
  
  // Boost for apply types (actual code changes)
  if (generation.type === 'apply') {
    score += 0.3;
  }
  
  // Boost for longer, more detailed responses
  const textLength = (generation.textDescription || '').length;
  if (textLength > 500) score += 0.1;
  if (textLength > 1000) score += 0.1;
  
  // Check if followed by more conversation (indicating continued work)
  const genTime = generation.unixMs || 0;
  const hasFollowup = allGenerations.some(g => 
    (g.unixMs || 0) > genTime && (g.unixMs || 0) - genTime < 3600000
  );
  if (hasFollowup) score += 0.1;
  
  return Math.min(score, 1.0);
}

// Formatting functions

function formatSearchResults(results: SearchResult[], query: string): string {
  if (results.length === 0) {
    return `No conversations found matching "${query}".`;
  }

  let output = `🔍 **Search Results for "${query}"**\n`;
  output += `Found ${results.length} relevant conversations:\n\n`;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const relevancePercent = Math.round(result.relevanceScore * 100);
    const typeIcon = result.type === 'prompt' ? '❓' : result.type === 'solution' ? '✅' : '💬';
    
    output += `${i + 1}. ${typeIcon} **${result.type.toUpperCase()}** (${relevancePercent}% relevance)\n`;
    output += `   📅 ${result.timestamp.toLocaleDateString()} ${result.timestamp.toLocaleTimeString()}\n`;
    output += `   🏷️ Matching terms: ${result.matchingTerms.join(', ')}\n`;
    output += `   📝 ${result.contextSnippet}\n`;
    if (result.conversationId) {
      output += `   🔗 ID: ${result.conversationId}\n`;
    }
    output += '\n';
  }

  return output;
}

function formatSimilarProblems(problems: SimilarProblem[], originalProblem: string): string {
  if (problems.length === 0) {
    return `No similar problems found for: "${originalProblem}".`;
  }

  let output = `🔍 **Similar Problems Found**\n`;
  output += `Searching for problems similar to: "${originalProblem}"\n\n`;

  for (let i = 0; i < problems.length; i++) {
    const problem = problems[i];
    const relevancePercent = Math.round(problem.relevanceScore * 100);
    const successIcon = problem.success ? '✅' : '❓';
    
    output += `${i + 1}. ${successIcon} **Problem** (${relevancePercent}% similar)\n`;
    output += `   🔧 Technologies: ${problem.technologyStack.join(', ') || 'Not specified'}\n`;
    output += `   ❓ **Problem:** ${problem.problemDescription.substring(0, 200)}${problem.problemDescription.length > 200 ? '...' : ''}\n`;
    output += `   💡 **Solution:** ${problem.solutionApproach.substring(0, 200)}${problem.solutionApproach.length > 200 ? '...' : ''}\n`;
    if (problem.conversationLink) {
      output += `   🔗 Conversation ID: ${problem.conversationLink}\n`;
    }
    output += '\n';
  }

  return output;
}

function formatSolutionPatterns(solutions: SolutionPattern[]): string {
  if (solutions.length === 0) {
    return 'No solution patterns found in this workspace.';
  }

  let output = `💡 **Solution Patterns Extracted**\n`;
  output += `Found ${solutions.length} solution patterns:\n\n`;

  for (let i = 0; i < solutions.length; i++) {
    const solution = solutions[i];
    const effectivenessPercent = Math.round(solution.effectivenessScore * 100);
    
    output += `${i + 1}. **${solution.problemType}** (${effectivenessPercent}% effectiveness)\n`;
    output += `   🔧 Technologies: ${solution.technologies.join(', ') || 'General'}\n`;
    output += `   📅 Last used: ${solution.lastUsed.toLocaleDateString()}\n`;
    
    if (solution.steps.length > 0) {
      output += `   📝 **Steps:**\n`;
      for (const step of solution.steps.slice(0, 4)) { // Show max 4 steps
        output += `      • ${step.trim()}\n`;
      }
      if (solution.steps.length > 4) {
        output += `      ... (${solution.steps.length - 4} more steps)\n`;
      }
    }
    
    output += `   🔗 Source: ${solution.sourceConversations[0]}\n\n`;
  }

  return output;
} 