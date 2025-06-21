# TypeScript MCP Server

This project is a simple Model Context Protocol (MCP) server built with TypeScript. It is designed to be a starting point for creating your own MCP servers and includes a basic `calculator` tool as an example.

The server uses Express as the transport layer and communicates with clients over HTTP using Server-Sent Events (SSE).

## Features

- **MCP Server**: Implements the Model Context Protocol standard.
- **Calculator Tool**: A safe `calculator` tool that evaluates mathematical expressions.
- **TypeScript**: Fully written in TypeScript with strict type checking.
- **Well-Documented**: Code is documented with JSDoc comments to explain its purpose and usage.
- **Ready to Run**: Includes npm scripts for easy building, development, and execution.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [npm](https://www.npmjs.com/) (v8 or higher)

## Installation

1.  **Clone the repository (or set up the project):**
    ```bash
    # If you have cloned a repository:
    # git clone <repository-url>
    # cd typescript-mcp-server
    ```

2.  **Install dependencies:**
    Run the following command in the project root to install all required packages.
    ```bash
    npm install
    ```

## Usage

You can run the server in two modes: for development or for production.

### Development Mode

For development, you can run the server using `nodemon`, which will automatically restart the server whenever you make changes to the source code.

```bash
npm run dev
```

The server will start on the port specified in your `.env` file, or on port `3333` by default.

### Production Mode

For production, you should first build the TypeScript code into JavaScript, and then run the compiled code.

1.  **Build the project:**
    This command compiles all TypeScript files from the `src` directory into JavaScript files in the `dist` directory.
    ```bash
    npm run build
    ```

2.  **Start the server:**
    This command runs the compiled server from the `dist` directory.
    ```bash
    npm start
    ```

## Connecting with a Client

Once the server is running, you can connect to it using any MCP-compatible client, such as Cursor.

The server exposes its SSE transport at the following endpoint:
`http://localhost:3333/sse`

You can configure your client to connect to this URL. The `calculator` tool will be available for the client to discover and use.

### Example: Calling the Calculator Tool

A client can call the `calculator` tool with a request like this:

```json
{
  "jsonrpc": "2.0",
  "method": "tool/run",
  "params": {
    "name": "calculator",
    "arguments": {
      "expression": "2 * (10 + 5)"
    }
  },
  "id": "request-1"
}
```

The server will respond with the calculated result. 