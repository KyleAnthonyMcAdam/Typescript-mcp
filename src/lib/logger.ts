/**
 * A simple logger utility for timestamped console messages.
 * This helps in standardizing the log format across the application,
 * making it easier to debug and trace operations.
 */

/**
 * Prefixes a message with a timestamp and logs it to the console.
 * @param level - The log level (e.g., 'INFO', 'ERROR').
 * @param message - The message to log.
 * @param optionalParams - Additional parameters to log.
 */
const log = (level: 'INFO' | 'ERROR' | 'WARN', message: string, ...optionalParams: unknown[]) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] ${message}`, ...optionalParams);
};

export const logger = {
  /**
   * Logs an informational message.
   * Use this for general application flow events.
   * @param message - The informational message.
   * @param optionalParams - Additional data to log.
   */
  info: (message: string, ...optionalParams: unknown[]) => {
    log('INFO', message, ...optionalParams);
  },

  /**
   * Logs an error message.
   * Use this for errors that occur during execution.
   * @param message - The error message.
   * @param optionalParams - Additional data, like an error object.
   */
  error: (message: string, ...optionalParams: unknown[]) => {
    log('ERROR', message, ...optionalParams);
  },

  /**
   * Logs a warning message.
   * Use this for potential issues that don't halt execution.
   * @param message - The warning message.
   * @param optionalParams - Additional data to log.
   */
  warn: (message: string, ...optionalParams: unknown[]) => {
    log('WARN', message, ...optionalParams);
  },
}; 