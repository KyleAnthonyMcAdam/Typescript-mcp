/**
 * @file index.ts
 * Export all super-tools for easy registration
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from '../../lib/logger.js';

// Import all super-tool registration functions
import { registerWorkspaceIntelligence } from './workspace-intelligence.js';
import { registerDatabaseQuery } from './database-query.js';
import { registerConversationIntelligence } from './conversation-intelligence.js';
import { registerSessionManager } from './session-manager.js';
import { registerWorkspaceDiscovery } from './workspace-discovery.js';
import { registerTemporalIntelligence } from './temporal-intelligence.js';
import { registerDataExporter } from './data-exporter.js';
import { registerWorkspaceOrchestrator } from './workspace-orchestrator.js';

/**
 * Register all 8 super-tools with the MCP server
 * This replaces the previous 30+ individual tool registrations
 */
export function registerAllSuperTools(server: McpServer) {
  logger.info('🚀 Registering all super-tools...');
  
  try {
    // Register only the working super-tools
    registerWorkspaceIntelligence(server); // ✅ Working
    registerDataExporter(server); // ✅ Working
    // The following super-tools are stubbed and NOT registered:
    // registerDatabaseQuery(server); // ❌ Stubbed
    // registerConversationIntelligence(server); // ❌ Stubbed
    // registerSessionManager(server); // ❌ Stubbed
    // registerWorkspaceDiscovery(server); // ❌ Stubbed
    // registerTemporalIntelligence(server); // ❌ Stubbed
    // registerWorkspaceOrchestrator(server); // ❌ Stubbed
    logger.info('✅ Only working super-tools registered (workspace_intelligence, data_exporter)');
  } catch (error) {
    logger.error('❌ Failed to register super-tools:', error);
    throw error;
  }
}

/**
 * Export individual registration functions for granular control
 */
export {
  registerWorkspaceIntelligence,
  registerDatabaseQuery,
  registerConversationIntelligence,
  registerSessionManager,
  registerWorkspaceDiscovery,
  registerTemporalIntelligence,
  registerDataExporter,
  registerWorkspaceOrchestrator,
}; 