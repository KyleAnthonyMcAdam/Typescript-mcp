/**
 * Session Management Tools
 * 
 * Advanced tools for managing and analyzing Cursor workspace composer sessions,
 * conversation timelines, and related session discovery.
 */

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import sqlite3 from 'sqlite3';
import { logger } from '../lib/logger.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// ===== INTERFACES =====

export interface ComposerSessionData {
  composerId: string;
  sessionName: string;
  createdAt: Date;
  lastUpdatedAt: Date;
  totalPrompts: number;
  totalGenerations: number;
  conversationFlow: ConversationEntry[];
  codeChanges: CodeChange[];
  topics: string[];
  status: 'Active' | 'Completed' | 'Abandoned';
  metadata: {
    unifiedMode: string;
    forceMode: string;
    duration: string;
    activityLevel: 'High' | 'Medium' | 'Low';
  };
}

export interface ConversationEntry {
  timestamp: Date;
  type: 'prompt' | 'generation';
  content: string;
  uuid: string;
  commandType?: number;
  generationType?: string;
  relatedUUID?: string; // Links prompt to generation
}

export interface CodeChange {
  timestamp: Date;
  description: string;
  uuid: string;
  generationType: 'apply';
}

export interface ComposerSessionSummary {
  composerId: string;
  name: string;
  createdAt: Date;
  lastActivity: Date;
  duration: string;
  promptCount: number;
  generationCount: number;
  codeChangesCount: number;
  topTopics: string[];
  status: 'Active' | 'Completed' | 'Abandoned';
  activityLevel: 'High' | 'Medium' | 'Low';
}

export interface ConversationTimeline {
  workspaceId: string;
  totalEntries: number;
  timeRange: {
    start: Date;
    end: Date;
    duration: string;
  };
  conversationFlow: TimelineEntry[];
  statistics: {
    promptCount: number;
    generationCount: number;
    codeChanges: number;
    topicChanges: number;
  };
}

export interface TimelineEntry {
  timestamp: Date;
  type: 'prompt' | 'generation' | 'code_change' | 'topic_shift';
  content: string;
  metadata: {
    uuid?: string;
    composerId?: string;
    commandType?: number;
    generationType?: string;
    topics?: string[];
  };
  relatedEntries?: string[];
}

export interface RelatedSession {
  composerId: string;
  sessionName: string;
  similarity: number;
  matchingTopics: string[];
  relevantConversations: ConversationSnippet[];
  lastActivity: Date;
  reasonForMatch: string;
}

export interface ConversationSnippet {
  timestamp: Date;
  type: 'prompt' | 'generation';
  content: string;
  relevanceScore: number;
}

// ===== UTILITY FUNCTIONS =====

/**
 * Discovers workspace databases across different platforms
 */
async function discoverWorkspaceDatabases(): Promise<Array<{workspaceId: string, dbPath: string}>> {
  const workspaceDirs: string[] = [];
  
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

  const databases: Array<{workspaceId: string, dbPath: string}> = [];

  for (const dir of workspaceDirs) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const workspaceId = entry.name;
          const dbPath = path.join(dir, workspaceId, 'state.vscdb');
          
          try {
            await fs.stat(dbPath);
            databases.push({ workspaceId, dbPath });
          } catch {
            // state.vscdb doesn't exist, skip
          }
        }
      }
    } catch {
      // Directory doesn't exist, skip
    }
  }

  return databases;
}

/**
 * Extracts topics from text content using keyword analysis
 */
function extractTopics(text: string): string[] {
  if (!text) return [];
  
  const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'can', 'may', 'might', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them']);
  
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3 && !commonWords.has(word));
  
  const wordCount = new Map<string, number>();
  words.forEach(word => {
    wordCount.set(word, (wordCount.get(word) || 0) + 1);
  });
  
  return Array.from(wordCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}

/**
 * Determines session status based on content and timing
 */
