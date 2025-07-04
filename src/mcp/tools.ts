/**
 * This file defines and registers all the tools that the MCP server can use.
 * Tools are discoverable functions that an AI model can call.
 */
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from '../lib/logger.js';

/**
 * Registers all tools with the provided McpServer instance.
 * @param {McpServer} server - The MCP server instance.
 */
export function registerTools(server: McpServer) {
  // No tools registered in this file currently
  logger.info('No basic tools registered.');
} 