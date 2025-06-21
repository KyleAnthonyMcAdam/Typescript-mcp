/**
 * Main server entry point for the TypeScript MCP Server.
 * This file initializes the MCP server instance, registers tools,
 * and starts listening for connections over stdio.
 */
import 'dotenv/config'; // Load environment variables from .env file
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { logger } from './lib/logger.js';
import { registerTools } from './mcp/tools.js';

// --- MCP Server Setup ---
const mcpServer = new McpServer({
  name: 'typescript-mcp-server',
  version: '1.0.0',
  capabilities: {
    tools: {
      listChanged: true,
    },
  },
});

// --- Tool Registration ---
logger.info('Registering tools...');
registerTools(mcpServer);
logger.info('All tools registered.');

/**
 * Starts the server with the stdio transport.
 * This is used for direct integration with local clients like Cursor.
 */
async function startStdioServer() {
  const transport = new StdioServerTransport();
  logger.info('🔌 MCP transport starting via stdio.');
  // The connect method for stdio is a long-running process
  // that handles the read/write loop until the client disconnects.
  await mcpServer.connect(transport);
  logger.info('stdio transport connection closed.');
}

// --- Main Execution ---
startStdioServer().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
}); 