function determineSessionStatus(
  conversationFlow: ConversationEntry[],
  codeChanges: CodeChange[],
  lastActivity: Date
): 'Active' | 'Completed' | 'Abandoned' {
  const daysSinceActivity = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);
  
  if (daysSinceActivity > 30) return 'Abandoned';
  
  const recentConversations = conversationFlow.filter(
    entry => (Date.now() - entry.timestamp.getTime()) < (7 * 24 * 60 * 60 * 1000)
  );
  
  const hasRecentActivity = recentConversations.length > 0 || daysSinceActivity < 7;
  
  // Look for completion indicators
  const allText = conversationFlow.map(entry => entry.content.toLowerCase()).join(' ');
  const completionKeywords = ['done', 'finished', 'complete', 'deployed', 'released', 'final', 'working'];
  const hasCompletionIndicators = completionKeywords.some(keyword => allText.includes(keyword));
  
  if (hasCompletionIndicators && codeChanges.length > 0) return 'Completed';
  if (hasRecentActivity) return 'Active';
  
  return 'Abandoned';
}

/**
 * Calculates activity level based on conversation density and code changes
 */
function calculateActivityLevel(
  promptCount: number,
  generationCount: number,
  codeChangesCount: number,
  duration: number // in hours
): 'High' | 'Medium' | 'Low' {
  if (duration === 0) return 'Low';
  
  const conversationDensity = (promptCount + generationCount) / duration;
  const codeChangeDensity = codeChangesCount / duration;
  
  if (conversationDensity > 10 || codeChangeDensity > 2) return 'High';
  if (conversationDensity > 5 || codeChangeDensity > 1) return 'Medium';
  
  return 'Low';
}

/**
 * Formats duration from milliseconds to human readable string
 */
