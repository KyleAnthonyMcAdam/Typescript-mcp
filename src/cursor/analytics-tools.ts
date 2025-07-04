/**
 * Advanced Analytics Tools
 * 
 * Tools for productivity analytics, cross-workspace intelligence,
 * and advanced metrics for learning and development insights.
 */

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from '../lib/logger.js';

/**
 * Registers advanced analytics tools
 */
export function registerAdvancedAnalyticsTools(server: McpServer) {
  logger.info('Registering advanced analytics tools...');

  /**
   * Get comprehensive productivity metrics
   */
  server.registerTool(
    'getProductivityMetrics',
    {
      title: 'Get Productivity Metrics',
      description: 'Analyze work patterns and session effectiveness, track problem-solving time and success rates, identify most productive project types.',
      inputSchema: {
        workspaceId: z.string().optional().describe('Specific workspace ID to analyze (optional for global metrics)'),
        timeframe: z.enum(['week', 'month', 'quarter', 'year', 'all'])
          .optional()
          .describe('Time frame for analysis (default: month)'),
        metrics: z.array(z.enum(['efficiency', 'focus', 'learning', 'problemSolving', 'codeQuality', 'collaboration']))
          .optional()
          .describe('Specific metrics to calculate (default: all)'),
        compareWith: z.string().optional().describe('Compare with another time period (e.g., "previous_month")')
      },
    },
    async (input: { workspaceId?: string; timeframe?: string; metrics?: string[]; compareWith?: string }) => {
      try {
        return {
          content: [{ type: 'text' as const, text: 'Productivity metrics analysis implementation in progress...' }],
        };
      } catch (error) {
        logger.error('Error in getProductivityMetrics:', error);
        return {
          content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  /**
   * Compare workspace activity levels and patterns
   */
  server.registerTool(
    'compareWorkspacesActivity',
    {
      title: 'Compare Workspaces Activity',
      description: 'Compare activity levels across projects, identify patterns in project success/failure, track skill development.',
      inputSchema: {
        workspaceIds: z.array(z.string()).optional().describe('Specific workspace IDs to compare (optional for top workspaces)'),
        comparisonType: z.enum(['activity', 'productivity', 'learning', 'success', 'collaboration'])
          .optional()
          .describe('Type of comparison to perform (default: activity)'),
        timeframe: z.enum(['week', 'month', 'quarter', 'all'])
          .optional()
          .describe('Time frame for comparison (default: month)'),
        includeInsights: z.boolean().optional().describe('Include AI-generated insights (default: true)'),
        visualFormat: z.enum(['table', 'chart', 'summary'])
          .optional()
          .describe('Output format (default: table)')
      },
    },
    async (input: { workspaceIds?: string[]; comparisonType?: string; timeframe?: string; includeInsights?: boolean; visualFormat?: string }) => {
      try {
        return {
          content: [{ type: 'text' as const, text: 'Workspace activity comparison implementation in progress...' }],
        };
      } catch (error) {
        logger.error('Error in compareWorkspacesActivity:', error);
        return {
          content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  logger.info('Advanced analytics tools registered');
} 