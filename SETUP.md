# TypeScript MCP Server Setup Guide

This guide will walk you through setting up a TypeScript-based Model Context Protocol (MCP) server from scratch.

## Prerequisites

Before you begin, ensure you have the following installed:
- [Node.js](https://nodejs.org/) (which includes npm)

You can verify your installation by running:
```bash
node --version
npm --version
```

## 🟢 Active Tools (2025-07)

After setup, only the following tools will be available in the MCP interface:

---

### 1. workspace_intelligence (Super-Tool)
- **Description:** Workspace discovery, listing, analysis, and wizard mode for guided selection.
- **Modes:** list, analyze, discover, wizard
- **Example:**
  ```json
  { "mode": "list" }
  ```

---

### 2. finder
- **Description:** Interactive file system navigation and exploration.
- **Actions:** list, cd, up, read, info
- **Example:**
  ```json
  { "action": "list" }
  ```

---

### 3. cursor_data_exporter
- **Description:** Export prompts, generations, summaries, and analytics from a workspace.
- **Modes:** prompts, generations, all, summary, analysis
- **Example:**
  ```json
  { "mode": "prompts", "workspaceId": "abc123" }
  ```

All other tools are currently stubbed or not registered.

---

## ⚡ Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```
2. Build the project:
   ```bash
   npm run build
   ```
3. Start the server:
   ```bash
   npm start
   ```

---

## 📝 Tool Registration

- Only working tools are registered by default.
- To enable more tools, edit `src/server.ts` and `src/cursor/tools/index.ts`.
- The data export tool is now registered as `cursor_data_exporter`.

---

## ❌ Stubbed/Inactive Tools

- database_query
- conversation_intelligence
- session_manager
- workspace_discovery
- temporal_intelligence
- workspace_orchestrator

These are not available until implemented.

## 1. Project Setup

First, you need to set up your project structure and install the necessary dependencies.

### 1.1 Create Project Directory
Create a new directory for your server and navigate into it:
```bash
mkdir my-mcp-server
cd my-mcp-server
```

### 1.2 Initialize npm
Initialize a new npm project. This will create a `package.json` file.
```bash
npm init -y
```

### 1.3 Install Dependencies
You'll need the MCP SDK and some helper libraries.

**Production Dependencies:**
```bash
npm install @modelcontextprotocol/sdk zod dotenv
```

**Development Dependencies:**
```bash
npm install -D typescript @types/node nodemon ts-node
```

## 2. TypeScript Configuration

Create a `tsconfig.json` file in the root of your project to configure the TypeScript compiler.
```bash
touch tsconfig.json
```

Add the following configuration to `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

## 3. Create the Server
Now, let's write the server code. We will use a modular structure to keep the code organized.

### 3.1 Create Source Directories
Create directories for your source files and library helpers.
```bash
mkdir -p src/lib src/mcp
```

### 3.2 Create the Logger (`src/lib/logger.ts`)
This utility will help standardize logging.
```bash
touch src/lib/logger.ts
```
Add the following code to `src/lib/logger.ts`:
```typescript
/**
 * A simple logger utility for timestamped console messages.
 * This helps in standardizing the log format across the application,
 * making it easier to debug and trace operations.
 */
const log = (level: 'INFO' | 'ERROR' | 'WARN', message: string, ...optionalParams: unknown[]) => {
  const timestamp = new Date().toISOString();
  // Log to stderr to keep stdout clean for MCP communication
  console.error(`[${timestamp}] [${level}] ${message}`, ...optionalParams);
};

export const logger = {
  info: (message: string, ...optionalParams: unknown[]) => {
    log('INFO', message, ...optionalParams);
  },
  error: (message: string, ...optionalParams: unknown[]) => {
    log('ERROR', message, ...optionalParams);
  },
  warn: (message: string, ...optionalParams: unknown[]) => {
    log('WARN', message, ...optionalParams);
  },
};
```

### 3.3 Create the Tool Definitions (`src/mcp/tools.ts`)
This is where you will define and register your server's tools.
```bash
touch src/mcp/tools.ts
```
Add the following code to `src/mcp/tools.ts`:
```typescript
/**
 * This file defines and registers all the tools that the MCP server can use.
 * Tools are discoverable functions that an AI model can call.
 */
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from '../lib/logger.js';

export function registerTools(server: McpServer) {
  // No basic tools registered in this template
  logger.info('No basic tools registered.');
}
```

### 3.4 Create the Main Server File (`src/server.ts`)
This file will tie everything together.
```bash
touch src/server.ts
```
Add the following code to `src/server.ts`:
```typescript
/**
 * Main server entry point for the TypeScript MCP Server.
 */
import 'dotenv/config'; // Load environment variables from .env file
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { logger } from './lib/logger.js';
import { registerTools } from './mcp/tools.js';

const mcpServer = new McpServer({
  name: 'typescript-mcp-server',
  version: '1.0.0',
  capabilities: {
    tools: {
      listChanged: true,
    },
  },
});

logger.info('Registering tools...');
registerTools(mcpServer);
logger.info('All tools registered.');

async function startStdioServer() {
  const transport = new StdioServerTransport();
  logger.info('🔌 MCP transport starting via stdio.');
  await mcpServer.connect(transport);
  logger.info('stdio transport connection closed.');
}

startStdioServer().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});
```

## 4. Build and Run

### 4.1 Add Scripts to `package.json`
Open your `package.json` file and set the `main` entry point and add the `build`, `start`, and `dev` scripts.

```json
{
  "name": "my-mcp-server",
  "version": "1.0.0",
  "description": "",
  "main": "dist/server.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/server.js",
    "dev": "nodemon --watch 'src/**/*.ts' --exec 'ts-node' src/server.ts",
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.13.0",
    "dotenv": "^16.5.0",
    "zod": "^3.25.67"
  },
  "devDependencies": {
    "@types/node": "^24.0.3",
    "nodemon": "^3.1.10",
    "ts-node": "^10.9.2",
    "typescript": "^5.8.3"
  }
}
```

### 4.2 Build the Server
Run the build script to compile your TypeScript code into JavaScript in the `dist` directory.
```bash
npm run build
```

## 5. Configure MCP Client

To make this server available to a client (like Cursor or Claude Desktop), you need to add it to the client's configuration file. This is typically a JSON file. For this example, let's call it `mcp.json`.

The configuration tells the client how to start your server.

```json
{
  "mcpServers": {
    "typescript-simple-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/your/project/dist/server.js"]
    }
  }
}
```

**IMPORTANT**: Replace `/absolute/path/to/your/project/dist/server.js` with the actual absolute path to your compiled `server.js` file.

You can also use a batch or shell script to launch the server. If you create a `run-server.bat` file like the one in this project, your `mcp.json` would look like this:

```json
{
  "mcpServers": {
    "typescript-simple-mcp": {
      "command": "C:\\path\\to\\your\\project\\run-server.bat"
    }
  }
}
```
Again, make sure to use the correct absolute path.

## 6. How it Works
1. The MCP client (e.g., Cursor) reads its configuration file.
2. When a tool from your server is needed, the client executes the `command` specified in the `mcp.json`.
3. The command starts your Node.js server.
4. The server communicates with the client over standard input/output (`stdio`).
5. The server listens for requests, executes the appropriate tool, and sends the result back to the client.

That's it! You now have a working TypeScript MCP server. 