function formatDuration(durationMs: number): string {
  const hours = Math.floor(durationMs / (1000 * 60 * 60));
  const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

// ===== CORE FUNCTIONS =====

/**
 * Gets complete conversation data for a specific composer session
 */
async function getComposerSessionImpl(workspaceId: string, composerId: string): Promise<ComposerSessionData | null> {
  const databases = await discoverWorkspaceDatabases();
  const db = databases.find(d => d.workspaceId === workspaceId);
  
  if (!db) {
    logger.warn(`Workspace ${workspaceId} not found`);
    return null;
  }

  return new Promise((resolve) => {
    const sqlite = new sqlite3.Database(db.dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        logger.error(`Failed to connect to database: ${err}`);
        return resolve(null);
      }

      // Get composer session metadata
      sqlite.get(
        "SELECT key, value FROM ItemTable WHERE key = 'composer.composerData'",
        (err, row: any) => {
          if (err || !row) {
            sqlite.close();
            return resolve(null);
          }

          try {
            const composerData = JSON.parse(row.value);
            const session = composerData.find((s: any) => s.composerId === composerId);
            
            if (!session) {
              sqlite.close();
              return resolve(null);
            }

            // Get all prompts and generations
            sqlite.all(
              "SELECT key, value FROM ItemTable WHERE key IN ('aiService.prompts', 'aiService.generations')",
              (err, rows: any[]) => {
                sqlite.close();
                
                if (err || !rows) {
                  return resolve(null);
                }

                const prompts: any[] = [];
                const generations: any[] = [];
                
                rows.forEach(row => {
                  if (row.key === 'aiService.prompts') {
                    prompts.push(...JSON.parse(row.value));
                  } else if (row.key === 'aiService.generations') {
                    generations.push(...JSON.parse(row.value));
                  }
                });

                // Filter by composer session and build conversation flow
                const sessionPrompts = prompts.filter(p => 
                  p.generationUUID && generations.some(g => 
                    g.generationUUID === p.generationUUID && 
                    g.textDescription?.includes(composerId)
                  )
                );

                const sessionGenerations = generations.filter(g => 
                  g.textDescription?.includes(composerId)
                );

                const conversationFlow: ConversationEntry[] = [];
                const codeChanges: CodeChange[] = [];

                // Process prompts
                sessionPrompts.forEach(prompt => {
                  conversationFlow.push({
                    timestamp: new Date(prompt.unixMs || Date.now()),
                    type: 'prompt',
                    content: prompt.textDescription || prompt.text || '',
                    uuid: prompt.generationUUID || '',
                    commandType: prompt.commandType,
                    relatedUUID: prompt.generationUUID
                  });
                });

                // Process generations
                sessionGenerations.forEach(generation => {
                  const entry: ConversationEntry = {
                    timestamp: new Date(generation.unixMs || Date.now()),
                    type: 'generation',
                    content: generation.textDescription || '',
                    uuid: generation.generationUUID || '',
                    generationType: generation.type,
                    relatedUUID: generation.generationUUID
                  };
                  
                  conversationFlow.push(entry);

                  // Track code changes
                  if (generation.type === 'apply') {
                    codeChanges.push({
                      timestamp: new Date(generation.unixMs || Date.now()),
                      description: generation.textDescription || '',
                      uuid: generation.generationUUID || '',
                      generationType: 'apply'
                    });
                  }
                });

                // Sort by timestamp
                conversationFlow.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

                // Extract topics and determine status
                const allText = conversationFlow.map(entry => entry.content).join(' ');
                const topics = extractTopics(allText);
                
                const createdAt = new Date(session.createdAt);
                const lastUpdatedAt = new Date(session.lastUpdatedAt);
                const duration = lastUpdatedAt.getTime() - createdAt.getTime();
                
                const status = determineSessionStatus(conversationFlow, codeChanges, lastUpdatedAt);
                const activityLevel = calculateActivityLevel(
                  sessionPrompts.length,
                  sessionGenerations.length,
                  codeChanges.length,
                  duration / (1000 * 60 * 60)
                );

                const sessionData: ComposerSessionData = {
                  composerId: session.composerId,
                  sessionName: session.name || 'Untitled Session',
                  createdAt,
                  lastUpdatedAt,
                  totalPrompts: sessionPrompts.length,
                  totalGenerations: sessionGenerations.length,
                  conversationFlow,
                  codeChanges,
                  topics,
                  status,
                  metadata: {
                    unifiedMode: session.unifiedMode || 'unknown',
                    forceMode: session.forceMode || 'unknown',
                    duration: formatDuration(duration),
                    activityLevel
                  }
                };

                resolve(sessionData);
              }
            );
          } catch (error) {
            sqlite.close();
            logger.error('Error parsing composer data:', error);
            resolve(null);
          }
        }
      );
    });
  });
}

/**
 * Lists all composer sessions with enhanced metadata and activity metrics
 */
