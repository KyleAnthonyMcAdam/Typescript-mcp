/**
 * @file database-query.ts
 * Advanced database querying with intelligent assistance
 * 
 * Consolidates: query_table, query_table_columns, inspectDatabase, 
 * listAllKeys, drilldownKey
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
 * Database query mode types
 */
export type DatabaseQueryMode = 'raw' | 'builder' | 'inspect' | 'keys' | 'schema';

/**
 * Column-based query filters
 */
interface QueryFilters {
  where?: string;
  orderBy?: string;
  limit?: number;
}

/**
 * Query options
 */
interface QueryOptions {
  format?: 'json' | 'table';
  pretty?: boolean;
  includeMetadata?: boolean;
  timeout?: number;
}

/**
 * Input schema for database query tool
 */
export const databaseQueryInputSchema = {
  mode: z.enum(['raw', 'builder', 'inspect', 'keys', 'schema']).describe('Query operation mode'),
  uri: z.string().describe('Database URI (cursor+sqlite://)'),
  query: z.string().optional().describe('Raw SQL query (raw mode)'),
  table: z.string().optional().describe('Target table name'),
  columns: z.array(z.string()).optional().describe('Column selection (builder mode)'),
  key: z.string().optional().describe('Specific key (keys mode)'),
  filters: z.object({
    where: z.string().optional(),
    orderBy: z.string().optional(),
    limit: z.number().optional()
  }).optional().describe('Query filters'),
  options: z.object({
    format: z.enum(['json', 'table']).optional(),
    pretty: z.boolean().optional(),
    includeMetadata: z.boolean().optional(),
    timeout: z.number().optional()
  }).optional().describe('Query options')
};

/**
 * Main database query handler function
 */
export async function handleDatabaseQuery(input: {
  mode: 'raw' | 'builder' | 'inspect' | 'keys' | 'schema';
  uri: string;
  query?: string;
  table?: string;
  columns?: string[];
  key?: string;
  filters?: QueryFilters;
  options?: QueryOptions;
}) {
  logger.info(`Database Query called with mode: ${input.mode}`);
  
  const formatOptions: FormattingOptions = {
    format: input.options?.format || DEFAULT_FORMAT_OPTIONS.format,
    pretty: input.options?.pretty ?? DEFAULT_FORMAT_OPTIONS.pretty,
  };

  try {
    switch (input.mode) {
      case 'raw':
        return await handleRawQuery(input, formatOptions);
      case 'builder':
        return await handleBuilderQuery(input, formatOptions);
      case 'inspect':
        return await handleInspectDatabase(input, formatOptions);
      case 'keys':
        return await handleKeysOperation(input, formatOptions);
      case 'schema':
        return await handleSchemaInspection(input, formatOptions);
      default:
        throw new Error(`Unsupported mode: ${input.mode}`);
    }
  } catch (error) {
    logger.error(`Database Query error:`, error);
    return {
      content: [{ 
        type: 'text' as const, 
        text: formatError(`Database Query Error: ${error instanceof Error ? error.message : 'Unknown error'}`) 
      }],
      isError: true,
    };
  }
}

/**
 * Handle raw SQL query execution
 */
async function handleRawQuery(input: any, formatOptions: FormattingOptions): Promise<any> {
  logger.info('Handling raw SQL query operation');
  
  if (!input.query) {
    throw new Error('Raw query mode requires a SQL query');
  }

  const sqlite3 = await import('sqlite3');
  const dbPath = input.uri.replace('cursor+sqlite://', '');
  const startTime = Date.now();

  logger.info(`Executing raw query on database: ${dbPath}`);

  return new Promise((resolve) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err: any) => {
      if (err) {
        logger.error(`Failed to connect to database at ${dbPath}:`, err);
        return resolve({
          content: [{ type: 'text' as const, text: formatError(`Error connecting to DB: ${err.message}`) }],
          isError: true,
        });
      }
      logger.info(`Successfully connected to database: ${dbPath}`);
    });

    // Execute the raw SQL query
    db.all(input.query, [], (err, rows) => {
      const duration = Date.now() - startTime;
      
      if (err) {
        logger.error(`SQL error for query "${input.query}":`, err);
        db.close();
        return resolve({
          content: [{ type: 'text' as const, text: formatError(`SQL Error: ${err.message}`, { query: input.query }) }],
          isError: true,
        });
      }

      logger.info(`Query successful. Found ${rows.length} rows.`);
      db.close((err) => {
        if (err) {
          logger.error(`Error closing the database connection:`, err);
        }
      });
      
      // Format the results using existing formatQueryResults function
      const formattedResults = formatQueryResults(rows, formatOptions);
      const metadata = input.options?.includeMetadata !== false 
        ? `\n\n-- Query executed in ${duration}ms | ${rows.length} rows returned | Database: ${dbPath}`
        : '';
      
      resolve({
        content: [{ type: 'text' as const, text: formattedResults + metadata }],
      });
    });
  });
}

