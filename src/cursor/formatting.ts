/**
 * @file Provides utilities for consistent output formatting across all database tools.
 */

import { logger } from '../lib/logger.js';

/**
 * Options for formatting query results
 */
export interface FormattingOptions {
  format: 'json' | 'table';
  pretty?: boolean;  // For JSON: whether to pretty-print. For table: whether to use ASCII borders
}

/**
 * Default formatting options
 */
export const DEFAULT_FORMAT_OPTIONS: FormattingOptions = {
  format: 'json',
  pretty: true
};

/**
 * Formats query results consistently based on the specified format.
 * 
 * @param data The data to format
 * @param options Formatting options
 * @returns Formatted string representation of the data
 */
export function formatQueryResults(data: any[], options: FormattingOptions = DEFAULT_FORMAT_OPTIONS): string {
  if (data.length === 0) {
    return 'No results found.';
  }

  try {
    switch (options.format) {
      case 'json':
        return formatAsJson(data, options.pretty);
      case 'table':
        return formatAsTable(data, options.pretty);
      default:
        logger.warn(`Unknown format '${options.format}', falling back to JSON`);
        return formatAsJson(data, options.pretty);
    }
  } catch (error) {
    logger.error('Error formatting query results:', error);
    // Fall back to basic JSON stringification
    return JSON.stringify(data);
  }
}

/**
 * Formats data as JSON with optional pretty-printing
 */
function formatAsJson(data: any[], pretty: boolean = true): string {
  return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
}

/**
 * Formats data as an ASCII table
 * @param data Array of objects to format
 * @param pretty Whether to use ASCII borders
 */
function formatAsTable(data: any[], pretty: boolean = true): string {
  if (data.length === 0) return '';

  // Get all unique column names from the data
  const columns = Array.from(new Set(
    data.reduce((cols: string[], row) => cols.concat(Object.keys(row)), [])
  ));

  // Calculate column widths
  const colWidths = columns.map(col => {
    const maxDataWidth = Math.max(...data.map(row => 
      String(row[col] ?? '').length
    ));
    return Math.max(col.length, maxDataWidth);
  });

  // Generate the header
  const header = columns.map((col, i) => 
    col.padEnd(colWidths[i])
  ).join(' | ');

  // Generate the separator
  const separator = pretty
    ? columns.map((_, i) => '-'.repeat(colWidths[i])).join('-+-')
    : columns.map((_, i) => '-'.repeat(colWidths[i])).join(' | ');

  // Generate the rows
  const rows = data.map(row =>
    columns.map((col, i) => 
      String(row[col] ?? '').padEnd(colWidths[i])
    ).join(pretty ? ' | ' : ' | ')
  );

  // Combine all parts
  return [
    header,
    separator,
    ...rows
  ].join('\n');
}

/**
 * Formats error messages consistently
 */
export function formatError(message: string, details?: any): string {
  const error = {
    error: message,
    ...(details && { details })
  };
  return JSON.stringify(error, null, 2);
}

/**
 * Formats metadata about a query execution
 */
export function formatQueryMetadata(metadata: {
  dbPath: string;
  table: string;
  sql: string;
  duration?: number;
  rowCount: number;
}): string {
  return JSON.stringify({
    type: 'query_metadata',
    timestamp: new Date().toISOString(),
    ...metadata
  }, null, 2);
} 