async function listComposerSessionsImpl(
  workspaceId: string, 
  sortBy: string = 'modified', 
  limit?: number
): Promise<ComposerSessionSummary[]> {
  const databases = await discoverWorkspaceDatabases();
  const db = databases.find(d => d.workspaceId === workspaceId);
  
  if (!db) {
    logger.warn(`Workspace ${workspaceId} not found`);
    return [];
  }

  return new Promise((resolve) => {
    const sqlite = new sqlite3.Database(db.dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        logger.error(`Failed to connect to database: ${err}`);
        return resolve([]);
      }

      sqlite.get(
        "SELECT key, value FROM ItemTable WHERE key = 'composer.composerData'",
        async (err, row: any) => {
          if (err || !row) {
            sqlite.close();
            return resolve([]);
          }

          try {
            const composerData = JSON.parse(row.value);
            const summaries: ComposerSessionSummary[] = [];

            for (const session of composerData) {
              const sessionData = await getComposerSessionImpl(workspaceId, session.composerId);
              
              if (sessionData) {
                const createdAt = new Date(session.createdAt);
                const lastActivity = new Date(session.lastUpdatedAt);
                const duration = lastActivity.getTime() - createdAt.getTime();

                summaries.push({
                  composerId: session.composerId,
                  name: session.name || 'Untitled Session',
                  createdAt,
                  lastActivity,
                  duration: formatDuration(duration),
                  promptCount: sessionData.totalPrompts,
                  generationCount: sessionData.totalGenerations,
                  codeChangesCount: sessionData.codeChanges.length,
                  topTopics: sessionData.topics.slice(0, 5),
                  status: sessionData.status,
                  activityLevel: sessionData.metadata.activityLevel
                });
              }
            }

            // Sort summaries
            summaries.sort((a, b) => {
              switch (sortBy) {
                case 'created':
                  return b.createdAt.getTime() - a.createdAt.getTime();
                case 'activity':
                  const activityScore = (s: ComposerSessionSummary) => 
                    s.promptCount + s.generationCount + (s.codeChangesCount * 2);
                  return activityScore(b) - activityScore(a);
                case 'duration':
                  return b.lastActivity.getTime() - b.createdAt.getTime() - 
                         (a.lastActivity.getTime() - a.createdAt.getTime());
                case 'modified':
                default:
                  return b.lastActivity.getTime() - a.lastActivity.getTime();
              }
            });

            sqlite.close();
            resolve(limit ? summaries.slice(0, limit) : summaries);
          } catch (error) {
            sqlite.close();
            logger.error('Error parsing composer data:', error);
            resolve([]);
          }
        }
      );
    });
  });
}

/**
 * Merges all conversation data into a chronological timeline
 */
async function mergeConversationTimelineImpl(workspaceId: string): Promise<ConversationTimeline | null> {
  const databases = await discoverWorkspaceDatabases();
  const db = databases.find(d => d.workspaceId === workspaceId);
  
  if (!db) {
    logger.warn(`Workspace ${workspaceId} not found`);
    return null;
  }

  return new Promise((resolve) => {
    const sqlite = new sqlite3.Database(db.dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        logger.error(`Failed to connect to database: ${err}`);
        return resolve(null);
      }

      sqlite.all(
        "SELECT key, value FROM ItemTable WHERE key IN ('aiService.prompts', 'aiService.generations', 'composer.composerData')",
        (err, rows: any[]) => {
          sqlite.close();
          
          if (err || !rows) {
            return resolve(null);
          }

          const prompts: any[] = [];
          const generations: any[] = [];
          let composerData: any[] = [];
          
          rows.forEach(row => {
            if (row.key === 'aiService.prompts') {
              prompts.push(...JSON.parse(row.value));
            } else if (row.key === 'aiService.generations') {
              generations.push(...JSON.parse(row.value));
            } else if (row.key === 'composer.composerData') {
              composerData = JSON.parse(row.value);
            }
          });

          const conversationFlow: TimelineEntry[] = [];
          
          // Process prompts
          prompts.forEach(prompt => {
            conversationFlow.push({
              timestamp: new Date(prompt.unixMs || Date.now()),
              type: 'prompt',
              content: prompt.textDescription || prompt.text || '',
              metadata: {
                uuid: prompt.generationUUID || '',
                commandType: prompt.commandType,
              }
            });
          });

          // Process generations
          generations.forEach(generation => {
            const entry: TimelineEntry = {
              timestamp: new Date(generation.unixMs || Date.now()),
              type: generation.type === 'apply' ? 'code_change' : 'generation',
              content: generation.textDescription || '',
              metadata: {
                uuid: generation.generationUUID || '',
                generationType: generation.type,
              }
            };
            
            conversationFlow.push(entry);
          });

          // Sort by timestamp
          conversationFlow.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

          // Detect topic shifts
          let previousTopics: string[] = [];
          conversationFlow.forEach((entry, index) => {
            const topics = extractTopics(entry.content);
            entry.metadata.topics = topics;
            
            // Check for topic shift
            if (index > 0 && topics.length > 0) {
              const commonTopics = topics.filter(topic => previousTopics.includes(topic));
              if (commonTopics.length / Math.max(topics.length, previousTopics.length) < 0.3) {
                // Insert topic shift marker
                conversationFlow.splice(index, 0, {
                  timestamp: entry.timestamp,
                  type: 'topic_shift',
                  content: `Topic shift detected: ${topics.slice(0, 3).join(', ')}`,
                  metadata: {
                    topics: topics
                  }
                });
              }
            }
            previousTopics = topics;
          });

          const timeline: ConversationTimeline = {
            workspaceId,
            totalEntries: conversationFlow.length,
            timeRange: {
              start: conversationFlow[0]?.timestamp || new Date(),
              end: conversationFlow[conversationFlow.length - 1]?.timestamp || new Date(),
              duration: formatDuration((conversationFlow[conversationFlow.length - 1]?.timestamp.getTime() || 0) - (conversationFlow[0]?.timestamp.getTime() || 0))
            },
            conversationFlow,
            statistics: {
              promptCount: prompts.length,
              generationCount: generations.length,
              codeChanges: generations.filter(g => g.type === 'apply').length,
              topicChanges: conversationFlow.filter(entry => entry.type === 'topic_shift').length
            }
          };

          resolve(timeline);
        }
      );
    });
  });
}

