/**
 * Interactive Selection Tools
 * 
 * Tools for smart workspace selection, guided discovery,
 * and conversational workspace finding workflows.
 */

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from '../lib/logger.js';

/**
 * Registers interactive selection tools
 */
export function registerInteractiveTools(server: McpServer) {
  logger.info('Registering interactive selection tools...');

  /**
   * Smart workspace selection with fuzzy search and filtering
   */
  server.registerTool(
    'selectWorkspace',
    {
      title: 'Smart Workspace Selection',
      description: 'Implement fuzzy search across all workspace metadata with interactive disambiguation and relevance weighting.',
      inputSchema: {
        query: z.string().describe('Search query for workspace selection'),
        filters: z.object({
          technology: z.string().optional().describe('Filter by technology/language'),
          status: z.string().optional().describe('Filter by project status'),
          timeRange: z.string().optional().describe('Filter by activity time range'),
          minActivity: z.number().optional().describe('Minimum activity level (0-100)')
        }).optional().describe('Additional filtering criteria'),
        maxResults: z.number().optional().describe('Maximum number of results to return (default: 10)'),
        includeScore: z.boolean().optional().describe('Include relevance scores in results (default: true)')
      },
    },
    async (input: { query: string; filters?: any; maxResults?: number; includeScore?: boolean }) => {
      try {
        return {
          content: [{ type: 'text' as const, text: 'Smart workspace selection implementation in progress...' }],
        };
      } catch (error) {
        logger.error('Error in selectWorkspace:', error);
        return {
          content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  /**
   * Guided workspace discovery wizard
   */
  server.registerTool(
    'workspaceWizard',
    {
      title: 'Workspace Discovery Wizard',
      description: 'Create conversational interface for workspace selection with intent recognition and smart suggestions.',
      inputSchema: {
        intent: z.string().describe('User intent or goal description'),
        currentProject: z.string().optional().describe('Current project context'),
        preferences: z.object({
          recency: z.enum(['recent', 'active', 'any']).optional(),
          complexity: z.enum(['simple', 'moderate', 'complex']).optional(),
          collaboration: z.boolean().optional()
        }).optional().describe('User preferences for workspace selection'),
        stepMode: z.boolean().optional().describe('Enable step-by-step guided selection (default: false)')
      },
    },
    async (input: { intent: string; currentProject?: string; preferences?: any; stepMode?: boolean }) => {
      try {
        return {
          content: [{ type: 'text' as const, text: 'Workspace discovery wizard implementation in progress...' }],
        };
      } catch (error) {
        logger.error('Error in workspaceWizard:', error);
        return {
          content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  logger.info('Interactive selection tools registered');
} 