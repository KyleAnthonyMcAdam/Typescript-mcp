/**
 * Enhanced Workspace Intelligence Tools
 * 
 * These tools provide intelligent workspace discovery, analysis, and search capabilities
 * using the workspace analysis engine to understand project context and content.
 */

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import sqlite3 from 'sqlite3';
import { logger } from '../lib/logger.js';
import { analyzeWorkspaceContent, WorkspaceAnalysis, ConversationData, ComposerSession } from './analysis.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

interface WorkspaceDatabase {
  workspaceId: string;
  dbPath: string;
  lastModified: Date;
  hasStateDb: boolean;
}

/**
 * Registers enhanced workspace intelligence tools
 */
export function registerEnhancedTools(server: McpServer) {
  logger.info('Registering enhanced workspace intelligence tools...');

  /**
   * Enhanced listWorkspaces with intelligent context
   */
  server.registerTool(
    'listWorkspacesEnhanced',
    {
      title: 'List Workspaces with Intelligence',
      description: 'Lists workspaces with smart labels, technology detection, and rich context.',
      inputSchema: {
        limit: z.number().optional().describe('Maximum number of workspaces (default: 5)'),
        includeAnalysis: z.boolean().optional().describe('Include detailed analysis (default: true)'),
      },
    },
    async (input: { limit?: number; includeAnalysis?: boolean }) => {
      try {
        const databases = await discoverWorkspaceDatabases();
        const { limit = 5, includeAnalysis = true } = input;

        const workspaceAnalyses: WorkspaceAnalysis[] = [];

        for (const db of databases.slice(0, limit)) {
          try {
            if (includeAnalysis) {
              const analysis = await analyzeWorkspace(db.workspaceId, db.dbPath);
              if (analysis) {
                workspaceAnalyses.push(analysis);
              }
            }
          } catch (error) {
            logger.warn(`Failed to analyze workspace ${db.workspaceId}:`, error);
          }
        }

        const output = formatWorkspaceList(workspaceAnalyses);

        return {
          content: [{ type: 'text' as const, text: output }],
        };

      } catch (error) {
        logger.error('Error in enhanced listWorkspaces:', error);
        return {
          content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  /**
   * Get detailed workspace analysis
   */
  server.registerTool(
    'analyzeWorkspace',
    {
      title: 'Analyze Workspace',
      description: 'Provides detailed analysis of a specific workspace including smart labeling, technology detection, and project insights.',
      inputSchema: {
        workspaceId: z.string().describe('The workspace ID to analyze'),
      },
    },
    async (input: { workspaceId: string }) => {
      try {
        const databases = await discoverWorkspaceDatabases();
        const db = databases.find(d => d.workspaceId === input.workspaceId);

        if (!db) {
          return {
            content: [{ type: 'text' as const, text: `Workspace ${input.workspaceId} not found.` }],
            isError: true,
          };
        }

        const analysis = await analyzeWorkspace(input.workspaceId, db.dbPath);
        if (!analysis) {
          return {
            content: [{ type: 'text' as const, text: `Could not analyze workspace ${input.workspaceId}.` }],
            isError: true,
          };
        }

        const output = formatWorkspaceAnalysis(analysis);

        return {
          content: [{ type: 'text' as const, text: output }],
        };

      } catch (error) {
        logger.error('Error analyzing workspace:', error);
        return {
          content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  logger.info('Enhanced workspace tools registered');
}

/**
 * Discovers workspace databases
 */
async function discoverWorkspaceDatabases(): Promise<WorkspaceDatabase[]> {
  const workspaceDirs: string[] = [];
  
  // Windows paths
  if (os.platform() === 'win32') {
    const appDataPath = process.env.APPDATA;
    if (appDataPath) {
      workspaceDirs.push(
        path.join(appDataPath, 'Code', 'User', 'workspaceStorage'),
        path.join(appDataPath, 'Cursor', 'User', 'workspaceStorage')
      );
    }
  } else if (os.platform() === 'darwin') {
    // macOS paths
    const homeDir = os.homedir();
    workspaceDirs.push(
      path.join(homeDir, 'Library', 'Application Support', 'Code', 'User', 'workspaceStorage'),
      path.join(homeDir, 'Library', 'Application Support', 'Cursor', 'User', 'workspaceStorage')
    );
  } else {
    // Linux paths
    const homeDir = os.homedir();
    workspaceDirs.push(
      path.join(homeDir, '.config', 'Code', 'User', 'workspaceStorage'),
      path.join(homeDir, '.config', 'Cursor', 'User', 'workspaceStorage')
    );
  }

  const databases: WorkspaceDatabase[] = [];

  for (const dir of workspaceDirs) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const workspaceId = entry.name;
          const dbPath = path.join(dir, workspaceId, 'state.vscdb');
          
          try {
            const stats = await fs.stat(dbPath);
            databases.push({
              workspaceId,
              dbPath,
              lastModified: stats.mtime,
              hasStateDb: true
            });
          } catch {
            // state.vscdb doesn't exist, skip
          }
        }
      }
    } catch {
      // Directory doesn't exist, skip
    }
  }

  return databases.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
}

async function analyzeWorkspace(workspaceId: string, dbPath: string): Promise<WorkspaceAnalysis | null> {
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

function formatWorkspaceList(workspaces: WorkspaceAnalysis[]): string {
  if (workspaces.length === 0) {
    return 'No workspaces analyzed.';
  }

  let output = `🚀 **Enhanced Workspace Discovery** (${workspaces.length} workspaces)\n\n`;
  
  workspaces.forEach((workspace, index) => {
    const confidence = Math.round(workspace.confidence * 100);
    const techStack = workspace.technologies.slice(0, 3).join(', ') || 'Unknown';
    const activityIcon = getActivityIcon(workspace.currentStatus);
    const timeAgo = formatDate(workspace.lastActivity);
    
    output += `┌─ **${workspace.smartLabel}** (${techStack})\n`;
    output += `│  ${activityIcon} ${workspace.currentStatus} | Last: ${timeAgo} | Confidence: ${confidence}%\n`;
    
    if (workspace.currentGoals.length > 0) {
      output += `│  🎯 Goals: ${workspace.currentGoals[0]}\n`;
    }
    
    if (workspace.metrics.codeChanges > 0) {
      output += `│  💻 ${workspace.metrics.codeChanges} code changes, ${workspace.metrics.promptCount} prompts\n`;
    } else {
      output += `│  💬 ${workspace.metrics.promptCount} prompts, ${workspace.metrics.generationCount} responses\n`;
    }
    
    if (workspace.timeInvestment.totalHours > 0) {
      output += `│  ⏱️  ${workspace.timeInvestment.totalHours}h invested (${workspace.timeInvestment.sessionsCount} sessions)\n`;
    }
    
    output += index === workspaces.length - 1 ? '└─\n' : '├─\n';
  });
  
  return output;
}

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