/**
 * Finds composer sessions discussing similar topics
 */
async function findRelatedSessionsImpl(workspaceId: string, searchText: string): Promise<RelatedSession[]> {
  const sessions = await listComposerSessionsImpl(workspaceId);
  const searchKeywords = extractTopics(searchText.toLowerCase());
  
  const relatedSessions: RelatedSession[] = [];

  for (const session of sessions) {
    const sessionData = await getComposerSessionImpl(workspaceId, session.composerId);
    if (!sessionData) continue;

    const allSessionText = sessionData.conversationFlow.map(entry => entry.content).join(' ').toLowerCase();
    const sessionKeywords = extractTopics(allSessionText);
    
    // Calculate similarity score
    const commonKeywords = searchKeywords.filter(keyword => 
      sessionKeywords.includes(keyword) || allSessionText.includes(keyword)
    );
    
    const similarity = commonKeywords.length / Math.max(searchKeywords.length, 1);
    
    if (similarity > 0.1) { // Minimum 10% similarity
      // Find relevant conversation snippets
      const relevantConversations: ConversationSnippet[] = [];
      
      sessionData.conversationFlow.forEach(entry => {
        const entryText = entry.content.toLowerCase();
        const relevanceScore = searchKeywords.reduce((score, keyword) => {
          return score + (entryText.includes(keyword) ? 1 : 0);
        }, 0) / searchKeywords.length;
        
        if (relevanceScore > 0) {
          relevantConversations.push({
            timestamp: entry.timestamp,
            type: entry.type,
            content: entry.content,
            relevanceScore
          });
        }
      });

      // Sort by relevance and take top 3
      relevantConversations.sort((a, b) => b.relevanceScore - a.relevanceScore);
      
      let reasonForMatch = '';
      if (commonKeywords.length > 0) {
        reasonForMatch = `Shared topics: ${commonKeywords.slice(0, 3).join(', ')}`;
      } else {
        reasonForMatch = `Content similarity based on search terms`;
      }

      relatedSessions.push({
        composerId: session.composerId,
        sessionName: session.name,
        similarity,
        matchingTopics: commonKeywords,
        relevantConversations: relevantConversations.slice(0, 3),
        lastActivity: session.lastActivity,
        reasonForMatch
      });
    }
  }

  return relatedSessions.sort((a, b) => b.similarity - a.similarity);
}

// ===== TOOL REGISTRATION =====

/**
 * Registers session management tools with the MCP server
 */
