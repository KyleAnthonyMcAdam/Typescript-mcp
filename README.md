# TypeScript MCP Server

## Overview

The **Model Context Protocol (MCP) Server** is a unified backend for advanced workspace discovery, analysis, file navigation, and data export. It is designed for developers, tool integrators, and advanced users who need deep insight into project workspaces and AI-driven data extraction.

### **Current Focus & Scope**
- **Reliability first:** Only core, fully-tested tools are active.
- **Super-tool architecture:** The system is transitioning to a mode-based, consolidated tool design for maintainability and clarity.
- **Migration phase:** Legacy and stubbed tools are hidden until complete and stable.

---

## What Can You Do With MCP?

- **Discover and analyze workspaces** using smart filters, metadata, and wizard-driven selection.
- **Navigate and inspect files** interactively within any registered workspace.
- **Export prompts, generations, and analytics** for further analysis, reporting, or migration.

> **Note:** Tools for conversation intelligence, session management, and advanced analytics are planned but not yet available.

---

## 🟢 Active Tools (2025-07)

Only the following tools are currently active and working in the MCP server:

### 1. workspace_intelligence (Super-Tool)
- **Description:**
  Advanced workspace discovery, listing, analysis, and guided selection via wizard mode. Ideal for exploring, filtering, and analyzing workspaces in a smart, interactive way.
- **Modes:**
  - `list`: List all workspaces with metadata
  - `analyze`: Analyze a specific workspace
  - `discover`: Search for workspaces by criteria
  - `wizard`: Step-by-step guided workspace selection
- **Example:**
  ```json
  { "mode": "analyze", "workspaceId": "abc123" }
  ```

### 2. finder
- **Description:**
  Interactive file system navigation and exploration tool. Lets you browse, list, and read files and directories within a workspace or project.
- **Actions:**
  - `list`: List files/directories in the current path
  - `cd`: Change directory
  - `up`: Move up one directory
  - `read`: Read a file (preview or full)
  - `info`: Get file/directory info
- **Example:**
  ```json
  { "action": "list" }
  ```

### 3. cursor_data_exporter
- **Description:**
  Comprehensive data extraction and export tool for workspaces. Supports exporting prompts, generations, summaries, and analytics in multiple formats.
- **Modes:**
  - `prompts`: Export all prompt data (user inputs, questions, etc.)
  - `generations`: Export all AI generations (responses, completions, code, etc.)
  - `all`: Export both prompts and generations, plus any other available data
  - `summary`: Export a summarized view of the workspace
  - `analysis`: Export analytical insights (trends, activity breakdowns, etc.)
- **Example:**
  ```json
  { "mode": "prompts", "workspaceId": "abc123" }
  ```

---

## ❌ Stubbed/Inactive Tools

The following tools are currently stubbed, not working, or not registered:
- database_query
- conversation_intelligence
- session_manager
- workspace_discovery
- temporal_intelligence
- workspace_orchestrator

These will not appear in the MCP tool list until implemented.

---

## Roadmap & Status
- **Active development:** More tools will be enabled as they are completed and tested.
- **Only working tools are exposed** in the MCP interface for reliability and clarity.
- **Stubbed and non-working tools are hidden** until ready.

---

## For Developers
- See `src/server.ts` and `src/cursor/tools/index.ts` for tool registration logic.
- See `src/cursor/tools/data-exporter.ts` for the new `cursor_data_exporter` registration.

---

## Audience
- This project is intended for developers, tool integrators, and advanced users who need robust workspace analysis and data export capabilities.

## Features

- **Database Discovery**: Automatically finds all `state.vscdb` files in both VSCode and Cursor storage locations
- **Multi-Table Support**: Works with both `ItemTable` and `chat_messages` tables
- **Flexible Querying**: Supports custom SQL queries, column selection, and filtering
- **Rich Output Formats**: Results can be formatted as JSON or ASCII tables
- **Query Metadata**: Includes detailed information about each query execution
- **Robust Error Handling**: Clear, actionable error messages for all operations

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
    ```bash
    npm install
    ```

