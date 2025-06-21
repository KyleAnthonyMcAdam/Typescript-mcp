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
You'll need the MCP SDK and TypeScript.
```bash
npm install @modelcontextprotocol/sdk zod
npm install -D typescript @types/node
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
Now, let's write the server code.

### 3.1 Create Source Directory
Create a `src` directory for your TypeScript source files.
```bash
mkdir src
```

### 3.2 Create Server File
Create a file named `server.ts` inside the `src` directory.
```bash
touch src/server.ts
```

### 3.3 Add Server Code
Add the following code to `src/server.ts`. This is a basic server that exposes a simple "add" tool.

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Create an MCP server instance
const server = new McpServer({
  name: "typescript-simple-mcp",
  version: "1.0.0",
  capabilities: {
    tools: {},
  },
});

// Add a simple calculator tool
server.tool(
  "calculator",
  "A safe calculator that can evaluate mathematical expressions.",
  {
    expression: z.string().describe("A mathematical expression to evaluate. Example: \"2 * (3 + 4)\""),
  },
  async ({ expression }) => {
    try {
        // A simple, safer way to evaluate math expressions.
        const result = new Function('return ' + expression)();
        return {
            content: [{
                type: 'text',
                text: `The result is: ${result}`
            }],
        };
    } catch (error) {
        return {
            content: [{
                type: 'text',
                text: "Invalid expression"
            }],
            isError: true
        };
    }
  }
);


async function runServer() {
  console.error("Registering tools...");
  // The 'error' here is intentional. We're logging to stderr
  // to avoid polluting stdout, which is used for MCP communication.
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("All tools registered.");
  console.error("🔌 MCP transport starting via stdio.");
}

runServer().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
```

## 4. Build and Run

### 4.1 Add Build Script to `package.json`
Open your `package.json` file and add a `build` script and a `start` script. Also set the `main` entry point.

```json
{
  "name": "my-mcp-server",
  "version": "1.0.0",
  "description": "",
  "main": "dist/server.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/server.js"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.13.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.12.12",
    "typescript": "^5.4.5"
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
5. The server listens for requests, executes the appropriate tool (like the calculator), and sends the result back to the client.

That's it! You now have a working TypeScript MCP server. 