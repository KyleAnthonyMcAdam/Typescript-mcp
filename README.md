# TypeScript MCP Server

This project is a simple Model Context Protocol (MCP) server built with TypeScript. It is designed to be a starting point for creating your own MCP servers and includes a basic `calculator` tool as an example.

The server is configured to communicate with a client application (like Cursor) over standard input/output (stdio).

## Features

- **MCP Server**: Implements the Model Context Protocol standard via `stdio`.
- **Calculator Tool**: A safe `calculator` tool that evaluates mathematical expressions.
- **TypeScript**: Fully written in TypeScript with strict type checking.
- **Well-Documented**: Code is documented, and a full `SETUP.md` is included.
- **Ready to Run**: Includes npm scripts and a batch file for easy building and execution.

## Prerequisites

- [Node.js](https://nodejs.org/)
- [npm](https://www.npmjs.com/)

## Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/KyleAnthonyMcAdam/Typescript-mcp.git
    cd Typescript-mcp
    ```

2.  **Install dependencies:**
    Run the following command in the project root to install all required packages.
    ```bash
    npm install
    ```

## Usage

### Development Mode

For development, you can run the server using `nodemon`, which will automatically restart the server whenever you make changes to the source code. This is useful for testing tools without needing to connect to a full client.

```bash
npm run dev
```

### Production / Client Mode

For the server to be used by a client application (like Cursor), you must first build the project.

1.  **Build the project:**
    This command compiles all TypeScript files from the `src` directory into JavaScript files in the `dist` directory.
    ```bash
    npm run build
    ```

2.  **Run the server from a client:**
    The server is not meant to be run directly by the user in the terminal. Instead, it must be started by an MCP client application.

## Connecting with a Client

To connect this server with a client like Cursor, you must add it to the client's configuration file (e.g., a global `mcp.json`). This configuration tells the client how to launch your server.

**Crucially, the `command` or `args` in the configuration must use an absolute path to the launch script or server file.** This path will be different on every machine.

For detailed instructions on how to set up the project from scratch and configure a client, please see the [SETUP.md](SETUP.md) file.

### Example `run-server.bat`

This project includes a `run-server.bat` file which simplifies the process of running the server from a client on Windows. It ensures that the Node.js server starts with the correct settings.

### Example: Calling the Calculator Tool

Once the client is configured and connected, it can call the `calculator` tool with a request like this:

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