## Setup in Cursor

1.  **Build the project:**
    ```bash
    npm run build
    ```

2.  **Configure Cursor:**
    Create or edit `.cursor/mcp.json` in your project:
    ```json
    {
      "mcpServers": {
        "Cursor DB MCP TS": {
          "command": "node",
          "args": ["<path_to_this_project>/dist/server.js"]
        }
      }
    }
    ```
    Replace `<path_to_this_project>` with the absolute path to this server's root directory.

## 🚀 Active Tools (2025-07)

Only the following tools are currently active and working in the MCP server:

---

### 1. workspace_intelligence (Super-Tool)

- **Description:**
  Provides advanced workspace discovery, listing, analysis, and guided selection via wizard mode. Ideal for exploring, filtering, and analyzing workspaces in a smart, interactive way.

- **Available Modes:**
  - `list`: List all workspaces with metadata
  - `analyze`: Analyze a specific workspace
  - `discover`: Search for workspaces by criteria
  - `wizard`: Step-by-step guided workspace selection

- **Example Usage:**
  ```json
  { "mode": "analyze", "workspaceId": "abc123" }
  ```
  ```json
  { "mode": "wizard", "wizard": { "intent": "find a recent active workspace", "preferences": { "recency": "recent" }, "stepMode": true } }
  ```

- **Input Parameters:**
  - `mode` (required): One of `list`, `analyze`, `discover`, `wizard`
  - `workspaceId` (for analyze)
  - `wizard` (object, for wizard mode)
  - `options` (object, for list/discover)

- **Output:**
  - Returns workspace metadata, analysis, or a guided selection result (JSON or table).

- **Limitations/Notes:**
  - Only fully implemented modes are available. Some advanced filters may be added in future updates.

---

### 2. finder

- **Description:**
  Interactive file system navigation and exploration tool. Lets you browse, list, and read files and directories within a workspace or project.

- **Available Actions:**
  - `list`: List files/directories in the current path
  - `cd`: Change directory
  - `up`: Move up one directory
  - `read`: Read a file (preview or full)
  - `info`: Get file/directory info

- **Example Usage:**
  ```json
  { "action": "list" }
  ```
  ```json
  { "action": "read", "target": "README.md" }
  ```

- **Input Parameters:**
  - `action` (required): One of `list`, `cd`, `up`, `read`, `info`
  - `target` (for cd, read, info)
  - `options` (object, e.g., maxPreviewBytes)

- **Output:**
  - Returns file/directory listings, file previews, or metadata (JSON or text).

- **Limitations/Notes:**
  - Full file operations (write, delete, batch ops) are not yet implemented.

---

### 3. cursor_data_exporter (formerly data_exporter)

- **Description:**
  Comprehensive data extraction and export tool for workspaces. Supports exporting prompts, generations, summaries, and analytics in multiple formats.

- **Available Modes:**
  - `prompts`: Export all prompt data (user inputs, questions, etc.)
  - `generations`: Export all AI generations (responses, completions, code, etc.)
  - `all`: Export both prompts and generations, plus any other available data
  - `summary`: Export a summarized view of the workspace
  - `analysis`: Export analytical insights (trends, activity breakdowns, etc.)

- **Example Usage:**
  ```json
  { "mode": "prompts", "workspaceId": "abc123" }
  ```
  ```json
  { "mode": "all", "workspaceId": "abc123", "export": { "format": "json", "outputDir": "./exports" } }
  ```

- **Input Parameters:**
  - `mode` (required): One of `prompts`, `generations`, `all`, `summary`, `analysis`
  - `workspaceId` (required)
  - `export` (object, optional):
    - `format`: `text`, `json`, or `csv`
    - `outputDir`: Directory for file output
    - `filename`: (optional) Output file name
  - `filters` (object, optional): Filter by date, type, etc.

