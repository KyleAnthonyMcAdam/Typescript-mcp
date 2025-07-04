/**
 * @file data-exporter.ts
 * Comprehensive data extraction and export
 * 
 * Consolidates: extractPrompts, extractGenerations, exportWorkspaceData, 
 * listGenerationTypes, presentWorkspaceSummary
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

/**
 * Data exporter mode types
 */
export type DataExporterMode = 'prompts' | 'generations' | 'all' | 'summary' | 'analysis';

/**
 * Export format types
 */
export type ExportFormat = 'text' | 'json' | 'csv';

/**
 * Date range filter
 */
interface DateRangeFilter {
  start: string;
  end: string;
}

/**
 * Filter options for data export
 */
interface DataExportFilters {
  dateRange?: DateRangeFilter;
  generationTypes?: string[];
  includeMetadata?: boolean;
}

/**
 * Export configuration
 */
interface ExportConfig {
  format?: ExportFormat;
  outputDir?: string;
  filename?: string;
  template?: string;
}

/**
 * Options for data export operations
 */
interface DataExportOptions {
  includeAnalysis?: boolean;
  cleanData?: boolean;
  compress?: boolean;
}

/**
 * Input schema for data exporter tool
 */
export const dataExporterInputSchema = {
  mode: z.enum(['prompts', 'generations', 'all', 'summary', 'analysis']).describe('Export operation mode'),
  workspaceId: z.string().optional().describe('Specific workspace ID'),
  workspaceIds: z.array(z.string()).optional().describe('Multiple workspace IDs'),
  filters: z.object({
    dateRange: z.object({
      start: z.string(),
      end: z.string()
    }).optional(),
    generationTypes: z.array(z.string()).optional(),
    includeMetadata: z.boolean().optional()
  }).optional().describe('Filtering criteria'),
  export: z.object({
    format: z.enum(['text', 'json', 'csv']).optional(),
    outputDir: z.string().optional(),
    filename: z.string().optional(),
    template: z.string().optional()
  }).optional().describe('Export configuration'),
  options: z.object({
    includeAnalysis: z.boolean().optional(),
    cleanData: z.boolean().optional(),
    compress: z.boolean().optional()
  }).optional().describe('Export options')
};

/**
 * Main data exporter handler function
 */
export async function handleDataExporter(input: {
  mode: 'prompts' | 'generations' | 'all' | 'summary' | 'analysis';
  workspaceId?: string;
  workspaceIds?: string[];
  filters?: DataExportFilters;
  export?: ExportConfig;
  options?: DataExportOptions;
}) {
  logger.info(`Data Exporter called with mode: ${input.mode}`);
  
  const formatOptions: FormattingOptions = {
    format: DEFAULT_FORMAT_OPTIONS.format,
    pretty: true,
  };

  try {
    switch (input.mode) {
      case 'prompts':
        return await handlePromptsExport(input, formatOptions);
      case 'generations':
        return await handleGenerationsExport(input, formatOptions);
      case 'all':
        return await handleFullDataExport(input, formatOptions);
      case 'summary':
        return await handleSummaryExport(input, formatOptions);
      case 'analysis':
        return await handleAnalysisExport(input, formatOptions);
      default:
        throw new Error(`Unsupported mode: ${input.mode}`);
    }
  } catch (error) {
    logger.error(`Data Exporter error:`, error);
    return {
      content: [{ 
        type: 'text' as const, 
        text: formatError(`Data Exporter Error: ${error instanceof Error ? error.message : 'Unknown error'}`) 
      }],
      isError: true,
    };
  }
}

/**
 * Handle prompts export
 */