/**
 * Handle query builder operations
 */
async function handleBuilderQuery(input: any, formatOptions: FormattingOptions): Promise<any> {
  logger.info('Handling query builder operation');
  
  if (!input.table || !input.columns) {
    throw new Error('Builder mode requires table and columns');
  }

  const dbPath = input.uri.replace('cursor+sqlite://', '');
  const startTime = Date.now();

  return new Promise((resolve) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err: any) => {
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
      
      if (input.filters?.where) {
        sql += ` WHERE ${input.filters.where}`;
      }
      
      if (input.filters?.orderBy) {
        sql += ` ORDER BY ${input.filters.orderBy}`;
      }
      
      if (input.filters?.limit) {
        sql += ` LIMIT ${input.filters.limit}`;
      }

      logger.info(`Executing built query: ${sql}`);

      // Execute the built query
      db.all(sql, [], (err, rows) => {
        const duration = Date.now() - startTime;
        
        if (err) {
          logger.error(`SQL error for built query "${sql}":`, err);
          db.close();
          return resolve({
            content: [{ type: 'text' as const, text: formatError(`SQL Error: ${err.message}`, { query: sql }) }],
            isError: true,
          });
        }

        logger.info(`Built query successful. Found ${rows.length} rows.`);
        db.close((err) => {
          if (err) {
            logger.error(`Error closing the database connection:`, err);
          }
        });
        
        // Format the results using existing formatQueryResults function
        const formattedResults = formatQueryResults(rows, formatOptions);
        const metadata = input.options?.includeMetadata !== false 
          ? `\n\n-- Built query executed in ${duration}ms | ${rows.length} rows returned | Table: ${input.table}`
          : '';
        
        resolve({
          content: [{ type: 'text' as const, text: formattedResults + metadata }],
        });
      });
    });
  });
}

/**
 * Handle database inspection operations
 */