- **Output:**
  - Returns data in chat (text/JSON) or writes to file if export options are specified.

- **Limitations/Notes:**
  - File export requires specifying `outputDir`. Some modes may not support all formats.

---

## ❌ Stubbed/Inactive Tools

The following tools are currently stubbed, not working, or not registered:
- database_query
- conversation_intelligence
- session_manager
- workspace_discovery
- temporal_intelligence
- workspace_orchestrator

These will not appear in the MCP tool list until implemented.

---

## 📝 Tool Registration Names

- `workspace_intelligence` (super-tool)
- `finder` (file system tool)
- `cursor_data_exporter` (data export, new name)

---

## 🛠️ How to Add/Enable More Tools

To enable more tools, uncomment their registration in `src/server.ts` and ensure their implementation is complete and tested.

---

## 📦 Project Status

- Only working tools are exposed in the MCP interface for reliability and clarity.
- Stubbed and non-working tools are hidden until ready.

---

## 📚 For Developers

- See `src/server.ts` and `src/cursor/tools/index.ts` for tool registration logic.
- See `src/cursor/tools/data-exporter.ts` for the new `cursor_data_exporter` registration.

## Available Tools

### File System Explorer

- **`finder(sessionId?, action, target?, options?)`**
  - Interactive file system navigation tool with session-based state management
  - Navigate directories, read files, and explore the filesystem like an OS shell
  - Parameters:
    - `sessionId`: Session ID to maintain state (optional, will create new if not provided)
    - `action`: Action to perform - `'list'`, `'cd'`, `'up'`, `'read'`, `'info'`, or `'reset'`
    - `target`: Target file or directory name (for cd, read, info actions)
    - `options`: Configuration options:
      - `maxPreviewBytes`: Maximum bytes for file preview (default: 512)
      - `maxReadBytes`: Maximum bytes for file reading (default: 1MB)
      - `includePreview`: Include file previews in directory listings (default: true)
  - Returns: Session state with current directory, items, breadcrumbs, and guidance
  - Actions:
    - `list`: Show contents of current directory
    - `cd <dirname>`: Change to subdirectory
    - `up`: Move to parent directory
    - `read <filename>`: Read text file contents
    - `info <name>`: Get detailed info about file/directory
    - `reset`: Return to session root directory
  - Example session flow:
    ```json
    // Start new session
    {"action": "list"}
    
    // Navigate to subdirectory
    {"action": "cd", "target": "Documents"}
    
    // Read a file
    {"action": "read", "target": "notes.txt"}
    
    // Go back up
    {"action": "up"}
    ```

### Database Discovery & Workspace Management

- **`listWorkspaces(sortBy?, sortOrder?, includeLabels?)`**
  - Lists all workspace folders with metadata and smart labeling
  - Parameters:
    - `sortBy`: Sort by `'creation'`, `'modified'`, or `'id'` (default: `'modified'`)
    - `sortOrder`: Sort order `'asc'` or `'desc'` (default: `'desc'`)
    - `includeLabels`: Extract first prompt as label (default: `true`)
  - Returns: Table of workspaces with ID, dates, labels, and database status
  - Example:
    ```json
    {
      "name": "tool/run",
      "params": {
        "name": "listWorkspaces",
        "arguments": {
          "sortBy": "activity",
          "sortOrder": "desc",
          "includeLabels": true
        }
      }
    }
    ```

- **`presentWorkspaceSummary(format?, sortBy?, limit?)`**
  - Advanced workspace presentation with multiple output formats
  - Parameters:
    - `format`: Output format `'table'`, `'list'`, `'markdown'`, or `'json'` (default: `'table'`)
    - `sortBy`: Sort by `'creation'`, `'modified'`, or `'activity'` (default: `'modified'`)
    - `limit`: Limit number of workspaces shown (default: all)
  - Returns: Rich workspace summary with activity metrics
  - Example:
    ```json
    {
      "name": "tool/run",
      "params": {
        "name": "presentWorkspaceSummary",
        "arguments": {
          "format": "markdown",
          "sortBy": "activity",
          "limit": 10
        }
      }
    }
    ```