async function handlePromptsExport(input: any, formatOptions: FormattingOptions): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  logger.info('Handling prompts export operation');
  
  if (!input.workspaceId) {
    throw new Error('Prompts export requires a workspaceId');
  }
  
  const fs = await import('fs/promises');
  const path = await import('path');
  
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
    throw new Error(`Database not found for workspace ${input.workspaceId}`);
  }
  
  return new Promise((resolve) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err: any) => {
      if (err) {
        logger.error(`Failed to connect to database at ${dbPath}:`, err);
        let errorMessage = `Error connecting to database: ${err.message}`;
        if (err.message.includes('SQLITE_BUSY') || err.message.includes('database is locked')) {
          errorMessage += ' (Database is currently locked by another process)';
        } else if (err.message.includes('SQLITE_CORRUPT') || err.message.includes('malformed')) {
          errorMessage += ' (Database appears to be corrupted)';
        }
        return resolve({
          content: [{ type: 'text' as const, text: formatError(errorMessage) }],
          isError: true,
        });
      }
      logger.info(`Successfully connected to database: ${dbPath}`);
    });

    // Set a timeout for database operations
    const timeout = setTimeout(() => {
      db.close();
      resolve({
        content: [{ type: 'text' as const, text: formatError('Database operation timed out (database may be locked)') }],
        isError: true,
      });
    }, 10000); // 10 second timeout

    // Extract aiService.prompts
    db.get("SELECT value FROM ItemTable WHERE key = 'aiService.prompts';", [], (err: any, row: any) => {
      clearTimeout(timeout);
      if (err) {
        logger.error(`Error extracting prompts:`, err);
        db.close();
        return resolve({
          content: [{ type: 'text' as const, text: formatError(`Error extracting prompts: ${err.message}`) }],
          isError: true,
        });
      }

      db.close((err: any) => {
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
            content: [{ type: 'text' as const, text: formatError(`aiService.prompts data is not an array`) }],
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
          content: [{ type: 'text' as const, text: formatError(`Error parsing prompts data: ${parseErr.message}`) }],
          isError: true,
        });
      }
    });
  });
}

/**
 * Handle generations export
 */
async function handleGenerationsExport(input: any, formatOptions: FormattingOptions): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  logger.info('Handling generations export operation');
  
  if (!input.workspaceId) {
    throw new Error('Generations export requires a workspaceId');
  }
  
  const fs = await import('fs/promises');
  const path = await import('path');
  
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
    throw new Error(`Database not found for workspace ${input.workspaceId}`);
  }
  
  return new Promise((resolve) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err: any) => {
      if (err) {
        logger.error(`Failed to connect to database at ${dbPath}:`, err);
        let errorMessage = `Error connecting to database: ${err.message}`;
        if (err.message.includes('SQLITE_BUSY') || err.message.includes('database is locked')) {
          errorMessage += ' (Database is currently locked by another process)';
        } else if (err.message.includes('SQLITE_CORRUPT') || err.message.includes('malformed')) {
          errorMessage += ' (Database appears to be corrupted)';
        }
        return resolve({
          content: [{ type: 'text' as const, text: formatError(errorMessage) }],
          isError: true,
        });
      }
      logger.info(`Successfully connected to database: ${dbPath}`);
    });

    // Set a timeout for database operations
    const timeout = setTimeout(() => {
      db.close();
      resolve({
        content: [{ type: 'text' as const, text: formatError('Database operation timed out (database may be locked)') }],
        isError: true,
      });
    }, 10000); // 10 second timeout

    // Extract aiService.generations
    db.get("SELECT value FROM ItemTable WHERE key = 'aiService.generations';", [], (err: any, row: any) => {
      clearTimeout(timeout);
      if (err) {
        logger.error(`Error extracting generations:`, err);
        db.close();
        return resolve({
          content: [{ type: 'text' as const, text: formatError(`Error extracting generations: ${err.message}`) }],
          isError: true,
        });
      }

      db.close((err: any) => {
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
            content: [{ type: 'text' as const, text: formatError(`aiService.generations data is not an array`) }],
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
          content: [{ type: 'text' as const, text: formatError(`Error parsing generations data: ${parseErr.message}`) }],
          isError: true,
        });
      }
    });
  });
}

/**
 * Handle full data export
 */
