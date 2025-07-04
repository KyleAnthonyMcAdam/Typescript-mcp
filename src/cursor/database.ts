// This file will handle database discovery and connection logic. 

import { glob } from 'glob';
import path from 'path';
import os from 'os';
import { logger } from '../lib/logger.js';

/**
 * Discovers all Cursor state.vscdb SQLite database files on the user's system.
 * It searches in the default locations for Windows, macOS, and Linux, adhering to
 * our guiding principle of robust error handling.
 *
 * @returns {Promise<string[]>} A promise that resolves to an array of absolute file paths to the databases.
 */
export async function discoverDatabases(): Promise<string[]> {
  logger.info('🔍 Starting database discovery...');
  const platform = process.platform;
  const searchPaths: string[] = [];

  // Determine the search paths based on the operating system.
  switch (platform) {
    case 'win32':
      // Windows: %APPDATA%\Cursor\User\globalStorage\
      if (process.env.APPDATA) {
        searchPaths.push(path.join(process.env.APPDATA, 'Cursor', 'User', 'globalStorage'));
        // VSCode: %APPDATA%\Code\User\workspaceStorage\**\state.vscdb
        searchPaths.push(path.join(process.env.APPDATA, 'Code', 'User', 'workspaceStorage'));
      }
      break;
    case 'darwin':
      // macOS: ~/Library/Application Support/Cursor/User/globalStorage/
      searchPaths.push(path.join(os.homedir(), 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage'));
      break;
    case 'linux':
      // Linux: ~/.config/Cursor/User/globalStorage/
      searchPaths.push(path.join(os.homedir(), '.config', 'Cursor', 'User', 'globalStorage'));
      break;
  }

  // Add the current working directory to search for project-specific databases
  searchPaths.push(process.cwd());

  if (searchPaths.length === 0) {
    logger.warn(`Could not determine a database search path for the current OS: ${platform}`);
    return [];
  }

  const dbFilePattern = '**/state.vscdb';
  let foundDbs: string[] = [];

  logger.info(`Searching for database files in: ${searchPaths.join(', ')}`);

  try {
    for (const searchPath of searchPaths) {
      // Use glob to find files matching the pattern. `absolute: true` ensures we get full paths.
      const results = await glob(dbFilePattern, { cwd: searchPath, absolute: true, nodir: true });
      foundDbs = foundDbs.concat(results);
    }
  } catch (error) {
    logger.error('An error occurred during database discovery glob search:', error);
    // Return an empty array on error to prevent the server from crashing.
    return [];
  }

  if (foundDbs.length > 0) {
    logger.info(`✅ Found ${foundDbs.length} database(s).`);
    foundDbs.forEach(db => logger.info(`  - Found DB at: ${db}`));
  } else {
    logger.warn('No Cursor databases found in the default locations.');
  }

  return foundDbs;
} 