async function handleInspectDatabase(input: any, formatOptions: FormattingOptions) {
  logger.info('Handling database inspection operation');
  
  if (!input.table) {
    throw new Error('Inspect mode requires a table name (use workspaceId as table for workspace inspection)');
  }
  
  const fs = await import('fs/promises');
  const path = await import('path');
  
  // For workspace inspection, treat table as workspaceId
  const workspaceId = input.table;
  
  // Construct path to the database
  const workspaceStorageDir = path.join(
    process.env.HOME || process.env.USERPROFILE || '',
    'AppData', 'Roaming', 'Cursor', 'User', 'workspaceStorage'
  );
  const dbPath = path.join(workspaceStorageDir, workspaceId, 'state.vscdb');
  
  // Check if database exists
  try {
    await fs.access(dbPath);
  } catch (err: any) {
    logger.error(`Database not found: ${dbPath}`);
    throw new Error(`Database not found for workspace ${workspaceId}`);
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
        } else if (err.message.includes('SQLITE_PERM') || err.message.includes('permission')) {
          errorMessage += ' (Permission denied accessing database)';
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

    // Get all tables
    db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;", [], (err: any, tables: any) => {
      if (err) {
        clearTimeout(timeout);
        logger.error(`Error listing tables:`, err);
        db.close();
        return resolve({
          content: [{ type: 'text' as const, text: formatError(`Error listing tables: ${err.message}`) }],
          isError: true,
        });
      }

      // Get all keys from ItemTable
      db.all("SELECT key FROM ItemTable ORDER BY key;", [], (err: any, keys: any) => {
        clearTimeout(timeout);
        if (err) {
          logger.error(`Error listing keys from ItemTable:`, err);
          db.close();
          return resolve({
            content: [{ type: 'text' as const, text: formatError(`Error listing keys from ItemTable: ${err.message}`) }],
            isError: true,
          });
        }

        db.close((err: any) => {
          if (err) {
            logger.error(`Error closing database connection:`, err);
          }
        });

        // Format output
        let text = `Database Inspection for Workspace: ${workspaceId}\n`;
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

/**
 * Handle keys operations
 */
async function handleKeysOperation(input: any, formatOptions: FormattingOptions) {
  logger.info('Handling keys operation');
  
  if (!input.table) {
    throw new Error('Keys mode requires a table name (use workspaceId as table for workspace keys)');
  }
  
  const fs = await import('fs/promises');
  const path = await import('path');
  
  // For workspace keys, treat table as workspaceId
  const workspaceId = input.table;
  
  // Construct path to the database
  const workspaceStorageDir = path.join(
    process.env.HOME || process.env.USERPROFILE || '',
    'AppData', 'Roaming', 'Cursor', 'User', 'workspaceStorage'
  );
  const dbPath = path.join(workspaceStorageDir, workspaceId, 'state.vscdb');
  
  // Check if database exists
  try {
    await fs.access(dbPath);
  } catch (err: any) {
    logger.error(`Database not found: ${dbPath}`);
    throw new Error(`Database not found for workspace ${workspaceId}`);
  }
  
  // If specific key is requested, drill down into that key
  if (input.key) {
    return handleKeyDrilldown(workspaceId, input.key, dbPath);
  }
  
  // Otherwise, list all keys
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

    // Get all keys with their values
    db.all("SELECT key, value FROM ItemTable ORDER BY key;", [], (err: any, rows: any) => {
      clearTimeout(timeout);
      if (err) {
        logger.error(`Error listing keys:`, err);
        db.close();
        return resolve({
          content: [{ type: 'text' as const, text: formatError(`Error listing keys: ${err.message}`) }],
          isError: true,
        });
      }

      db.close((err: any) => {
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
      let text = `All Keys in Workspace: ${workspaceId}\n`;
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

/**
 * Handle individual key drilldown
 */
async function handleKeyDrilldown(workspaceId: string, key: string, dbPath: string) {
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

    // Extract specific key
    db.get("SELECT value FROM ItemTable WHERE key = ?;", [key], (err: any, row: any) => {
      clearTimeout(timeout);
      if (err) {
        logger.error(`Error extracting key '${key}':`, err);
        db.close();
        return resolve({
          content: [{ type: 'text' as const, text: formatError(`Error extracting key '${key}': ${err.message}`) }],
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
          content: [{ type: 'text' as const, text: `Key '${key}' not found in workspace ${workspaceId}` }],
        });
      }

      const value = (row as any).value;
      let text = `Key Data from Workspace: ${workspaceId}\n`;
      text += `Key: ${key}\n\n`;

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
          content: [{ type: 'text' as const, text: formatError(`Error processing key data: ${parseErr.message}`) }],
          isError: true,
        });
      }
    });
  });
}

/**
 * Handle schema inspection operations
 */
async function handleSchemaInspection(input: any, formatOptions: FormattingOptions) {
  logger.info('Handling schema inspection operation');
  
  // TODO: Implement comprehensive schema analysis
  return {
    content: [{ 
      type: 'text' as const, 
      text: 'Schema inspection implementation in progress' 
    }],
  };
}

/**
 * Register the database query tool with the MCP server
 */
export function registerDatabaseQuery(server: McpServer) {
  server.registerTool(
    'database_query',
    {
      title: 'Advanced Database Query Engine',
      description: 'Advanced database querying with intelligent assistance and multiple operation modes',
      inputSchema: databaseQueryInputSchema,
    },
    handleDatabaseQuery
  );
  
  logger.info('✅ Registered database_query super-tool');
} 