async function handleFullDataExport(input: any, formatOptions: FormattingOptions): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  logger.info('Handling full data export operation');
  
  if (!input.workspaceId) {
    throw new Error('Full data export requires a workspaceId');
  }
  
  const fs = await import('fs/promises');
  const path = await import('path');
  
  // Construct paths
  const workspaceStorageDir = path.join(
    process.env.HOME || process.env.USERPROFILE || '',
    'AppData', 'Roaming', 'Cursor', 'User', 'workspaceStorage'
  );
  const dbPath = path.join(workspaceStorageDir, input.workspaceId, 'state.vscdb');
  const outputDir = input.export?.outputDir || '.';
  
  // Check if database exists
  try {
    await fs.access(dbPath);
  } catch (err: any) {
    logger.error(`Database not found: ${dbPath}`);
    throw new Error(`Database not found for workspace ${input.workspaceId}`);
  }
  
  // Ensure output directory exists
  try {
    await fs.mkdir(outputDir, { recursive: true });
  } catch (err: any) {
    logger.error(`Failed to create output directory: ${outputDir}`, err);
    throw new Error(`Failed to create output directory: ${err.message}`);
  }
  
  return new Promise((resolve) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err: any) => {
      if (err) {
        logger.error(`Failed to connect to database at ${dbPath}:`, err);
        let errorMessage = `Error connecting to database: ${err.message}`;
        if (err.message.includes('SQLITE_BUSY') || err.message.includes('database is locked')) {
          errorMessage += ' (Database is currently locked by another process)';
        } else if (err.message.includes('SQLITE_CORRUPT') || err.message.includes('malformed')) {
          errorMessage += ' (Database appears to be corrupted)';
        }
        return resolve({
          content: [{ type: 'text' as const, text: formatError(errorMessage) }],
          isError: true,
        });
      }
      logger.info(`Successfully connected to database: ${dbPath}`);
    });

    // Set a timeout for database operations
    const timeout = setTimeout(() => {
      db.close();
      resolve({
        content: [{ type: 'text' as const, text: formatError('Database operation timed out (database may be locked)') }],
        isError: true,
      });
    }, 15000); // 15 second timeout for file operations

    const exportPromises: Promise<string>[] = [];

    // Export prompts
    const promptsPromise = new Promise<string>((resolvePrompts) => {
      db.get("SELECT value FROM ItemTable WHERE key = 'aiService.prompts';", [], async (err: any, row: any) => {
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

    // Export generations
    const generationsPromise = new Promise<string>((resolveGenerations) => {
      db.get("SELECT value FROM ItemTable WHERE key = 'aiService.generations';", [], async (err: any, row: any) => {
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

    // Wait for all exports to complete
    Promise.all(exportPromises).then((results) => {
      clearTimeout(timeout);
      db.close((err: any) => {
        if (err) {
          logger.error(`Error closing database connection:`, err);
        }
      });

      let text = `Export completed for workspace: ${input.workspaceId}\n`;
      text += `Export type: all\n`;
      text += `Output directory: ${path.resolve(outputDir)}\n\n`;
      text += `Results:\n`;
      for (const result of results) {
        text += `- ${result}\n`;
      }

      resolve({
        content: [{ type: 'text' as const, text }],
      });
    }).catch((exportErr: any) => {
      clearTimeout(timeout);
      db.close();
      resolve({
        content: [{ type: 'text' as const, text: formatError(`Export failed: ${exportErr.message}`) }],
        isError: true,
      });
    });
  });
}

/**
 * Handle workspace summary export
 */
async function handleSummaryExport(input: any, formatOptions: FormattingOptions): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  logger.info('Handling summary export operation');
  
  const fs = await import('fs/promises');
  const path = await import('path');
  
  const format = input.export?.format || 'table';
  const sortBy = input.filters?.sortBy || 'modified';
  const limit = input.options?.limit;
  
  logger.info(`Summary export: format=${format}, sortBy=${sortBy}, limit=${limit}`);
  
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
      content: [{ type: 'text' as const, text: formatError(`Error accessing workspace storage: ${err.message}`) }],
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

/**
 * Helper function to extract enhanced workspace metadata including activity metrics.
 */
async function extractWorkspaceMetadata(dbPath: string): Promise<{
  label: string;
  promptCount: number;
  generationCount: number;
}> {
  return new Promise((resolve) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err: any) => {
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
    db.get("SELECT value FROM ItemTable WHERE key = 'aiService.prompts';", [], (err: any, promptRow: any) => {
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
      db.get("SELECT value FROM ItemTable WHERE key = 'aiService.generations';", [], (err: any, genRow: any) => {
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
 * Handle workspace analysis export
 */
async function handleAnalysisExport(input: any, formatOptions: FormattingOptions): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  logger.info('Handling analysis export operation');
  
  // TODO: Implement comprehensive analysis export with insights
  return {
    content: [{ 
      type: 'text' as const, 
      text: 'Analysis export implementation in progress' 
    }],
  };
}

/**
 * Register the data exporter tool with the MCP server
 */
export function registerDataExporter(server: McpServer) {
  server.registerTool(
    'cursor_data_exporter',
    {
      title: 'Data Exporter',
      description: 'Comprehensive data extraction and export with multiple formats and transformations',
      inputSchema: dataExporterInputSchema,
    },
    handleDataExporter
  );
  
  logger.info('✅ Registered cursor_data_exporter super-tool');
} 