/**
 * @file Finder Tool - Dynamic, multipurpose file and directory exploration
 * 
 * This tool provides session-based file system navigation similar to an OS shell,
 * allowing users to list directories, read files, and navigate the filesystem
 * with maintained session state.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { promises as fs } from 'fs';
import { dirname, resolve, normalize, join, extname, basename, sep } from 'path';
import { homedir } from 'os';
import { logger } from '../../lib/logger.js';

/**
 * Interface for file/directory item information
 */
interface FileSystemItem {
  name: string;           // File or directory name
  type: 'file' | 'directory' | 'symlink' | 'other';
  size?: number;          // Size in bytes (for files)
  lastModified: string;   // ISO timestamp
  isReadable: boolean;    // Whether the file can be read
  preview?: string;       // Text preview for readable files
}

/**
 * Interface for session state
 */
interface FinderSession {
  sessionId: string;      // Unique session identifier
  cwd: string;           // Current working directory
  rootDir: string;       // Root directory for this session
  created: number;       // Timestamp when session was created
  lastAccessed: number;  // Timestamp when session was last accessed
}

/**
 * Interface for finder tool response
 */
interface FinderResponse {
  sessionId: string;
  cwd: string;
  breadcrumbs: string[];
  items?: FileSystemItem[];
  fileContent?: string;
  info?: FileSystemItem;
  actions: string[];
  message: string;
  error?: string;
}

/**
 * Session storage - in-memory map of active sessions
 */
const activeSessions = new Map<string, FinderSession>();

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

/**
 * Get or create a session
 */
function getOrCreateSession(sessionId?: string, startPath?: string): FinderSession {
  if (sessionId && activeSessions.has(sessionId)) {
    const session = activeSessions.get(sessionId)!;
    session.lastAccessed = Date.now();
    return session;
  }

  // Create new session
  const newSessionId = sessionId || generateSessionId();
  const defaultRoot = startPath || homedir();
  const session: FinderSession = {
    sessionId: newSessionId,
    cwd: defaultRoot,
    rootDir: defaultRoot,
    created: Date.now(),
    lastAccessed: Date.now()
  };

  activeSessions.set(newSessionId, session);
  logger.info(`Created new finder session: ${newSessionId} at ${defaultRoot}`);
  return session;
}

/**
 * Clean up old sessions (older than 1 hour)
 */
function cleanupOldSessions(): void {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  for (const [sessionId, session] of activeSessions.entries()) {
    if (session.lastAccessed < oneHourAgo) {
      activeSessions.delete(sessionId);
      logger.info(`Cleaned up old finder session: ${sessionId}`);
    }
  }
}

/**
 * Generate breadcrumbs from a path
 */
function generateBreadcrumbs(path: string): string[] {
  const normalizedPath = normalize(path);
  const parts = normalizedPath.split(sep).filter(part => part !== '');
  
  // On Windows, handle drive letters
  if (process.platform === 'win32' && parts.length > 0) {
    if (parts[0].endsWith(':')) {
      parts[0] = parts[0] + sep;
    }
  }
  
  return parts.length > 0 ? parts : [sep];
}

/**
 * Check if a file is text-readable based on extension
 */
function isTextFile(filename: string): boolean {
  const textExtensions = [
    '.txt', '.md', '.json', '.js', '.ts', '.html', '.css', '.xml', '.yml', '.yaml',
    '.log', '.config', '.ini', '.env', '.gitignore', '.readme', '.license',
    '.py', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.php', '.rb', '.go',
    '.rs', '.sh', '.bat', '.ps1', '.sql', '.r', '.m', '.scala', '.kt', '.swift'
  ];
  
  const ext = extname(filename).toLowerCase();
  return textExtensions.includes(ext) || !ext; // Include files without extensions
}

/**
 * Get file preview (first few lines for text files)
 */
