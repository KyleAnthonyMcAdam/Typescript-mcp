# Task List: TypeScript MCP Server

This document outlines the steps to create a simple Model Context Protocol (MCP) server in TypeScript. The server will be designed to connect with clients like Cursor and will feature a basic calculator tool.

## 1. Project Setup & Configuration

- [x] **Create Project Directory**: The parent folder `typescript-mcp-server` is already created.
- [x] **Initialize npm**: Run `npm init -y` in the project root to create a `package.json` file.
- [x] **Create `tsconfig.json`**: Create a `tsconfig.json` file to configure the TypeScript compiler. This will define our output directory, module system, and other settings.
- [x] **Create `.gitignore`**: Create a `.gitignore` file to exclude `node_modules`, the `dist` (compiled code) folder, and any `.env` files from version control.
- [ ] **Create `.env` File**: Create a `.env` file to store environment variables, such as the `PORT` for the server. *(Skipped due to security restrictions, will rely on default port)*

## 2. Dependency Installation

- [x] **Install Runtime Dependencies**: Install necessary packages for running the server.
  ```bash
  npm install express @modelcontextprotocol/sdk dotenv zod
  ```
- [x] **Install Development Dependencies**: Install packages needed for development, such as TypeScript and type definitions.
  ```bash
  npm install -D typescript @types/node @types/express ts-node nodemon
  ```

## 3. Directory & File Structure

- [x] **Create Source Directory**: Create `src` to hold all the TypeScript source code.
- [x] **Create Core Logic Files**:
    - `src/server.ts`: The main entry point for the server application.
    - `src/lib/logger.ts`: A simple utility for logging messages.
- [x] **Create MCP Definition Files**:
    - `src/mcp/`: A directory to hold all MCP-related definitions.
    - `src/mcp/tools.ts`: The file where the `calculator` tool will be defined and registered.

## 4. Implementation

- [x] **Implement Logger**: Create a basic logger in `src/lib/logger.ts` to standardize console output.
- [x] **Implement Core Server**: In `src/server.ts`, write the code to:
    - Import dependencies.
    - Initialize the `McpServer` from the SDK.
    - Set up an Express application to serve as the transport layer.
    - Register all tools from `src/mcp/tools.ts`.
    - Start the server and listen on the configured port.
    - *Add comprehensive JSDoc comments to explain every part of the setup.*
- [x] **Implement Calculator Tool**: In `src/mcp/tools.ts`:
    - Define the input schema for the `calculator` tool using `zod`. It should accept a single string `expression`.
    - Implement the tool's `handler` function, which will safely evaluate the mathematical expression. **Note**: Use a safe evaluation method to prevent security risks.
    - Create a function to register the tool with the `McpServer` instance.
    - *Document the tool's purpose, its schema, and its handler function with detailed JSDoc comments.*

## 5. Scripts & Documentation

- [x] **Add npm Scripts**: Add `start` and `dev` scripts to `package.json` to easily build and run the server.
    - `start`: `tsc && node dist/server.js`
    - `dev`: `nodemon src/server.ts`
- [x] **Create `README.md`**: Create a `README.md` file explaining what the project is, how to install its dependencies, and how to run it.

## 6. Review & Testing

- [x] **Code Review**: Read through all code to ensure it is clear, well-documented, and follows best practices.
- [ ] **Run Server**: Start the server to ensure it runs without any compilation or runtime errors.
- [ ] **Manual Test**: Manually connect to the server from a client (like a curl command, a simple client script, or Cursor itself) to test the `calculator` tool. 