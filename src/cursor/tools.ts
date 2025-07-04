/**
 * @file This file defines and registers MCP tools for interacting with the Cursor databases.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import sqlite3 from 'sqlite3';
import { logger } from '../lib/logger.js';
import { discoverDatabases } from './database.js';
import { 
  formatQueryResults, 
  formatError, 
  formatQueryMetadata, 
  FormattingOptions, 
  DEFAULT_FORMAT_OPTIONS 
} from './formatting.js';

/**
 * Interface for PRAGMA table_info result
 */
interface TableColumnInfo {
  cid: number;      // Column ID
  name: string;     // Column name
  type: string;     // Data type
  notnull: number;  // 1 if NOT NULL constraint exists, 0 if not
  dflt_value: any;  // Default value
  pk: number;       // 1 if part of the PRIMARY KEY, 0 if not
}

/**
 * Interface for workspace folder metadata
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
 * Interface for workspace metadata extraction results
 */
interface WorkspaceMetadata {
  label: string;        // Human-friendly workspace label
  promptCount: number;  // Total number of prompts
  generationCount: number; // Total number of generations
}

/**
 * Interface for prompt data structure from aiService.prompts
 */
interface PromptData {
  text: string;         // The prompt text content
  commandType?: number; // Optional command type identifier
}

/**
 * Interface for generation data structure from aiService.generations
 */
interface GenerationData {
  unixMs: number;           // Timestamp in milliseconds since epoch
  generationUUID: string;   // Unique identifier for the generation
  type?: string;           // Type of generation (chat, composer, apply, etc.)
  textDescription?: string; // Optional text description of the generation
}

/**
 * Interface for key analysis results
 */
interface KeyAnalysis {
  key: string;      // The database key name
  type: string;     // Detected data type (JSON, text, binary, etc.)
  size: number;     // Size in bytes
  preview?: string; // Content preview (truncated)
}

/**
 * Enum for supported output formats
 */
type OutputFormat = 'table' | 'list' | 'markdown' | 'json';

/**
 * Enum for workspace sorting options
 */
type WorkspaceSortBy = 'creation' | 'modified' | 'id' | 'activity';

/**
 * Enum for sort order options
 */
type SortOrder = 'asc' | 'desc';

/**
 * Enum for export data types
 */
type ExportType = 'prompts' | 'generations' | 'all';

/**
 * Registers all Cursor-related tools with the MCP server.
 * 
 * This function registers a comprehensive suite of tools for interacting with Cursor
 * workspace databases, including workspace discovery, data extraction, analysis, and export.
 * The tools provide both high-level abstractions for common tasks and low-level access
 * for advanced querying.
 *
 * @param server - The MCP server instance to register tools with
 * 
 * @remarks
 * Registered tool categories:
 * - **Workspace Management**: listWorkspaces, presentWorkspaceSummary
 * - **Database Analysis**: inspectDatabase, listAllKeys, drilldownKey  
 * - **AI Data Extraction**: extractPrompts, extractGenerations, listGenerationTypes
 * - **Data Export**: exportWorkspaceData
 * - **Raw Database Access**: query_table, query_table_columns, etc.
 * 
 * All tools include comprehensive error handling, timeout management, and
 * support for multiple output formats where applicable.
 */