export function registerSessionTools(server: McpServer) {
  logger.info('Registering session management tools...');

  /**
   * Get complete conversation for a specific composer session
   */
  server.registerTool(
    'getComposerSession',
    {
      title: 'Get Composer Session',
      description: 'Get complete conversation for a specific composer session',
      inputSchema: {
        workspaceId: z.string().describe('The workspace ID (folder name)'),
        composerId: z.string().describe('The composer session ID to retrieve'),
      },
    },
    async (input: { workspaceId: string; composerId: string }) => {
      try {
        const sessionData = await getComposerSessionImpl(input.workspaceId, input.composerId);
        
        if (!sessionData) {
          return {
            content: [{ 
              type: 'text' as const, 
              text: `Composer session ${input.composerId} not found in workspace ${input.workspaceId}.` 
            }],
            isError: true,
          };
        }

        const output = formatComposerSessionOutput(sessionData);
        
        return {
          content: [{ type: 'text' as const, text: output }],
        };

      } catch (error) {
        logger.error('Error in getComposerSession:', error);
        return {
          content: [{ 
            type: 'text' as const, 
            text: `Error: ${error instanceof Error ? error.message : String(error)}` 
          }],
          isError: true,
        };
      }
    }
  );

  /**
   * List all composer sessions with enhanced metrics
   */
  server.registerTool(
    'listComposerSessions',
    {
      title: 'List Composer Sessions',
      description: 'Enhanced composer session listing with activity metrics',
      inputSchema: {
        workspaceId: z.string().describe('The workspace ID (folder name)'),
        sortBy: z.string().optional().describe('Sort by: created, modified, activity, duration (default: modified)'),
        limit: z.number().optional().describe('Maximum number of sessions to return'),
      },
    },
    async (input: { workspaceId: string; sortBy?: string; limit?: number }) => {
      try {
        const sessions = await listComposerSessionsImpl(
          input.workspaceId, 
          input.sortBy || 'modified',
          input.limit
        );
        
        if (sessions.length === 0) {
          return {
            content: [{ 
              type: 'text' as const, 
              text: `No composer sessions found in workspace ${input.workspaceId}.` 
            }],
          };
        }

        const output = formatComposerSessionList(sessions);
        
        return {
          content: [{ type: 'text' as const, text: output }],
        };

      } catch (error) {
        logger.error('Error in listComposerSessions:', error);
        return {
          content: [{ 
            type: 'text' as const, 
            text: `Error: ${error instanceof Error ? error.message : String(error)}` 
          }],
          isError: true,
        };
      }
    }
  );

  /**
   * Merge conversation timeline - combine prompts and generations chronologically
   */
  server.registerTool(
    'mergeConversationTimeline',
    {
      title: 'Merge Conversation Timeline',
      description: 'Combine prompts + generations into chronological conversation flow',
      inputSchema: {
        workspaceId: z.string().describe('The workspace ID (folder name)'),
      },
    },
    async (input: { workspaceId: string }) => {
      try {
        const timeline = await mergeConversationTimelineImpl(input.workspaceId);
        
        if (!timeline) {
          return {
            content: [{ 
              type: 'text' as const, 
              text: `No conversation data found in workspace ${input.workspaceId}.` 
            }],
          };
        }

        const output = formatConversationTimeline(timeline);
        
        return {
          content: [{ type: 'text' as const, text: output }],
        };

      } catch (error) {
        logger.error('Error in mergeConversationTimeline:', error);
        return {
          content: [{ 
            type: 'text' as const, 
            text: `Error: ${error instanceof Error ? error.message : String(error)}` 
          }],
          isError: true,
        };
      }
    }
  );

  /**
   * Find related sessions discussing similar topics
   */
  server.registerTool(
    'findRelatedSessions',
    {
      title: 'Find Related Sessions',
      description: 'Find sessions discussing similar topics using semantic search',
      inputSchema: {
        workspaceId: z.string().describe('The workspace ID (folder name)'),
        searchText: z.string().describe('Text to search for related sessions'),
      },
    },
    async (input: { workspaceId: string; searchText: string }) => {
      try {
        const relatedSessions = await findRelatedSessionsImpl(input.workspaceId, input.searchText);
        
        if (relatedSessions.length === 0) {
          return {
            content: [{ 
              type: 'text' as const, 
              text: `No related sessions found for "${input.searchText}" in workspace ${input.workspaceId}.` 
            }],
          };
        }

        const output = formatRelatedSessions(relatedSessions, input.searchText);
        
        return {
          content: [{ type: 'text' as const, text: output }],
        };

      } catch (error) {
        logger.error('Error in findRelatedSessions:', error);
        return {
          content: [{ 
            type: 'text' as const, 
            text: `Error: ${error instanceof Error ? error.message : String(error)}` 
          }],
          isError: true,
        };
      }
    }
  );

  logger.info('Session management tools registered');
}

