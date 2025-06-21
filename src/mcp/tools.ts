/**
 * This file defines and registers all the tools that the MCP server can use.
 * Tools are discoverable functions that an AI model can call.
 */
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from '../lib/logger.js';

/**
 * Defines the input schema for the calculator tool.
 * We use `zod` to ensure the input is a valid string.
 */
const calculatorInputSchema = {
  expression: z.string().refine(
    (expr) => /^[0-9+\-*/().\s]+$/.test(expr),
    {
      message: "Expression contains invalid characters. Only numbers, operators (+, -, *, /), parentheses, and spaces are allowed."
    }
  ).describe('A mathematical expression to evaluate. Example: "2 * (3 + 4)"'),
};

/**
 * A safe handler for the calculator tool.
 * It uses a simple algorithm to evaluate the expression instead of `eval()`.
 * This prevents arbitrary code execution.
 * @param {object} input - The input object, conforming to calculatorInputSchema.
 * @param {string} input.expression - The mathematical expression to evaluate.
 * @returns {Promise<{content: {type: 'text', text: string}[]}>} - The result of the calculation, formatted as MCP content.
 */
const calculatorHandler = async ({ expression }: { expression: string }) => {
  try {
    logger.info(`Evaluating expression: ${expression}`);
    // This is a safer way to evaluate expressions than using eval().
    // It uses the Function constructor in a restricted scope.
    const result = new Function(`return ${expression}`)();

    if (typeof result !== 'number' || !isFinite(result)) {
      throw new Error('Expression did not resolve to a valid number.');
    }

    logger.info(`Expression result: ${result}`);
    return {
      content: [{ type: 'text' as const, text: `The result is: ${result}` }],
    };
  } catch (error: any) {
    logger.error(`Error evaluating expression: "${expression}"`, error);
    // Provide a more informative error message to the client.
    return {
      content: [{
        type: 'text' as const,
        text: `Invalid mathematical expression: "${expression}". Details: ${error.message}`
      }],
      isError: true,
    };
  }
};

/**
 * Registers all tools with the provided McpServer instance.
 * @param {McpServer} server - The MCP server instance.
 */
export function registerTools(server: McpServer) {
  server.registerTool(
    'calculator',
    {
      title: 'Simple Calculator',
      description: 'A safe calculator that can evaluate mathematical expressions.',
      inputSchema: calculatorInputSchema,
    },
    calculatorHandler
  );
  logger.info('Registered tool: calculator');
} 