export function registerCursorTools(server: McpServer) {
  logger.info('🛠️ Registering Cursor tools...');



  /**
   * Tool: query_table
   * Executes a raw SQL query against a specified database resource.
   */
   const queryTableInputSchema = {
     uri: z.string().describe('The cursor+sqlite:// URI of the target database.'),
     table: z.string().describe('The name of the table to query.'),
     sql: z.string().describe('The SQL query to execute.'),
     format: z.enum(['json', 'table']).optional().describe('Output format (json or table). Defaults to json.'),
     pretty: z.boolean().optional().describe('Whether to pretty-print the output. Defaults to true.'),
   };
   
   server.registerTool(
     'query_table',
     {
       title: 'Query Cursor Database Table',
       description: 'Execute an arbitrary SQLite query against a specific database URI.',
       inputSchema: queryTableInputSchema,
     },
     async (input: { 
       uri: string; 
       table: string; 
       sql: string;
       format?: 'json' | 'table';
       pretty?: boolean;
     }) => {
       logger.info(`Tool 'query_table' called with input:`, input);
       const dbPath = input.uri.replace('cursor+sqlite://', '');
       const startTime = Date.now();

       const formatOptions: FormattingOptions = {
         format: input.format || DEFAULT_FORMAT_OPTIONS.format,
         pretty: input.pretty ?? DEFAULT_FORMAT_OPTIONS.pretty,
       };

       return new Promise((resolve) => {
        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
          if (err) {
            logger.error(`Failed to connect to database at ${dbPath}:`, err);
            return resolve({
              content: [{ type: 'text' as const, text: formatError(`Error connecting to DB: ${err.message}`) }],
              isError: true,
            });
          }
          logger.info(`Successfully connected to database: ${dbPath}`);
        });

        // Check if the requested table exists before running the query
        db.get("SELECT name FROM sqlite_master WHERE type='table' AND name=?;", [input.table], (err, row) => {
          if (err) {
            logger.error(`SQL error while checking table existence:`, err);
            db.close();
            return resolve({
              content: [{ type: 'text' as const, text: formatError(`SQL Error: ${err.message}`) }],
              isError: true,
            });
          }
          if (!row) {
            logger.warn(`Table '${input.table}' does not exist in database: ${dbPath}`);
            db.close();
            return resolve({
              content: [{ type: 'text' as const, text: formatError(`Table '${input.table}' does not exist in this database.`) }],
              isError: true,
            });
          }

          // Table exists, run the query
          db.all(input.sql, [], (err, rows) => {
            const duration = Date.now() - startTime;
            
            if (err) {
              logger.error(`SQL error for query "${input.sql}":`, err);
              db.close();
              return resolve({
                content: [{ type: 'text' as const, text: formatError(`SQL Error: ${err.message}`, { query: input.sql }) }],
                isError: true,
              });
            }

            logger.info(`Query successful. Found ${rows.length} rows.`);
            db.close((err) => {
              if (err) {
                logger.error(`Error closing the database connection:`, err);
              }
            });
            
            // Format the results and metadata
            const metadata = formatQueryMetadata({
              dbPath,
              table: input.table,
              sql: input.sql,
              duration,
              rowCount: rows.length
            });

            const formattedResults = formatQueryResults(rows, formatOptions);
            
            resolve({
              content: [
                { type: 'text' as const, text: formattedResults },
                { type: 'text' as const, text: metadata }
              ],
            });
          });
        });
       });
     }
   );







  /**
   * Tool: query_table_columns
   * Executes a SELECT query with specified columns against a table.
   */
  server.registerTool(
    'query_table_columns',
    {
      title: 'Query Table with Column Selection',
      description: 'Execute a SELECT query with specified columns against a table.',
      inputSchema: {
        uri: z.string().describe('The cursor+sqlite:// URI of the target database.'),
        table: z.string().describe('The name of the table to query.'),
        columns: z.array(z.string()).describe('Array of column names to select. Use ["*"] for all columns.'),
        where: z.string().optional().describe('Optional WHERE clause (without the WHERE keyword).'),
        orderBy: z.string().optional().describe('Optional ORDER BY clause (without the ORDER BY keywords).'),
        limit: z.number().optional().describe('Optional LIMIT value.'),
        format: z.enum(['json', 'table']).optional().describe('Output format (json or table). Defaults to json.'),
        pretty: z.boolean().optional().describe('Whether to pretty-print the output. Defaults to true.'),
      },
    },
    async (input: { 
      uri: string; 
      table: string; 
      columns: string[];
      where?: string;
      orderBy?: string;
      limit?: number;
      format?: 'json' | 'table';
      pretty?: boolean;
    }) => {
      logger.info(`Tool 'query_table_columns' called with input:`, input);
      const dbPath = input.uri.replace('cursor+sqlite://', '');
      const startTime = Date.now();

      const formatOptions: FormattingOptions = {
        format: input.format || DEFAULT_FORMAT_OPTIONS.format,
        pretty: input.pretty ?? DEFAULT_FORMAT_OPTIONS.pretty,
      };

      return new Promise((resolve) => {
        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
          if (err) {
            logger.error(`Failed to connect to database at ${dbPath}:`, err);
            return resolve({
              content: [{ type: 'text' as const, text: formatError(`Error connecting to DB: ${err.message}`) }],
              isError: true,
            });
          }
        });

        // Check if the table exists
        db.get("SELECT name FROM sqlite_master WHERE type='table' AND name=?;", [input.table], (err, row) => {
          if (err) {
            logger.error(`SQL error while checking table existence:`, err);
            db.close();
            return resolve({
              content: [{ type: 'text' as const, text: formatError(`SQL Error: ${err.message}`) }],
              isError: true,
            });
          }

          if (!row) {
            logger.warn(`Table '${input.table}' does not exist in database: ${dbPath}`);
            db.close();
            return resolve({
              content: [{ type: 'text' as const, text: formatError(`Table '${input.table}' does not exist in this database.`) }],
              isError: true,
            });
          }

          // Build the SQL query
          const columns = input.columns.join(', ');
          let sql = `SELECT ${columns} FROM ${input.table}`;
          
          if (input.where) {
            sql += ` WHERE ${input.where}`;
          }
          
          if (input.orderBy) {
            sql += ` ORDER BY ${input.orderBy}`;
          }
          
          if (input.limit) {
            sql += ` LIMIT ${input.limit}`;
          }

          // Execute the query
          db.all(sql, [], (err, rows) => {
            const duration = Date.now() - startTime;

            if (err) {
              logger.error(`SQL error for query "${sql}":`, err);
              db.close();
              return resolve({
                content: [{ type: 'text' as const, text: formatError(`SQL Error: ${err.message}`, { query: sql }) }],
                isError: true,
              });
            }

            logger.info(`Query successful. Found ${rows.length} rows.`);
            db.close((err) => {
              if (err) {
                logger.error(`Error closing the database connection:`, err);
              }
            });
            
            // Format the results and metadata
            const metadata = formatQueryMetadata({
              dbPath,
              table: input.table,
              sql,
              duration,
              rowCount: rows.length
            });

            const formattedResults = formatQueryResults(rows, formatOptions);
            
            resolve({
              content: [
                { type: 'text' as const, text: formattedResults },
                { type: 'text' as const, text: metadata }
              ],
            });
          });
        });
      });
    }
  );

  /**
   * Tool: listWorkspaces
   * Lists all workspace folders in workspaceStorage with metadata and sorting options.
   */
  server.registerTool(
    'listWorkspaces',
    {
      title: 'List Workspace Folders',
      description: 'Lists all workspace folders in workspaceStorage with metadata (ID, last modified, creation date, label, hasStateDb). Supports sorting by date.',
      inputSchema: {
        sortBy: z.enum(['creation', 'modified', 'id']).optional().describe('Sort workspaces by creation date, last modified date, or ID (default: modified)'),
        sortOrder: z.enum(['asc', 'desc']).optional().describe('Sort order: ascending or descending (default: desc)'),
        includeLabels: z.boolean().optional().describe('Whether to extract first prompt as workspace label (default: true)'),
      },
    },
    async (input: { sortBy?: 'creation' | 'modified' | 'id'; sortOrder?: 'asc' | 'desc'; includeLabels?: boolean } = {}) => {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const sortBy = input.sortBy || 'modified';
      const sortOrder = input.sortOrder || 'desc';
      const includeLabels = input.includeLabels !== false; // default true
      
      logger.info(`Tool 'listWorkspaces' called with sortBy: ${sortBy}, sortOrder: ${sortOrder}, includeLabels: ${includeLabels}`);
      
      // Default Cursor workspaceStorage path (customize if needed)
      const workspaceStorageDir = path.join(
        process.env.HOME || process.env.USERPROFILE || '',
        'AppData', 'Roaming', 'Cursor', 'User', 'workspaceStorage'
      );
      let folders: { id: string; lastModified: string; creationDate: string; label: string; hasStateDb: boolean }[] = [];
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
          content: [{ type: 'text' as const, text: `Error accessing workspace storage directory: ${err.message}` }],
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
        content: [
          { type: 'text' as const, text },
        ],
      };
    }
  );

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
   * 
   * @example
   * ```typescript
   * const label = await extractWorkspaceLabel('/path/to/state.vscdb', 'workspace123');
   * console.log(label); // "help me set up a mcp server for puppeteer"
   * ```
   * 
   * @remarks
   * - Uses a 3-second timeout to prevent hanging on locked databases
   * - Cleans multi-line prompts into single-line labels
   * - Truncates long prompts to 60 characters max
   * - Returns descriptive error labels if extraction fails
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
   * Tool: presentWorkspaceSummary
   * Provides enhanced presentation of workspace data in multiple formats.
   */
  server.registerTool(
    'presentWorkspaceSummary',
    {
      title: 'Present Workspace Summary',
      description: 'Presents workspace data in various formats: table, list, markdown, or JSON.',
      inputSchema: {
        format: z.enum(['table', 'list', 'markdown', 'json']).optional().describe('Output format (default: table)'),
        sortBy: z.enum(['creation', 'modified', 'activity']).optional().describe('Sort by creation date, last modified, or activity level (default: modified)'),
        limit: z.number().optional().describe('Limit number of workspaces shown (default: all)'),
      },
    },
    async (input: { format?: 'table' | 'list' | 'markdown' | 'json'; sortBy?: 'creation' | 'modified' | 'activity'; limit?: number } = {}) => {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const format = input.format || 'table';
      const sortBy = input.sortBy || 'modified';
      const limit = input.limit;
      
      logger.info(`Tool 'presentWorkspaceSummary' called with format: ${format}, sortBy: ${sortBy}, limit: ${limit}`);
      
      const workspaceStorageDir = path.join(
        process.env.HOME || process.env.USERPROFILE || '',
        'AppData', 'Roaming', 'Cursor', 'User', 'workspaceStorage'
      );
      
      let workspaces: Array<{
        id: string;
        lastModified: string;
        creationDate: string;
        label: string;
        hasStateDb: boolean;
        promptCount?: number;
        generationCount?: number;
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
              let label = '(no label)';
              let promptCount = 0;
              let generationCount = 0;
              
              try {
                await fs.access(stateDbPath);
                hasStateDb = true;
                
                // Extract enhanced metadata including activity metrics
                const metadata = await extractWorkspaceMetadata(stateDbPath);
                label = metadata.label;
                promptCount = metadata.promptCount;
                generationCount = metadata.generationCount;
              } catch {
                // state.vscdb doesn't exist
              }
              
              workspaces.push({
                id: entry.name,
                lastModified: stat.mtime.toISOString(),
                creationDate: stat.birthtime.toISOString(),
                label,
                hasStateDb,
                promptCount,
                generationCount,
              });
            } catch (err) {
              // Skip problematic folders
            }
          }
        }
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: `Error accessing workspace storage: ${err.message}` }],
          isError: true,
        };
      }
      
      // Sort workspaces
      workspaces.sort((a, b) => {
        switch (sortBy) {
          case 'creation':
            return new Date(b.creationDate).getTime() - new Date(a.creationDate).getTime();
          case 'modified':
            return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
          case 'activity':
            const aActivity = (a.promptCount || 0) + (a.generationCount || 0);
            const bActivity = (b.promptCount || 0) + (b.generationCount || 0);
            return bActivity - aActivity;
          default:
            return 0;
        }
      });
      
      // Apply limit if specified
      if (limit && limit > 0) {
        workspaces = workspaces.slice(0, limit);
      }
      
      // Format output based on requested format
      let text = '';
      switch (format) {
        case 'json':
          text = JSON.stringify(workspaces, null, 2);
          break;
          
        case 'markdown':
          text = `# Workspace Summary\n\n`;
          text += `**Total workspaces:** ${workspaces.length}\n`;
          text += `**Sort order:** ${sortBy} (newest first)\n\n`;
          for (const ws of workspaces) {
            text += `## ${ws.label || ws.id}\n\n`;
            text += `- **ID:** \`${ws.id}\`\n`;
            text += `- **Last Modified:** ${new Date(ws.lastModified).toLocaleDateString()}\n`;
            text += `- **Has Database:** ${ws.hasStateDb ? 'Yes' : 'No'}\n`;
            if (ws.hasStateDb) {
              text += `- **Activity:** ${ws.promptCount} prompts, ${ws.generationCount} generations\n`;
            }
            text += '\n';
          }
          break;
          
        case 'list':
          text = `Workspace Summary (${workspaces.length} total, sorted by ${sortBy})\n\n`;
          for (let i = 0; i < workspaces.length; i++) {
            const ws = workspaces[i];
            text += `${i + 1}. ${ws.label}\n`;
            text += `   ID: ${ws.id}\n`;
            text += `   Modified: ${new Date(ws.lastModified).toLocaleDateString()}\n`;
            if (ws.hasStateDb) {
              text += `   Activity: ${ws.promptCount} prompts, ${ws.generationCount} generations\n`;
            }
            text += '\n';
          }
          break;
          
        default: // table
          text = `Workspace Summary (sorted by ${sortBy})\n`;
          text += 'Rank | Label                    | Modified   | Activity    | ID\n';
          text += '-----|--------------------------|------------|-------------|------------------\n';
          for (let i = 0; i < workspaces.length; i++) {
            const ws = workspaces[i];
            const rank = (i + 1).toString().padEnd(4);
            const labelTrunc = ws.label.length > 24 ? ws.label.substring(0, 21) + '...' : ws.label.padEnd(24);
            const modified = new Date(ws.lastModified).toLocaleDateString().padEnd(10);
            const activity = ws.hasStateDb ? `${ws.promptCount}p/${ws.generationCount}g`.padEnd(11) : 'no db'.padEnd(11);
            const idTrunc = ws.id.length > 16 ? ws.id.substring(0, 13) + '...' : ws.id;
            text += `${rank} | ${labelTrunc} | ${modified} | ${activity} | ${idTrunc}\n`;
          }
          break;
      }
      
      return {
        content: [{ type: 'text' as const, text }],
      };
    }
  );

  /**
   * Helper function to extract enhanced workspace metadata including activity metrics.
   * 
   * This function performs a comprehensive analysis of a workspace database to extract
   * both labeling information and activity metrics. It reads both aiService.prompts
   * and aiService.generations to provide a complete picture of workspace usage.
   * 
   * @param dbPath - Full path to the state.vscdb file
   * @returns Promise resolving to WorkspaceMetadata object with label and counts
   * 
   * @example
   * ```typescript
   * const metadata = await extractWorkspaceMetadata('/path/to/state.vscdb');
   * console.log(metadata);
   * // {
   * //   label: "help me set up a mcp server for puppeteer",
   * //   promptCount: 15,
   * //   generationCount: 23
   * // }
   * ```
   * 
   * @remarks
   * - Uses a 5-second timeout for comprehensive data extraction
   * - Extracts first prompt text as workspace label
   * - Counts total prompts and generations for activity metrics
   * - Handles JSON parsing errors gracefully
   * - Returns safe defaults if data extraction fails
   */
  async function extractWorkspaceMetadata(dbPath: string): Promise<{
    label: string;
    promptCount: number;
    generationCount: number;
  }> {
    return new Promise((resolve) => {
      const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
        if (err) {
          resolve({ label: '(db error)', promptCount: 0, generationCount: 0 });
          return;
        }
      });

      const timeout = setTimeout(() => {
        db.close();
        resolve({ label: '(timeout)', promptCount: 0, generationCount: 0 });
      }, 5000);

      let label = '(no prompts)';
      let promptCount = 0;
      let generationCount = 0;

      // Get prompts data
      db.get("SELECT value FROM ItemTable WHERE key = 'aiService.prompts';", [], (err, promptRow) => {
        if (!err && promptRow) {
          try {
            const promptsData = JSON.parse((promptRow as any).value.toString());
            if (Array.isArray(promptsData)) {
              promptCount = promptsData.length;
              if (promptsData.length > 0 && promptsData[0].text) {
                let firstPrompt = promptsData[0].text.trim();
                firstPrompt = firstPrompt.replace(/\n/g, ' ').replace(/\s+/g, ' ');
                if (firstPrompt.length > 60) {
                  firstPrompt = firstPrompt.substring(0, 57) + '...';
                }
                label = firstPrompt;
              }
            }
          } catch (e) {
            // ignore parse errors
          }
        }

        // Get generations data
        db.get("SELECT value FROM ItemTable WHERE key = 'aiService.generations';", [], (err, genRow) => {
          clearTimeout(timeout);
          if (!err && genRow) {
            try {
              const generationsData = JSON.parse((genRow as any).value.toString());
              if (Array.isArray(generationsData)) {
                generationCount = generationsData.length;
              }
            } catch (e) {
              // ignore parse errors
            }
          }

          db.close();
          resolve({ label, promptCount, generationCount });
        });
      });
    });
  }

  /**
   * Tool: inspectDatabase
   * Opens a state.vscdb file and inspects its schema and keys.
   */
  server.registerTool(
    'inspectDatabase',
    {
      title: 'Inspect Database Schema and Keys',
      description: 'Opens a workspace state.vscdb file and lists all tables and keys in ItemTable.',
      inputSchema: {
        workspaceId: z.string().describe('The workspace ID (folder name) to inspect.'),
      },
    },
    async (input: { workspaceId: string }) => {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      logger.info(`Tool 'inspectDatabase' called for workspace: ${input.workspaceId}`);
      
      // Construct path to the database
      const workspaceStorageDir = path.join(
        process.env.HOME || process.env.USERPROFILE || '',
        'AppData', 'Roaming', 'Cursor', 'User', 'workspaceStorage'
      );
      const dbPath = path.join(workspaceStorageDir, input.workspaceId, 'state.vscdb');
      
      // Check if database exists
      try {
        await fs.access(dbPath);
      } catch (err: any) {
        logger.error(`Database not found: ${dbPath}`);
        return {
          content: [{ type: 'text' as const, text: `Database not found for workspace ${input.workspaceId}` }],
          isError: true,
        };
      }
      
      return new Promise((resolve) => {
        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
          if (err) {
            logger.error(`Failed to connect to database at ${dbPath}:`, err);
            let errorMessage = `Error connecting to database: ${err.message}`;
            if (err.message.includes('SQLITE_BUSY') || err.message.includes('database is locked')) {
              errorMessage += ' (Database is currently locked by another process)';
            } else if (err.message.includes('SQLITE_CORRUPT') || err.message.includes('malformed')) {
              errorMessage += ' (Database appears to be corrupted)';
            } else if (err.message.includes('SQLITE_PERM') || err.message.includes('permission')) {
              errorMessage += ' (Permission denied accessing database)';
            }
            return resolve({
              content: [{ type: 'text' as const, text: errorMessage }],
              isError: true,
            });
          }
          logger.info(`Successfully connected to database: ${dbPath}`);
        });

        // Set a timeout for database operations
        const timeout = setTimeout(() => {
          db.close();
          resolve({
            content: [{ type: 'text' as const, text: 'Database operation timed out (database may be locked)' }],
            isError: true,
          });
        }, 10000); // 10 second timeout

        // Get all tables
        db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;", [], (err, tables) => {
          if (err) {
            clearTimeout(timeout);
            logger.error(`Error listing tables:`, err);
            db.close();
            return resolve({
              content: [{ type: 'text' as const, text: `Error listing tables: ${err.message}` }],
              isError: true,
            });
          }

          // Get all keys from ItemTable
          db.all("SELECT key FROM ItemTable ORDER BY key;", [], (err, keys) => {
            clearTimeout(timeout);
            if (err) {
              logger.error(`Error listing keys from ItemTable:`, err);
              db.close();
              return resolve({
                content: [{ type: 'text' as const, text: `Error listing keys from ItemTable: ${err.message}` }],
                isError: true,
              });
            }

            db.close((err) => {
              if (err) {
                logger.error(`Error closing database connection:`, err);
              }
            });

            // Format output
            let text = `Database Inspection for Workspace: ${input.workspaceId}\n`;
            text += `Database Path: ${dbPath}\n\n`;
            
            text += `Tables (${tables.length}):\n`;
            for (const table of tables) {
              text += `- ${(table as any).name}\n`;
            }
            
            text += `\nKeys in ItemTable (${keys.length}):\n`;
            let aiServiceKeys: string[] = [];
            let otherKeys: string[] = [];
            
            for (const key of keys) {
              if ((key as any).key.startsWith('aiService.')) {
                aiServiceKeys.push((key as any).key);
              } else {
                otherKeys.push((key as any).key);
              }
            }
            
            if (aiServiceKeys.length > 0) {
              text += `\naiService.* keys (${aiServiceKeys.length}):\n`;
              for (const key of aiServiceKeys) {
                text += `- ${key}\n`;
              }
            }
            
            if (otherKeys.length > 0) {
              text += `\nOther keys (${otherKeys.length}):\n`;
              for (const key of otherKeys) {
                text += `- ${key}\n`;
              }
            }

            resolve({
              content: [{ type: 'text' as const, text }],
            });
          });
        });
      });
    }
  );

  /**
   * Tool: extractPrompts
   * Extracts all prompt texts from aiService.prompts in a workspace database.
   */
  server.registerTool(
    'extractPrompts',
    {
      title: 'Extract Prompt Texts',
      description: 'Extracts all prompt texts from aiService.prompts in a workspace database as plain text.',
      inputSchema: {
        workspaceId: z.string().describe('The workspace ID (folder name) to extract prompts from.'),
      },
    },
    async (input: { workspaceId: string }) => {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      logger.info(`Tool 'extractPrompts' called for workspace: ${input.workspaceId}`);
      
      // Construct path to the database
      const workspaceStorageDir = path.join(
        process.env.HOME || process.env.USERPROFILE || '',
        'AppData', 'Roaming', 'Cursor', 'User', 'workspaceStorage'
      );
      const dbPath = path.join(workspaceStorageDir, input.workspaceId, 'state.vscdb');
      
      // Check if database exists
      try {
        await fs.access(dbPath);
      } catch (err: any) {
        logger.error(`Database not found: ${dbPath}`);
        return {
          content: [{ type: 'text' as const, text: `Database not found for workspace ${input.workspaceId}` }],
          isError: true,
        };
      }
      
      return new Promise((resolve) => {
        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
          if (err) {
            logger.error(`Failed to connect to database at ${dbPath}:`, err);
            let errorMessage = `Error connecting to database: ${err.message}`;
            if (err.message.includes('SQLITE_BUSY') || err.message.includes('database is locked')) {
              errorMessage += ' (Database is currently locked by another process)';
            } else if (err.message.includes('SQLITE_CORRUPT') || err.message.includes('malformed')) {
              errorMessage += ' (Database appears to be corrupted)';
            }
            return resolve({
              content: [{ type: 'text' as const, text: errorMessage }],
              isError: true,
            });
          }
          logger.info(`Successfully connected to database: ${dbPath}`);
        });

        // Set a timeout for database operations
        const timeout = setTimeout(() => {
          db.close();
          resolve({
            content: [{ type: 'text' as const, text: 'Database operation timed out (database may be locked)' }],
            isError: true,
          });
        }, 10000); // 10 second timeout

        // Extract aiService.prompts
        db.get("SELECT value FROM ItemTable WHERE key = 'aiService.prompts';", [], (err, row) => {
          clearTimeout(timeout);
          if (err) {
            logger.error(`Error extracting prompts:`, err);
            db.close();
            return resolve({
              content: [{ type: 'text' as const, text: `Error extracting prompts: ${err.message}` }],
              isError: true,
            });
          }

          db.close((err) => {
            if (err) {
              logger.error(`Error closing database connection:`, err);
            }
          });

          if (!row) {
            return resolve({
              content: [{ type: 'text' as const, text: `No aiService.prompts found in workspace ${input.workspaceId}` }],
            });
          }

          try {
            // Parse the JSON data
            const promptsData = JSON.parse((row as any).value.toString());
            
            if (!Array.isArray(promptsData)) {
              return resolve({
                content: [{ type: 'text' as const, text: `aiService.prompts data is not an array` }],
                isError: true,
              });
            }

            // Format output
            let text = `Prompts from Workspace: ${input.workspaceId}\n`;
            text += `Total prompts: ${promptsData.length}\n\n`;
            
            if (promptsData.length === 0) {
              text += 'No prompts found.\n';
            } else {
              for (let i = 0; i < promptsData.length; i++) {
                const prompt = promptsData[i];
                text += `--- Prompt ${i + 1} ---\n`;
                if (prompt.text) {
                  text += `Text: ${prompt.text}\n`;
                }
                if (prompt.commandType !== undefined) {
                  text += `Command Type: ${prompt.commandType}\n`;
                }
                text += '\n';
              }
            }

            resolve({
              content: [{ type: 'text' as const, text }],
            });
          } catch (parseErr: any) {
            logger.error(`Error parsing prompts JSON:`, parseErr);
            resolve({
              content: [{ type: 'text' as const, text: `Error parsing prompts data: ${parseErr.message}` }],
              isError: true,
            });
          }
        });
      });
    }
  );

  /**
   * Tool: extractGenerations
   * Extracts all textDescription fields from aiService.generations in a workspace database.
   */
  server.registerTool(
    'extractGenerations',
    {
      title: 'Extract Generation Descriptions',
      description: 'Extracts all textDescription fields from aiService.generations in a workspace database as plain text.',
      inputSchema: {
        workspaceId: z.string().describe('The workspace ID (folder name) to extract generations from.'),
      },
    },
    async (input: { workspaceId: string }) => {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      logger.info(`Tool 'extractGenerations' called for workspace: ${input.workspaceId}`);
      
      // Construct path to the database
      const workspaceStorageDir = path.join(
        process.env.HOME || process.env.USERPROFILE || '',
        'AppData', 'Roaming', 'Cursor', 'User', 'workspaceStorage'
      );
      const dbPath = path.join(workspaceStorageDir, input.workspaceId, 'state.vscdb');
      
      // Check if database exists
      try {
        await fs.access(dbPath);
      } catch (err: any) {
        logger.error(`Database not found: ${dbPath}`);
        return {
          content: [{ type: 'text' as const, text: `Database not found for workspace ${input.workspaceId}` }],
          isError: true,
        };
      }
      
      return new Promise((resolve) => {
        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
          if (err) {
            logger.error(`Failed to connect to database at ${dbPath}:`, err);
            let errorMessage = `Error connecting to database: ${err.message}`;
            if (err.message.includes('SQLITE_BUSY') || err.message.includes('database is locked')) {
              errorMessage += ' (Database is currently locked by another process)';
            } else if (err.message.includes('SQLITE_CORRUPT') || err.message.includes('malformed')) {
              errorMessage += ' (Database appears to be corrupted)';
            }
            return resolve({
              content: [{ type: 'text' as const, text: errorMessage }],
              isError: true,
            });
          }
          logger.info(`Successfully connected to database: ${dbPath}`);
        });

        // Set a timeout for database operations
        const timeout = setTimeout(() => {
          db.close();
          resolve({
            content: [{ type: 'text' as const, text: 'Database operation timed out (database may be locked)' }],
            isError: true,
          });
        }, 10000); // 10 second timeout

        // Extract aiService.generations
        db.get("SELECT value FROM ItemTable WHERE key = 'aiService.generations';", [], (err, row) => {
          clearTimeout(timeout);
          if (err) {
            logger.error(`Error extracting generations:`, err);
            db.close();
            return resolve({
              content: [{ type: 'text' as const, text: `Error extracting generations: ${err.message}` }],
              isError: true,
            });
          }

          db.close((err) => {
            if (err) {
              logger.error(`Error closing database connection:`, err);
            }
          });

          if (!row) {
            return resolve({
              content: [{ type: 'text' as const, text: `No aiService.generations found in workspace ${input.workspaceId}` }],
            });
          }

          try {
            // Parse the JSON data
            const generationsData = JSON.parse((row as any).value.toString());
            
            if (!Array.isArray(generationsData)) {
              return resolve({
                content: [{ type: 'text' as const, text: `aiService.generations data is not an array` }],
                isError: true,
              });
            }

            // Format output
            let text = `Generations from Workspace: ${input.workspaceId}\n`;
            text += `Total generations: ${generationsData.length}\n\n`;
            
            if (generationsData.length === 0) {
              text += 'No generations found.\n';
            } else {
              let generationsWithText = 0;
              for (let i = 0; i < generationsData.length; i++) {
                const generation = generationsData[i];
                if (generation.textDescription) {
                  generationsWithText++;
                  text += `--- Generation ${i + 1} ---\n`;
                  if (generation.unixMs) {
                    const date = new Date(generation.unixMs);
                    text += `Timestamp: ${date.toISOString()}\n`;
                  }
                  if (generation.type) {
                    text += `Type: ${generation.type}\n`;
                  }
                  if (generation.generationUUID) {
                    text += `UUID: ${generation.generationUUID}\n`;
                  }
                  text += `Description: ${generation.textDescription}\n`;
                  text += '\n';
                }
              }
              
              if (generationsWithText === 0) {
                text += 'No generations with textDescription found.\n';
              } else {
                text += `\nSummary: ${generationsWithText} of ${generationsData.length} generations have textDescription.\n`;
              }
            }

            resolve({
              content: [{ type: 'text' as const, text }],
            });
          } catch (parseErr: any) {
            logger.error(`Error parsing generations JSON:`, parseErr);
            resolve({
              content: [{ type: 'text' as const, text: `Error parsing generations data: ${parseErr.message}` }],
              isError: true,
            });
          }
        });
      });
    }
  );

  /**
   * Tool: listGenerationTypes
   * Extracts and displays all unique types from aiService.generations.
   */
  server.registerTool(
    'listGenerationTypes',
    {
      title: 'List Generation Types',
      description: 'Lists all unique types found in aiService.generations for a workspace.',
      inputSchema: {
        workspaceId: z.string().describe('The workspace ID (folder name) to analyze generation types from.'),
      },
    },
    async (input: { workspaceId: string }) => {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      logger.info(`Tool 'listGenerationTypes' called for workspace: ${input.workspaceId}`);
      
      // Construct path to the database
      const workspaceStorageDir = path.join(
        process.env.HOME || process.env.USERPROFILE || '',
        'AppData', 'Roaming', 'Cursor', 'User', 'workspaceStorage'
      );
      const dbPath = path.join(workspaceStorageDir, input.workspaceId, 'state.vscdb');
      
      // Check if database exists
      try {
        await fs.access(dbPath);
      } catch (err: any) {
        logger.error(`Database not found: ${dbPath}`);
        return {
          content: [{ type: 'text' as const, text: `Database not found for workspace ${input.workspaceId}` }],
          isError: true,
        };
      }
      
      return new Promise((resolve) => {
        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
          if (err) {
            logger.error(`Failed to connect to database at ${dbPath}:`, err);
            let errorMessage = `Error connecting to database: ${err.message}`;
            if (err.message.includes('SQLITE_BUSY') || err.message.includes('database is locked')) {
              errorMessage += ' (Database is currently locked by another process)';
            } else if (err.message.includes('SQLITE_CORRUPT') || err.message.includes('malformed')) {
              errorMessage += ' (Database appears to be corrupted)';
            }
            return resolve({
              content: [{ type: 'text' as const, text: errorMessage }],
              isError: true,
            });
          }
          logger.info(`Successfully connected to database: ${dbPath}`);
        });

        // Set a timeout for database operations
        const timeout = setTimeout(() => {
          db.close();
          resolve({
            content: [{ type: 'text' as const, text: 'Database operation timed out (database may be locked)' }],
            isError: true,
          });
        }, 10000); // 10 second timeout

        // Extract aiService.generations
        db.get("SELECT value FROM ItemTable WHERE key = 'aiService.generations';", [], (err, row) => {
          clearTimeout(timeout);
          if (err) {
            logger.error(`Error extracting generations:`, err);
            db.close();
            return resolve({
              content: [{ type: 'text' as const, text: `Error extracting generations: ${err.message}` }],
              isError: true,
            });
          }

          db.close((err) => {
            if (err) {
              logger.error(`Error closing database connection:`, err);
            }
          });

          if (!row) {
            return resolve({
              content: [{ type: 'text' as const, text: `No aiService.generations found in workspace ${input.workspaceId}` }],
            });
          }

          try {
            // Parse the JSON data
            const generationsData = JSON.parse((row as any).value.toString());
            
            if (!Array.isArray(generationsData)) {
              return resolve({
                content: [{ type: 'text' as const, text: `aiService.generations data is not an array` }],
                isError: true,
              });
            }

            // Collect unique types and count occurrences
            const typeCounts: { [key: string]: number } = {};
            let totalGenerations = generationsData.length;
            let generationsWithoutType = 0;

            for (const generation of generationsData) {
              if (generation.type) {
                typeCounts[generation.type] = (typeCounts[generation.type] || 0) + 1;
              } else {
                generationsWithoutType++;
              }
            }

            // Format output
            let text = `Generation Types from Workspace: ${input.workspaceId}\n`;
            text += `Total generations: ${totalGenerations}\n\n`;

            const uniqueTypes = Object.keys(typeCounts);
            if (uniqueTypes.length === 0 && generationsWithoutType === 0) {
              text += 'No generations found.\n';
            } else {
              if (uniqueTypes.length > 0) {
                text += `Unique types found (${uniqueTypes.length}):\n`;
                for (const type of uniqueTypes.sort()) {
                  text += `- ${type}: ${typeCounts[type]} occurrence${typeCounts[type] > 1 ? 's' : ''}\n`;
                }
              }

              if (generationsWithoutType > 0) {
                text += `\nGenerations without type: ${generationsWithoutType}\n`;
              }

              text += `\nSummary: ${uniqueTypes.length} unique types, ${totalGenerations - generationsWithoutType} typed generations, ${generationsWithoutType} untyped.\n`;
            }

            resolve({
              content: [{ type: 'text' as const, text }],
            });
          } catch (parseErr: any) {
            logger.error(`Error parsing generations JSON:`, parseErr);
            resolve({
              content: [{ type: 'text' as const, text: `Error parsing generations data: ${parseErr.message}` }],
              isError: true,
            });
          }
        });
      });
    }
  );

  /**
   * Tool: listAllKeys
   * Lists all keys in ItemTable with their value types and sizes.
   */
  server.registerTool(
    'listAllKeys',
    {
      title: 'List All Database Keys',
      description: 'Lists all keys in ItemTable with their value types (JSON, binary, text) and sizes.',
      inputSchema: {
        workspaceId: z.string().describe('The workspace ID (folder name) to list keys from.'),
      },
    },
    async (input: { workspaceId: string }) => {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      logger.info(`Tool 'listAllKeys' called for workspace: ${input.workspaceId}`);
      
      // Construct path to the database
      const workspaceStorageDir = path.join(
        process.env.HOME || process.env.USERPROFILE || '',
        'AppData', 'Roaming', 'Cursor', 'User', 'workspaceStorage'
      );
      const dbPath = path.join(workspaceStorageDir, input.workspaceId, 'state.vscdb');
      
      // Check if database exists
      try {
        await fs.access(dbPath);
      } catch (err: any) {
        logger.error(`Database not found: ${dbPath}`);
        return {
          content: [{ type: 'text' as const, text: `Database not found for workspace ${input.workspaceId}` }],
          isError: true,
        };
      }
      
      return new Promise((resolve) => {
        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
          if (err) {
            logger.error(`Failed to connect to database at ${dbPath}:`, err);
            let errorMessage = `Error connecting to database: ${err.message}`;
            if (err.message.includes('SQLITE_BUSY') || err.message.includes('database is locked')) {
              errorMessage += ' (Database is currently locked by another process)';
            } else if (err.message.includes('SQLITE_CORRUPT') || err.message.includes('malformed')) {
              errorMessage += ' (Database appears to be corrupted)';
            }
            return resolve({
              content: [{ type: 'text' as const, text: errorMessage }],
              isError: true,
            });
          }
          logger.info(`Successfully connected to database: ${dbPath}`);
        });

        // Set a timeout for database operations
        const timeout = setTimeout(() => {
          db.close();
          resolve({
            content: [{ type: 'text' as const, text: 'Database operation timed out (database may be locked)' }],
            isError: true,
          });
        }, 10000); // 10 second timeout

        // Get all keys with their values
        db.all("SELECT key, value FROM ItemTable ORDER BY key;", [], (err, rows) => {
          clearTimeout(timeout);
          if (err) {
            logger.error(`Error listing keys:`, err);
            db.close();
            return resolve({
              content: [{ type: 'text' as const, text: `Error listing keys: ${err.message}` }],
              isError: true,
            });
          }

          db.close((err) => {
            if (err) {
              logger.error(`Error closing database connection:`, err);
            }
          });

          // Analyze each key's value type
          const keyAnalysis: Array<{
            key: string;
            type: string;
            size: number;
            preview?: string;
          }> = [];

          for (const row of rows) {
            const key = (row as any).key;
            const value = (row as any).value;
            const size = Buffer.isBuffer(value) ? value.length : value.toString().length;
            
            let type = 'unknown';
            let preview: string | undefined;

            try {
              if (Buffer.isBuffer(value)) {
                const strValue = value.toString('utf8');
                try {
                  JSON.parse(strValue);
                  type = 'JSON';
                  preview = strValue.length > 100 ? strValue.substring(0, 100) + '...' : strValue;
                } catch {
                  // Check if it's printable text
                  if (/^[\x20-\x7E\s]*$/.test(strValue)) {
                    type = 'text';
                    preview = strValue.length > 100 ? strValue.substring(0, 100) + '...' : strValue;
                  } else {
                    type = 'binary';
                    preview = `<binary data, ${size} bytes>`;
                  }
                }
              } else {
                const strValue = value.toString();
                try {
                  JSON.parse(strValue);
                  type = 'JSON';
                  preview = strValue.length > 100 ? strValue.substring(0, 100) + '...' : strValue;
                } catch {
                  type = 'text';
                  preview = strValue.length > 100 ? strValue.substring(0, 100) + '...' : strValue;
                }
              }
            } catch (err) {
              type = 'error';
              preview = 'Error analyzing value';
            }

            keyAnalysis.push({ key, type, size, preview });
          }

          // Format output
          let text = `All Keys in Workspace: ${input.workspaceId}\n`;
          text += `Total keys: ${keyAnalysis.length}\n\n`;

          // Group by type
          const typeGroups: { [type: string]: typeof keyAnalysis } = {};
          for (const item of keyAnalysis) {
            if (!typeGroups[item.type]) {
              typeGroups[item.type] = [];
            }
            typeGroups[item.type].push(item);
          }

          // Display summary
          text += 'Type Summary:\n';
          for (const [type, items] of Object.entries(typeGroups)) {
            text += `- ${type}: ${items.length} key${items.length > 1 ? 's' : ''}\n`;
          }
          text += '\n';

          // Display detailed list
          text += 'Detailed Key List:\n';
          text += 'Key                                      | Type   | Size     | Preview\n';
          text += '-----------------------------------------|--------|----------|------------------\n';
          
          for (const item of keyAnalysis) {
            const keyTrunc = item.key.length > 40 ? item.key.substring(0, 37) + '...' : item.key;
            const sizeStr = item.size > 1024 ? `${Math.round(item.size / 1024)}KB` : `${item.size}B`;
            const previewTrunc = item.preview && item.preview.length > 50 ? 
              item.preview.substring(0, 47) + '...' : (item.preview || '');
            
            text += `${keyTrunc.padEnd(40)} | ${item.type.padEnd(6)} | ${sizeStr.padEnd(8)} | ${previewTrunc}\n`;
          }

          resolve({
            content: [{ type: 'text' as const, text }],
          });
        });
      });
    }
  );

  /**
   * Tool: drilldownKey
   * Extracts and displays data from a specific key in ItemTable.
   */
  server.registerTool(
    'drilldownKey',
    {
      title: 'Drilldown Key Data',
      description: 'Extracts and displays the full data from a specific key in ItemTable.',
      inputSchema: {
        workspaceId: z.string().describe('The workspace ID (folder name) to extract data from.'),
        key: z.string().describe('The specific key to extract data from (e.g., "aiService.prompts").'),
      },
    },
    async (input: { workspaceId: string; key: string }) => {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      logger.info(`Tool 'drilldownKey' called for workspace: ${input.workspaceId}, key: ${input.key}`);
      
      // Construct path to the database
      const workspaceStorageDir = path.join(
        process.env.HOME || process.env.USERPROFILE || '',
        'AppData', 'Roaming', 'Cursor', 'User', 'workspaceStorage'
      );
      const dbPath = path.join(workspaceStorageDir, input.workspaceId, 'state.vscdb');
      
      // Check if database exists
      try {
        await fs.access(dbPath);
      } catch (err: any) {
        logger.error(`Database not found: ${dbPath}`);
        return {
          content: [{ type: 'text' as const, text: `Database not found for workspace ${input.workspaceId}` }],
          isError: true,
        };
      }
      
      return new Promise((resolve) => {
        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
          if (err) {
            logger.error(`Failed to connect to database at ${dbPath}:`, err);
            let errorMessage = `Error connecting to database: ${err.message}`;
            if (err.message.includes('SQLITE_BUSY') || err.message.includes('database is locked')) {
              errorMessage += ' (Database is currently locked by another process)';
            } else if (err.message.includes('SQLITE_CORRUPT') || err.message.includes('malformed')) {
              errorMessage += ' (Database appears to be corrupted)';
            }
            return resolve({
              content: [{ type: 'text' as const, text: errorMessage }],
              isError: true,
            });
          }
          logger.info(`Successfully connected to database: ${dbPath}`);
        });

        // Set a timeout for database operations
        const timeout = setTimeout(() => {
          db.close();
          resolve({
            content: [{ type: 'text' as const, text: 'Database operation timed out (database may be locked)' }],
            isError: true,
          });
        }, 10000); // 10 second timeout

        // Extract specific key
        db.get("SELECT value FROM ItemTable WHERE key = ?;", [input.key], (err, row) => {
          clearTimeout(timeout);
          if (err) {
            logger.error(`Error extracting key '${input.key}':`, err);
            db.close();
            return resolve({
              content: [{ type: 'text' as const, text: `Error extracting key '${input.key}': ${err.message}` }],
              isError: true,
            });
          }

          db.close((err) => {
            if (err) {
              logger.error(`Error closing database connection:`, err);
            }
          });

          if (!row) {
            return resolve({
              content: [{ type: 'text' as const, text: `Key '${input.key}' not found in workspace ${input.workspaceId}` }],
            });
          }

          const value = (row as any).value;
          let text = `Key Data from Workspace: ${input.workspaceId}\n`;
          text += `Key: ${input.key}\n\n`;

          try {
            // Determine value type and format accordingly
            const size = Buffer.isBuffer(value) ? value.length : value.toString().length;
            text += `Size: ${size > 1024 ? Math.round(size / 1024) + 'KB' : size + 'B'}\n`;

            if (Buffer.isBuffer(value)) {
              const strValue = value.toString('utf8');
              try {
                // Try to parse as JSON
                const jsonData = JSON.parse(strValue);
                text += `Type: JSON\n\n`;
                text += `Formatted JSON:\n`;
                text += JSON.stringify(jsonData, null, 2);
              } catch {
                // Check if it's printable text
                if (/^[\x20-\x7E\s]*$/.test(strValue)) {
                  text += `Type: Text\n\n`;
                  text += `Content:\n${strValue}`;
                } else {
                  text += `Type: Binary\n\n`;
                  text += `Binary data (${size} bytes)\n`;
                  text += `First 100 bytes as hex: ${value.slice(0, 100).toString('hex')}`;
                  if (size > 100) {
                    text += '...';
                  }
                }
              }
            } else {
              const strValue = value.toString();
              try {
                // Try to parse as JSON
                const jsonData = JSON.parse(strValue);
                text += `Type: JSON\n\n`;
                text += `Formatted JSON:\n`;
                text += JSON.stringify(jsonData, null, 2);
              } catch {
                text += `Type: Text\n\n`;
                text += `Content:\n${strValue}`;
              }
            }

            resolve({
              content: [{ type: 'text' as const, text }],
            });
          } catch (parseErr: any) {
            logger.error(`Error processing key data:`, parseErr);
            resolve({
              content: [{ type: 'text' as const, text: `Error processing key data: ${parseErr.message}` }],
              isError: true,
            });
          }
        });
      });
    }
  );

  /**
   * Tool: exportWorkspaceData
   * Exports extracted workspace data to text/markdown files.
   */
  server.registerTool(
    'exportWorkspaceData',
    {
      title: 'Export Workspace Data',
      description: 'Exports workspace data (prompts, generations, or all) to text/markdown files.',
      inputSchema: {
        workspaceId: z.string().describe('The workspace ID (folder name) to export data from.'),
        exportType: z.enum(['prompts', 'generations', 'all']).describe('What data to export: prompts, generations, or all.'),
        outputDir: z.string().optional().describe('Output directory (defaults to current directory).'),
      },
    },
    async (input: { workspaceId: string; exportType: 'prompts' | 'generations' | 'all'; outputDir?: string }) => {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      logger.info(`Tool 'exportWorkspaceData' called for workspace: ${input.workspaceId}, type: ${input.exportType}`);
      
      // Construct paths
      const workspaceStorageDir = path.join(
        process.env.HOME || process.env.USERPROFILE || '',
        'AppData', 'Roaming', 'Cursor', 'User', 'workspaceStorage'
      );
      const dbPath = path.join(workspaceStorageDir, input.workspaceId, 'state.vscdb');
      const outputDir = input.outputDir || '.';
      
      // Check if database exists
      try {
        await fs.access(dbPath);
      } catch (err: any) {
        logger.error(`Database not found: ${dbPath}`);
        return {
          content: [{ type: 'text' as const, text: `Database not found for workspace ${input.workspaceId}` }],
          isError: true,
        };
      }
      
      // Ensure output directory exists
      try {
        await fs.mkdir(outputDir, { recursive: true });
      } catch (err: any) {
        logger.error(`Failed to create output directory: ${outputDir}`, err);
        return {
          content: [{ type: 'text' as const, text: `Failed to create output directory: ${err.message}` }],
          isError: true,
        };
      }
      
      return new Promise((resolve) => {
        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
          if (err) {
            logger.error(`Failed to connect to database at ${dbPath}:`, err);
            let errorMessage = `Error connecting to database: ${err.message}`;
            if (err.message.includes('SQLITE_BUSY') || err.message.includes('database is locked')) {
              errorMessage += ' (Database is currently locked by another process)';
            } else if (err.message.includes('SQLITE_CORRUPT') || err.message.includes('malformed')) {
              errorMessage += ' (Database appears to be corrupted)';
            }
            return resolve({
              content: [{ type: 'text' as const, text: errorMessage }],
              isError: true,
            });
          }
          logger.info(`Successfully connected to database: ${dbPath}`);
        });

        // Set a timeout for database operations
        const timeout = setTimeout(() => {
          db.close();
          resolve({
            content: [{ type: 'text' as const, text: 'Database operation timed out (database may be locked)' }],
            isError: true,
          });
        }, 15000); // 15 second timeout for file operations

        const exportPromises: Promise<string>[] = [];

        // Export prompts if requested
        if (input.exportType === 'prompts' || input.exportType === 'all') {
          const promptsPromise = new Promise<string>((resolvePrompts) => {
            db.get("SELECT value FROM ItemTable WHERE key = 'aiService.prompts';", [], async (err, row) => {
              if (err || !row) {
                resolvePrompts(`Prompts: ${err ? 'Error - ' + err.message : 'Not found'}`);
                return;
              }

              try {
                const promptsData = JSON.parse((row as any).value.toString());
                let content = `# Prompts from Workspace ${input.workspaceId}\n\n`;
                content += `Export Date: ${new Date().toISOString()}\n`;
                content += `Total Prompts: ${Array.isArray(promptsData) ? promptsData.length : 0}\n\n`;

                if (Array.isArray(promptsData)) {
                  for (let i = 0; i < promptsData.length; i++) {
                    const prompt = promptsData[i];
                    content += `## Prompt ${i + 1}\n\n`;
                    if (prompt.text) {
                      content += `**Text:** ${prompt.text}\n\n`;
                    }
                    if (prompt.commandType !== undefined) {
                      content += `**Command Type:** ${prompt.commandType}\n\n`;
                    }
                    content += '---\n\n';
                  }
                }

                const filename = path.join(outputDir, `${input.workspaceId}_prompts.md`);
                await fs.writeFile(filename, content, 'utf8');
                resolvePrompts(`Prompts exported to: ${filename}`);
              } catch (parseErr: any) {
                resolvePrompts(`Prompts: Error parsing data - ${parseErr.message}`);
              }
            });
          });
          exportPromises.push(promptsPromise);
        }

        // Export generations if requested
        if (input.exportType === 'generations' || input.exportType === 'all') {
          const generationsPromise = new Promise<string>((resolveGenerations) => {
            db.get("SELECT value FROM ItemTable WHERE key = 'aiService.generations';", [], async (err, row) => {
              if (err || !row) {
                resolveGenerations(`Generations: ${err ? 'Error - ' + err.message : 'Not found'}`);
                return;
              }

              try {
                const generationsData = JSON.parse((row as any).value.toString());
                let content = `# Generations from Workspace ${input.workspaceId}\n\n`;
                content += `Export Date: ${new Date().toISOString()}\n`;
                content += `Total Generations: ${Array.isArray(generationsData) ? generationsData.length : 0}\n\n`;

                if (Array.isArray(generationsData)) {
                  let generationsWithText = 0;
                  for (let i = 0; i < generationsData.length; i++) {
                    const generation = generationsData[i];
                    if (generation.textDescription) {
                      generationsWithText++;
                      content += `## Generation ${i + 1}\n\n`;
                      if (generation.unixMs) {
                        const date = new Date(generation.unixMs);
                        content += `**Timestamp:** ${date.toISOString()}\n\n`;
                      }
                      if (generation.type) {
                        content += `**Type:** ${generation.type}\n\n`;
                      }
                      if (generation.generationUUID) {
                        content += `**UUID:** ${generation.generationUUID}\n\n`;
                      }
                      content += `**Description:** ${generation.textDescription}\n\n`;
                      content += '---\n\n';
                    }
                  }
                  content += `\n**Summary:** ${generationsWithText} of ${generationsData.length} generations had text descriptions.\n`;
                }

                const filename = path.join(outputDir, `${input.workspaceId}_generations.md`);
                await fs.writeFile(filename, content, 'utf8');
                resolveGenerations(`Generations exported to: ${filename}`);
              } catch (parseErr: any) {
                resolveGenerations(`Generations: Error parsing data - ${parseErr.message}`);
              }
            });
          });
          exportPromises.push(generationsPromise);
        }

        // Wait for all exports to complete
        Promise.all(exportPromises).then((results) => {
          clearTimeout(timeout);
          db.close((err) => {
            if (err) {
              logger.error(`Error closing database connection:`, err);
            }
          });

          let text = `Export completed for workspace: ${input.workspaceId}\n`;
          text += `Export type: ${input.exportType}\n`;
          text += `Output directory: ${path.resolve(outputDir)}\n\n`;
          text += `Results:\n`;
          for (const result of results) {
            text += `- ${result}\n`;
          }

          resolve({
            content: [{ type: 'text' as const, text }],
          });
        }).catch((exportErr) => {
          clearTimeout(timeout);
          db.close();
          resolve({
            content: [{ type: 'text' as const, text: `Export failed: ${exportErr.message}` }],
            isError: true,
          });
        });
      });
    }
  );

  logger.info('All Cursor tools registered.');
} 