// ===== FORMATTING FUNCTIONS =====

function formatComposerSessionOutput(session: ComposerSessionData): string {
  const statusIcon = session.status === 'Active' ? '🚀' : 
                    session.status === 'Completed' ? '✅' : '🚫';
  
  const activityIcon = session.metadata.activityLevel === 'High' ? '⚡' : 
                      session.metadata.activityLevel === 'Medium' ? '🔥' : '💤';

  let output = `# 🎯 **Composer Session Analysis**\n`;
  output += `## ${session.sessionName}\n\n`;
  
  output += `**📊 Overview**\n`;
  output += `- **Session ID:** \`${session.composerId}\`\n`;
  output += `- **Status:** ${statusIcon} ${session.status}\n`;
  output += `- **Activity Level:** ${activityIcon} ${session.metadata.activityLevel}\n`;
  output += `- **Duration:** ${session.metadata.duration}\n`;
  output += `- **Created:** ${session.createdAt.toLocaleDateString()}\n`;
  output += `- **Last Updated:** ${session.lastUpdatedAt.toLocaleDateString()}\n\n`;
  
  output += `**💬 Conversation Metrics**\n`;
  output += `- **Total Prompts:** ${session.totalPrompts}\n`;
  output += `- **Total Generations:** ${session.totalGenerations}\n`;
  output += `- **Code Changes:** ${session.codeChanges.length}\n`;
  output += `- **Conversation Entries:** ${session.conversationFlow.length}\n\n`;
  
  if (session.topics.length > 0) {
    output += `**🔑 Key Topics**\n`;
    output += session.topics.slice(0, 8).map(topic => `- ${topic}`).join('\n') + '\n\n';
  }
  
  if (session.codeChanges.length > 0) {
    output += `**💻 Recent Code Changes**\n`;
    session.codeChanges.slice(-5).forEach(change => {
      output += `- \`${change.timestamp.toLocaleString()}\`: ${change.description.substring(0, 80)}${change.description.length > 80 ? '...' : ''}\n`;
    });
    output += '\n';
  }
  
  output += `**📈 Conversation Timeline** (Last 10 entries)\n`;
  session.conversationFlow.slice(-10).forEach(entry => {
    const icon = entry.type === 'prompt' ? '👤' : '🤖';
    const time = entry.timestamp.toLocaleTimeString();
    const preview = entry.content.substring(0, 100);
    output += `- ${icon} \`${time}\`: ${preview}${entry.content.length > 100 ? '...' : ''}\n`;
  });
  
  return output;
}