async function getFilePreview(filePath: string, maxBytes: number = 512): Promise<string | undefined> {
  try {
    if (!isTextFile(filePath)) {
      return undefined;
    }

    const buffer = Buffer.alloc(maxBytes);
    const fileHandle = await fs.open(filePath, 'r');
    const { bytesRead } = await fileHandle.read(buffer, 0, maxBytes, 0);
    await fileHandle.close();

    if (bytesRead === 0) {
      return '';
    }

    const content = buffer.subarray(0, bytesRead).toString('utf8');
    // Replace any non-printable characters and truncate at first few lines
    const lines = content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').split('\n');
    return lines.slice(0, 3).join('\n') + (lines.length > 3 ? '\n...' : '');
  } catch (error) {
    return undefined;
  }
}

/**
 * Get information about a file or directory
 */
async function getFileSystemItem(itemPath: string, includePreview: boolean = false): Promise<FileSystemItem> {
  const stats = await fs.stat(itemPath);
  const name = basename(itemPath);
  
  let type: FileSystemItem['type'] = 'other';
  if (stats.isFile()) {
    type = 'file';
  } else if (stats.isDirectory()) {
    type = 'directory';
  } else if (stats.isSymbolicLink()) {
    type = 'symlink';
  }

  const item: FileSystemItem = {
    name,
    type,
    size: stats.isFile() ? stats.size : undefined,
    lastModified: stats.mtime.toISOString(),
    isReadable: true // We'll assume readable for now, could add permission check
  };

  if (includePreview && stats.isFile() && isTextFile(itemPath)) {
    item.preview = await getFilePreview(itemPath);
  }

  return item;
}

/**
 * List directory contents
 */