### Database Schema & Analysis

- **`inspectDatabase(workspaceId)`**
  - Comprehensive database inspection and schema analysis
  - Parameters:
    - `workspaceId`: Workspace folder ID to inspect
  - Returns: Database tables, keys, and aiService key analysis
  - Example:
    ```json
    {
      "name": "tool/run",
      "params": {
        "name": "inspectDatabase",
        "arguments": {
          "workspaceId": "a1b2c3d4e5f6..."
        }
      }
    }
    ```

- **`listAllKeys(workspaceId)`**
  - Lists all database keys with type detection and previews
  - Parameters:
    - `workspaceId`: Workspace folder ID to analyze
  - Returns: Comprehensive key listing with types, sizes, and content previews
  - Features: JSON/text/binary detection, size analysis, grouped by type

- **`drilldownKey(workspaceId, key)`**
  - Extract and display full data from any specific database key
  - Parameters:
    - `workspaceId`: Workspace folder ID
    - `key`: Specific key to extract (e.g., `'aiService.prompts'`)
  - Returns: Complete key data with proper formatting (JSON, text, or binary)
  - Example:
    ```json
    {
      "name": "tool/run",
      "params": {
        "name": "drilldownKey",
        "arguments": {
          "workspaceId": "a1b2c3d4e5f6...",
          "key": "aiService.generations"
        }
      }
    }
    ```

### AI Data Extraction

- **`extractPrompts(workspaceId)`**
  - Extracts all user prompts from aiService.prompts
  - Parameters:
    - `workspaceId`: Workspace folder ID
  - Returns: All prompts with text and command types in chronological order
  - Use case: Analyze user interaction patterns and prompt history

- **`extractGenerations(workspaceId)`**
  - Extracts AI generations with full metadata
  - Parameters:
    - `workspaceId`: Workspace folder ID
  - Returns: All generations with timestamps, types, UUIDs, and descriptions
  - Features: Filters generations with textDescription, includes summary statistics

- **`listGenerationTypes(workspaceId)`**
  - Analyzes and lists all unique generation types in a workspace
  - Parameters:
    - `workspaceId`: Workspace folder ID
  - Returns: Type analysis with occurrence counts (chat, composer, apply, etc.)
  - Use case: Understand AI interaction patterns and feature usage

### Data Export

- **`exportWorkspaceData(workspaceId, exportType, outputDir?)`**
  - Export workspace data to markdown files
  - Parameters:
    - `workspaceId`: Workspace folder ID
    - `exportType`: Data to export `'prompts'`, `'generations'`, or `'all'`
    - `outputDir`: Output directory (default: current directory)
  - Returns: Creates formatted markdown files with exported data
  - Features: Concurrent export, rich formatting, error handling
  - Example:
    ```json
    {
      "name": "tool/run",
      "params": {
        "name": "exportWorkspaceData",
        "arguments": {
          "workspaceId": "a1b2c3d4e5f6...",
          "exportType": "all",
          "outputDir": "./exports"
        }
      }
    }
    ```

### Raw SQL Querying

- **`query_table(uri, table, sql, format?, pretty?)`**
  - Executes a raw SQL query
  - Parameters:
    - `uri`: Database URI
    - `table`: Table name
    - `sql`: SQL query to execute
    - `format`: Output format (`'json'` or `'table'`)
    - `pretty`: Whether to pretty-print output