function formatComposerSessionList(sessions: ComposerSessionSummary[]): string {
  let output = `# 🎯 **Composer Sessions** (${sessions.length} sessions)\n\n`;
  
  sessions.forEach((session, index) => {
    const statusIcon = session.status === 'Active' ? '🚀' : 
                      session.status === 'Completed' ? '✅' : '🚫';
    
    const activityIcon = session.activityLevel === 'High' ? '⚡' : 
                        session.activityLevel === 'Medium' ? '🔥' : '💤';
    
    const divider = index < sessions.length - 1 ? '├─' : '└─';
    
    output += `${divider} **${session.name}**\n`;
    output += `│  ${statusIcon} ${session.status} | ${activityIcon} ${session.activityLevel} | Duration: ${session.duration}\n`;
    output += `│  💬 ${session.promptCount} prompts → ${session.generationCount} responses | 💻 ${session.codeChangesCount} code changes\n`;
    
    if (session.topTopics.length > 0) {
      output += `│  🔑 Topics: ${session.topTopics.join(', ')}\n`;
    }
    
    output += `│  📅 Last activity: ${session.lastActivity.toLocaleDateString()}\n`;
    output += `│  🆔 ID: \`${session.composerId}\`\n`;
    
    if (index < sessions.length - 1) {
      output += `├─\n`;
    }
  });
  
  return output;
}

function formatConversationTimeline(timeline: ConversationTimeline): string {
  let output = `# 📈 **Conversation Timeline**\n`;
  output += `## Workspace: ${timeline.workspaceId}\n\n`;
  
  output += `**📊 Timeline Overview**\n`;
  output += `- **Total Entries:** ${timeline.totalEntries}\n`;
  output += `- **Time Range:** ${timeline.timeRange.start.toLocaleDateString()} → ${timeline.timeRange.end.toLocaleDateString()}\n`;
  output += `- **Duration:** ${timeline.timeRange.duration}\n\n`;
  
  output += `**📈 Statistics**\n`;
  output += `- **Prompts:** ${timeline.statistics.promptCount}\n`;
  output += `- **Generations:** ${timeline.statistics.generationCount}\n`;
  output += `- **Code Changes:** ${timeline.statistics.codeChanges}\n`;
  output += `- **Topic Changes:** ${timeline.statistics.topicChanges}\n\n`;
  
  output += `**🕒 Chronological Flow** (Last 20 entries)\n`;
  timeline.conversationFlow.slice(-20).forEach((entry, index) => {
    const icon = entry.type === 'prompt' ? '👤' : 
                entry.type === 'generation' ? '🤖' : 
                entry.type === 'code_change' ? '💻' : '🔄';
    
    const time = entry.timestamp.toLocaleString();
    const preview = entry.content.substring(0, 80);
    const topics = entry.metadata.topics ? ` [${entry.metadata.topics.slice(0, 2).join(', ')}]` : '';
    
    output += `${index + 1}. ${icon} \`${time}\`: ${preview}${entry.content.length > 80 ? '...' : ''}${topics}\n`;
  });
  
  return output;
}

function formatRelatedSessions(sessions: RelatedSession[], searchText: string): string {
  let output = `# 🔍 **Related Sessions Search**\n`;
  output += `## Search: "${searchText}"\n\n`;
  output += `Found ${sessions.length} related sessions:\n\n`;
  
  sessions.forEach((session, index) => {
    const similarityPercent = Math.round(session.similarity * 100);
    const divider = index < sessions.length - 1 ? '├─' : '└─';
    
    output += `${divider} **${session.sessionName}** (${similarityPercent}% match)\n`;
    output += `│  🎯 ${session.reasonForMatch}\n`;
    output += `│  📅 Last activity: ${session.lastActivity.toLocaleDateString()}\n`;
    output += `│  🆔 ID: \`${session.composerId}\`\n`;
    
    if (session.relevantConversations.length > 0) {
      output += `│  💬 **Relevant Conversations:**\n`;
      session.relevantConversations.forEach(conv => {
        const icon = conv.type === 'prompt' ? '👤' : '🤖';
        const preview = conv.content.substring(0, 60);
        const relevancePercent = Math.round(conv.relevanceScore * 100);
        output += `│     ${icon} (${relevancePercent}% relevant): ${preview}${conv.content.length > 60 ? '...' : ''}\n`;
      });
    }
    
    if (index < sessions.length - 1) {
      output += `├─\n`;
    }
  });
  
  return output;
}