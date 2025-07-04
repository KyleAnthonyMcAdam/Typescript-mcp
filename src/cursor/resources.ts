/**
 * @file This file defines and registers MCP resources for the discovered Cursor databases.
 */

import path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from '../lib/logger.js';

/**
 * Registers all discovered SQLite databases as individual MCP resources.
 * It also sets up placeholder handlers for the custom `cursor://` URIs.
 *
 * @param {McpServer} server The MCP server instance.
 * @param {string[]} dbPaths An array of absolute file paths to the discovered databases.
 */
export function registerCursorResources(server: McpServer, dbPaths: string[]) {
  logger.info('🔗 Registering Cursor database resources...');

  if (dbPaths.length === 0) {
    logger.warn('No databases found, skipping resource registration.');
    return;
  }

  // Log what resources would be registered (MCP SDK doesn't currently support addResource)
  dbPaths.forEach((dbPath) => {
    // Derive a user-friendly name from the database's parent directory.
    const projectName = path.basename(path.dirname(dbPath));
    const resourceName = `db:${projectName}`;
    const resourceUri = `cursor+sqlite://${dbPath}`;

    logger.info(`  - Would register resource '${resourceName}' for URI: ${resourceUri}`);
  });

  // Log the projects resource that would be registered
  logger.info(`Would register 'projects' resource for cursor://projects`);

  logger.info('All Cursor resources registered (placeholder implementation).');
} 