- **`query_table_columns(uri, table, columns, where?, orderBy?, limit?, format?, pretty?)`**
  - Executes a SELECT query with column selection
  - Parameters:
    - `uri`: Database URI
    - `table`: Table name
    - `columns`: Array of column names (use `["*"]` for all columns)
    - `where`: Optional WHERE clause (without 'WHERE' keyword)
    - `orderBy`: Optional ORDER BY clause (without 'ORDER BY' keywords)
    - `limit`: Optional LIMIT value
    - `format`: Output format (`'json'` or `'table'`)
    - `pretty`: Whether to pretty-print output
  - Example:
    ```json
    {
      "name": "tool/run",
      "params": {
        "name": "query_table_columns",
        "arguments": {
          "uri": "cursor+sqlite://path/to/state.vscdb",
          "table": "chat_messages",
          "columns": ["id", "message", "timestamp"],
          "where": "timestamp > 1234567890",
          "orderBy": "timestamp DESC",
          "limit": 10,
          "format": "table"
        }
      }
    }
    ```

### Output Formats

All query tools support two output formats:

1. **JSON Format** (default)
   - Pretty-printed by default
   - Ideal for programmatic processing
   - Example:
     ```json
     {
       "results": [
         {"id": 1, "message": "Hello"},
         {"id": 2, "message": "World"}
       ],
       "metadata": {
         "dbPath": "path/to/db",
         "table": "chat_messages",
         "sql": "SELECT * FROM chat_messages",
         "duration": 123,
         "rowCount": 2,
         "timestamp": "2024-03-20T12:34:56Z"
       }
     }
     ```

2. **Table Format**
   - ASCII table with optional borders
   - Great for human readability
   - Example:
     ```
     id | message
     ---+--------
     1  | Hello
     2  | World
     ```

### Error Handling

All tools provide clear error messages with context:

```json
{
  "error": "Table 'unknown_table' does not exist in this database.",
  "details": {
    "dbPath": "path/to/db",
    "table": "unknown_table"
  }
}
```

## Database Schemas & Data Structures

### ItemTable (Primary Data Store)
- `key`: string - Hierarchical key identifier
- `value`: BLOB - JSON or binary data

### Key Data Structures

#### aiService.prompts
Array of user prompts with metadata:
```json
[
  {
    "text": "help me set up a mcp server for puppeteer",
    "commandType": 4
  }
]
```

#### aiService.generations
Array of AI generation events with rich metadata:
```json
[
  {
    "unixMs": 1742725715126,
    "generationUUID": "383da3b1-fa59-4a03-8653-084ddff32f69",
    "type": "composer",
    "textDescription": "For the code present, we get this error: ..."
  }
]
```

#### Other Common Keys
- `workbench.*`: UI state and settings
- `terminal`: Terminal session data
- `history.entries`: Command/file history
- `notepadData`: Notepad content

### chat_messages (Legacy Cursor Format)
- `id`: string
- `conversationId`: string
- `timestamp`: number (epoch ms)
- `message`: string
- `extensionState`: string (JSON with metadata)

## Use Cases

### Workspace Analysis
- **Discovery**: Find all workspaces and their activity levels
- **Labeling**: Auto-generate human-friendly workspace names from first prompts
- **Sorting**: Organize by creation date, modification, or activity metrics

### AI Interaction Analysis
- **Prompt Patterns**: Analyze user prompting strategies and evolution
- **Generation Types**: Understand usage of different AI features (chat, composer, apply)
- **Activity Metrics**: Track workspace engagement and feature adoption
- **Workflow Analysis**: Study user interaction patterns over time

### Data Export & Backup
- **Markdown Export**: Create readable documentation of AI interactions
- **Bulk Export**: Extract all data from multiple workspaces
- **Selective Export**: Choose specific data types for analysis

### Development & Debugging
- **Database Inspection**: Understand Cursor's internal data structures
- **Key Analysis**: Explore all stored data types and formats
- **Raw Access**: Direct SQL queries for advanced analysis

## Development

For development and testing:
```bash
npm run dev
```

This runs the server with `nodemon` for automatic reloading during development.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details. 