async function listDirectory(dirPath: string, includePreview: boolean = false): Promise<FileSystemItem[]> {
  const items = await fs.readdir(dirPath);
  const itemPromises = items.map(async (item) => {
    const itemPath = join(dirPath, item);
    try {
      return await getFileSystemItem(itemPath, includePreview);
    } catch (error) {
      // If we can't read the item, return basic info
      return {
        name: item,
        type: 'other' as const,
        lastModified: new Date().toISOString(),
        isReadable: false
      };
    }
  });

  const result = await Promise.all(itemPromises);
  
  // Sort: directories first, then files, alphabetically within each group
  return result.sort((a, b) => {
    if (a.type === 'directory' && b.type !== 'directory') return -1;
    if (b.type === 'directory' && a.type !== 'directory') return 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Read file contents
 */
async function readFile(filePath: string, maxBytes: number = 1024 * 1024): Promise<string> {
  const stats = await fs.stat(filePath);
  
  if (stats.size > maxBytes) {
    throw new Error(`File is too large (${stats.size} bytes). Maximum allowed: ${maxBytes} bytes.`);
  }

  if (!isTextFile(filePath)) {
    throw new Error(`File type not supported for reading: ${extname(filePath) || 'no extension'}`);
  }

  return await fs.readFile(filePath, 'utf8');
}

/**
 * Registers the finder tool with the MCP server
 */
export function registerFinderTool(server: McpServer): void {
  logger.info('🔍 Registering Finder tool...');

  // Clean up old sessions periodically
  setInterval(cleanupOldSessions, 10 * 60 * 1000); // Every 10 minutes

  const finderInputSchema = {
    sessionId: z.string().optional().describe('Session ID to maintain state (optional, will create new if not provided)'),
    action: z.enum(['list', 'cd', 'up', 'read', 'info', 'reset']).describe('Action to perform'),
    target: z.string().optional().describe('Target file or directory name (for cd, read, info actions)'),
    options: z.object({
      maxPreviewBytes: z.number().optional().default(512).describe('Maximum bytes for file preview'),
      maxReadBytes: z.number().optional().default(1024 * 1024).describe('Maximum bytes for file reading'),
      includePreview: z.boolean().optional().default(true).describe('Include file previews in directory listings')
    }).optional().default({})
  };

  server.registerTool(
    'finder',
    {
      title: 'File System Explorer',
      description: 'Interactive file system navigation tool with session-based state management. Navigate directories, read files, and explore the filesystem like an OS shell.',
      inputSchema: finderInputSchema
    },
    async (input: {
      sessionId?: string;
      action: 'list' | 'cd' | 'up' | 'read' | 'info' | 'reset';
      target?: string;
      options?: {
        maxPreviewBytes?: number;
        maxReadBytes?: number;
        includePreview?: boolean;
      };
    }) => {
      logger.info(`Finder tool called with action: ${input.action}`, { sessionId: input.sessionId, target: input.target });

      try {
        const session = getOrCreateSession(input.sessionId);
        const options = input.options || {};
        
        let response: FinderResponse = {
          sessionId: session.sessionId,
          cwd: session.cwd,
          breadcrumbs: generateBreadcrumbs(session.cwd),
          actions: ['list', 'cd', 'up', 'read', 'info', 'reset'],
          message: ''
        };

        switch (input.action) {
          case 'list': {
            const items = await listDirectory(session.cwd, options.includePreview);
            response.items = items;
            response.message = `Listed ${items.length} items in ${session.cwd}. Use 'cd <dirname>' to navigate or 'read <filename>' to read files.`;
            break;
          }

          case 'cd': {
            if (!input.target) {
              throw new Error('Target directory required for cd action');
            }

            const targetPath = resolve(session.cwd, input.target);
            const stats = await fs.stat(targetPath);
            
            if (!stats.isDirectory()) {
              throw new Error(`'${input.target}' is not a directory`);
            }

            session.cwd = targetPath;
            session.lastAccessed = Date.now();
            
            const items = await listDirectory(session.cwd, options.includePreview);
            response.cwd = session.cwd;
            response.breadcrumbs = generateBreadcrumbs(session.cwd);
            response.items = items;
            response.message = `Changed to ${session.cwd}. Found ${items.length} items.`;
            break;
          }

          case 'up': {
            const parentDir = dirname(session.cwd);
            if (parentDir !== session.cwd) { // Prevent going above root
              session.cwd = parentDir;
              session.lastAccessed = Date.now();
              
              const items = await listDirectory(session.cwd, options.includePreview);
              response.cwd = session.cwd;
              response.breadcrumbs = generateBreadcrumbs(session.cwd);
              response.items = items;
              response.message = `Moved up to ${session.cwd}. Found ${items.length} items.`;
            } else {
              response.message = `Already at root directory: ${session.cwd}`;
            }
            break;
          }

          case 'read': {
            if (!input.target) {
              throw new Error('Target file required for read action');
            }

            const targetPath = resolve(session.cwd, input.target);
            const stats = await fs.stat(targetPath);
            
            if (!stats.isFile()) {
              throw new Error(`'${input.target}' is not a file`);
            }

            const content = await readFile(targetPath, options.maxReadBytes);
            response.fileContent = content;
            response.message = `Read ${content.length} characters from ${input.target}`;
            break;
          }

          case 'info': {
            if (!input.target) {
              throw new Error('Target file or directory required for info action');
            }

            const targetPath = resolve(session.cwd, input.target);
            const info = await getFileSystemItem(targetPath, true);
            response.info = info;
            response.message = `Information for ${input.target}: ${info.type}, ${info.size || 'N/A'} bytes, modified ${info.lastModified}`;
            break;
          }

          case 'reset': {
            session.cwd = session.rootDir;
            session.lastAccessed = Date.now();
            
            const items = await listDirectory(session.cwd, options.includePreview);
            response.cwd = session.cwd;
            response.breadcrumbs = generateBreadcrumbs(session.cwd);
            response.items = items;
            response.message = `Reset to root directory: ${session.cwd}. Found ${items.length} items.`;
            break;
          }

          default:
            throw new Error(`Unknown action: ${input.action}`);
        }

        return {
          content: [{ 
            type: 'text' as const, 
            text: JSON.stringify(response, null, 2) 
          }]
        };

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logger.error(`Finder tool error:`, error);

        const errorResponse: FinderResponse = {
          sessionId: input.sessionId || 'error',
          cwd: 'unknown',
          breadcrumbs: [],
          actions: ['list', 'cd', 'up', 'read', 'info', 'reset'],
          message: `Error: ${errorMessage}`,
          error: errorMessage
        };

        return {
          content: [{ 
            type: 'text' as const, 
            text: JSON.stringify(errorResponse, null, 2) 
          }],
          isError: true
        };
      }
    }
  );

  logger.info('✅ Finder tool registered successfully');
} 