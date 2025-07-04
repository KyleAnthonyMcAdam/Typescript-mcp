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

// --- Cursor Integration Imports ---
// We import the functions that will set up our Cursor-specific features.
import { discoverDatabases } from './cursor/database.js';
import { registerCursorResources } from './cursor/resources.js';
import { registerCursorTools } from './cursor/tools.js';
import { registerEnhancedTools } from './cursor/enhanced-tools.js';
import { registerSessionTools } from './cursor/session-tools.js';
import { registerSearchTools } from './cursor/search-tools.js';
import { registerWorkspaceSearchTools } from './cursor/workspace-search-tools.js';
import { registerCategorizationTools } from './cursor/categorization-tools.js';
import { registerTimeIntelligenceTools } from './cursor/time-intelligence-tools.js';
import { registerInteractiveTools } from './cursor/interactive-tools.js';
import { registerAdvancedAnalyticsTools } from './cursor/analytics-tools.js';
import { registerFinderTool } from './cursor/tools/finder.js';

// --- Super-Tool Architecture ---
import { registerAllSuperTools } from './cursor/tools/index.js';

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
 * Initializes and starts the MCP server.
 * This main function orchestrates the startup sequence, including discovering
 * databases and registering all resources and tools.
 */
async function main() {
  // --- Cursor Feature Initialization ---
  // Discover databases first, as they are needed for resources and tools.
  const dbPaths = await discoverDatabases();

  // Register the resources and tools that expose the discovered databases.
  registerCursorResources(mcpServer, dbPaths);
  
  // --- Super-Tool Architecture Registration ---
  logger.info('🚀 Registering super-tool architecture...');
  registerAllSuperTools(mcpServer); // Only workspace_intelligence, data_exporter, and finder are working
  // The following super-tools are stubbed and not yet implemented:
  // - database_query (stubbed)
  // - conversation_intelligence (stubbed)
  // - session_manager (stubbed)
  // - workspace_discovery (stubbed)
  // - temporal_intelligence (stubbed)
  // - workspace_orchestrator (stubbed)
  // (No individual registration needed as registerAllSuperTools handles all; stubs are ignored)

  // --- Legacy Individual Tools (Temporary - for migration phase) ---
  logger.info('📦 Registering legacy tools (migration phase)...');
  // registerCursorTools(mcpServer); // COMMENTED OUT: Not all tools are working
  // registerEnhancedTools(mcpServer); // COMMENTED OUT: Not all tools are working
  // registerSessionTools(mcpServer); // COMMENTED OUT: Not all tools are working
  // registerSearchTools(mcpServer); // COMMENTED OUT: Not all tools are working
  // registerWorkspaceSearchTools(mcpServer); // COMMENTED OUT: Not all tools are working
  // registerCategorizationTools(mcpServer); // COMMENTED OUT: Not all tools are working
  // registerTimeIntelligenceTools(mcpServer); // COMMENTED OUT: Not all tools are working
  // registerInteractiveTools(mcpServer); // COMMENTED OUT: Not all tools are working
  // registerAdvancedAnalyticsTools(mcpServer); // COMMENTED OUT: Not all tools are working
  registerFinderTool(mcpServer); // Finder tool is working

  // --- Start Server Transport ---
  const transport = new StdioServerTransport();
  logger.info('🔌 MCP transport starting via stdio.');
  // The connect method for stdio is a long-running process that handles
  // the read/write loop until the client disconnects.
  await mcpServer.connect(transport);
  logger.info('stdio transport connection closed.');
}

// --- Main Execution ---
main().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
}); 