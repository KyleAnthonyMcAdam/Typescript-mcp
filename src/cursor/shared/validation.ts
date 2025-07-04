/**
 * @file validation.ts
 * Shared parameter validation utilities for all super-tools
 */

import { z } from 'zod';
import { logger } from '../../lib/logger.js';

/**
 * Common validation schemas used across super-tools
 */
export const CommonSchemas = {
  workspaceId: z.string().min(1).describe('Workspace ID'),
  workspaceIds: z.array(z.string().min(1)).describe('Array of workspace IDs'),
  timeRange: z.enum(['1h', '6h', '1d', '3d', '1w', '2w', '1m', '3m', 'all']).describe('Time range'),
  format: z.enum(['table', 'json']).describe('Output format'),
  limit: z.number().min(1).max(1000).describe('Result limit'),
  query: z.string().min(1).describe('Search query'),
};

/**
 * Validates workspace ID format
 */
export function validateWorkspaceId(workspaceId: string): boolean {
  return workspaceId.length >= 8 && /^[a-f0-9]+$/i.test(workspaceId);
}

/**
 * Validates database URI format
 */
export function validateDatabaseUri(uri: string): boolean {
  return uri.startsWith('cursor+sqlite://') && uri.length > 16;
}

/**
 * Validates time range string
 */
export function validateTimeRange(timeRange: string): boolean {
  const validRanges = ['1h', '6h', '1d', '3d', '1w', '2w', '1m', '3m', 'all'];
  return validRanges.includes(timeRange);
}

/**
 * Validates and sanitizes search query
 */
export function sanitizeQuery(query: string): string {
  return query.trim().replace(/[^\w\s\-_.]/g, '');
}

/**
 * Generic parameter validator
 */
export function validateParameters<T>(
  input: any, 
  schema: z.ZodSchema<T>, 
  toolName: string
): { success: boolean; data?: T; error?: string } {
  try {
    const result = schema.parse(input);
    logger.info(`✅ ${toolName}: Parameters validated successfully`);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      logger.error(`❌ ${toolName}: Validation failed - ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
    logger.error(`❌ ${toolName}: Unexpected validation error`, error);
    return { success: false, error: 'Unexpected validation error' };
  }
}

/**
 * Validates mode parameter for super-tools
 */
export function validateMode(mode: string, validModes: string[], toolName: string): boolean {
  if (!validModes.includes(mode)) {
    logger.error(`❌ ${toolName}: Invalid mode '${mode}'. Valid modes: ${validModes.join(', ')}`);
    return false;
  }
  return true;
} 