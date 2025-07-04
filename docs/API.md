# API Reference: Super-Tools Documentation
*Complete reference for all 8 super-tools and their modes*

## 📖 Overview

This document provides comprehensive API documentation for the TypeScript MCP Server's 8 super-tools. Each tool supports multiple modes of operation with consistent parameter patterns and response formats.

**Architecture Pattern:**
- **Mode-based operations**: Each tool uses a `mode` parameter
- **Consistent schemas**: Standardized input/output patterns
- **Rich responses**: Detailed metadata and error handling
- **Performance monitoring**: Execution metrics included

---

## 🔧 Common Patterns

### Request Format
```json
{
  "name": "<super_tool_name>",
  "arguments": {
    "mode": "<operation_mode>",
    "filters": { /* mode-specific filters */ },
    "options": { /* formatting and behavior options */ }
    // ... other mode-specific parameters
  }
}
```

### Response Format
```json
{
  "results": { /* actual response data */ },
  "metadata": {
    "tool": "<super_tool_name>",
    "mode": "<operation_mode>",
    "duration": 123,
    "timestamp": "2024-03-20T12:34:56Z",
    "rowCount": 5,
    "version": "2.0.0"
  },
  "success": true,
  "error": null
}
```

---

## 1. 🔍 workspace_intelligence

**Purpose**: Ultimate workspace discovery and analysis engine

### Modes

#### `list` - Enhanced Workspace Listing
Lists all workspaces with smart filtering and analysis.

**Parameters:**
```json
{
  "mode": "list",
  "filters": {
    "technology": ["python", "typescript"],    // Filter by tech stack
    "status": ["active", "dormant"],           // Filter by status
    "timeRange": "1w",                         // Recent activity filter
    "minActivity": 5                           // Minimum activity threshold
  },
  "options": {
    "limit": 20,                               // Max results
    "includeAnalysis": true,                   // Include workspace analysis
    "includeScore": true,                      // Include relevance scores
    "format": "table"                          // Output format
  }
}
```

**Response:**
```json
{
  "results": {
    "workspaces": [
      {
        "id": "workspace-123",
        "name": "My Project",
        "path": "/path/to/workspace",
        "createdAt": "2024-01-01T00:00:00Z",
        "modifiedAt": "2024-03-20T12:00:00Z",
        "label": "React Dashboard App",
        "technology": ["react", "typescript"],
        "status": "active",
        "activityLevel": "high",
        "promptCount": 45,
        "generationCount": 67
      }
    ],
    "summary": {
      "total": 15,
      "active": 8,
      "dormant": 5,
      "totalSize": "2.4GB"
    }
  }
}
```

#### `search` - Semantic Workspace Search
Find workspaces using natural language queries.

**Parameters:**
```json
{
  "mode": "search",
  "query": "React components with TypeScript",
  "filters": {
    "timeRange": "3m"
  },
  "options": {
    "limit": 10,
    "includeScore": true
  }
}
```

#### `analyze` - Deep Workspace Analysis
Perform comprehensive analysis of a specific workspace.

**Parameters:**
```json
{
  "mode": "analyze",
  "workspaceId": "workspace-123",
  "options": {
    "includeAnalysis": true,
    "format": "json"
  }
}
```

#### `discover` - Natural Language Discovery
Find workspaces using conversational queries.

**Parameters:**
```json
{
  "mode": "discover",
  "query": "Show me projects I was working on last month",
  "options": {
    "includeInsights": true
  }
}
```

#### `wizard` - Interactive Guided Discovery
Step-by-step workspace discovery with AI assistance.

**Parameters:**
```json
{
  "mode": "wizard",
  "wizard": {
    "intent": "find_project",
    "currentProject": "web_app",
    "preferences": {
      "technology": ["react"],
      "timeframe": "recent"
    },
    "stepMode": true
  }
}
```

---

## 2. 💾 database_query

**Purpose**: Advanced database querying with intelligent assistance

### Modes

#### `raw` - Execute Raw SQL
Execute custom SQL queries with safety checks.

**Parameters:**
```json
{
  "mode": "raw",
  "uri": "cursor+sqlite://path/to/state.vscdb",
  "query": "SELECT * FROM chat_messages WHERE timestamp > ? ORDER BY timestamp DESC",
  "options": {
    "format": "table",
    "pretty": true,
    "includeMetadata": true,
    "timeout": 30000
  }
}
```

#### `builder` - Column-Based SELECT Queries
Build SELECT queries with visual assistance.

**Parameters:**
```json
{
  "mode": "builder",
  "uri": "cursor+sqlite://path/to/state.vscdb",
  "table": "chat_messages",
  "columns": ["id", "message", "timestamp"],
  "filters": {
    "where": "timestamp > 1234567890",
    "orderBy": "timestamp DESC",
    "limit": 10
  },
  "options": {
    "format": "json",
    "includeMetadata": true
  }
}
```

#### `inspect` - Database Schema Analysis
Comprehensive database and schema inspection.

**Parameters:**
```json
{
  "mode": "inspect",
  "uri": "cursor+sqlite://path/to/state.vscdb",
  "options": {
    "format": "json",
    "includeMetadata": true
  }
}
```

**Response:**
```json
{
  "results": {
    "database": {
      "path": "/path/to/state.vscdb",
      "size": 15728640,
      "tables": ["ItemTable", "chat_messages"],
      "keyCount": 127
    },
    "tables": [
      {
        "name": "ItemTable",
        "rowCount": 89,
        "columns": ["key", "value"],
        "sampleData": [...]
      }
    ],
    "keys": [
      {
        "key": "aiService.prompts",
        "type": "json",
        "size": 2048,
        "preview": "[{\"text\":\"help me...\"}]"
      }
    ]
  }
}
```

#### `keys` - Database Key Analysis
List and analyze database keys with type detection.

**Parameters:**
```json
{
  "mode": "keys",
  "uri": "cursor+sqlite://path/to/state.vscdb",
  "key": "aiService.prompts",  // Optional: specific key
  "options": {
    "format": "table",
    "includeMetadata": true
  }
}
```

#### `schema` - Schema Documentation
Generate comprehensive schema documentation.

**Parameters:**
```json
{
  "mode": "schema",
  "uri": "cursor+sqlite://path/to/state.vscdb",
  "options": {
    "format": "markdown",
    "includeExamples": true
  }
}
```

---

## 3. 🧠 conversation_intelligence

**Purpose**: Comprehensive conversation analysis and search

### Modes

#### `search` - Semantic Conversation Search
Search conversations using natural language with context awareness.

**Parameters:**
```json
{
  "mode": "search",
  "workspaceId": "workspace-123",
  "query": "database connection errors with PostgreSQL",
  "filters": {
    "searchType": "technical",
    "timeRange": "1m",
    "minRelevance": 0.7
  },
  "options": {
    "limit": 10,
    "includeContext": true,
    "generateInsights": true
  }
}
```

**Response:**
```json
{
  "results": {
    "matches": [
      {
        "conversationId": "conv-456",
        "timestamp": "2024-03-15T10:30:00Z",
        "type": "prompt",
        "content": "I'm getting connection timeout errors...",
        "relevanceScore": 0.89,
        "context": "PostgreSQL database setup discussion",
        "matchingTerms": ["database", "connection", "PostgreSQL"]
      }
    ],
    "insights": [
      "Database connectivity issues are a recurring theme",
      "PostgreSQL configuration appears to be a common challenge"
    ],
    "totalMatches": 15
  }
}
```

#### `problems` - Find Similar Problems
Identify similar problems and their solutions from past conversations.

**Parameters:**
```json
{
  "mode": "problems",
  "workspaceId": "workspace-123",
  "problemDescription": "React component not re-rendering after state change",
  "filters": {
    "timeRange": "6m"
  },
  "options": {
    "limit": 5,
    "includeContext": true
  }
}
```

#### `solutions` - Extract Solution Patterns
Extract reusable solution patterns from conversations.

**Parameters:**
```json
{
  "mode": "solutions",
  "workspaceId": "workspace-123",
  "filters": {
    "technology": ["react", "javascript"]
  },
  "options": {
    "generateInsights": true
  }
}
```

#### `related` - Find Related Conversations
Find conversations related to a specific session or topic.

**Parameters:**
```json
{
  "mode": "related",
  "workspaceId": "workspace-123",
  "sessionId": "session-789",
  "options": {
    "includeContext": true,
    "limit": 8
  }
}
```

#### `insights` - Generate AI-Powered Insights
Generate comprehensive insights from conversation patterns.

**Parameters:**
```json
{
  "mode": "insights",
  "workspaceId": "workspace-123",
  "filters": {
    "timeRange": "3m"
  },
  "options": {
    "generateInsights": true,
    "exportFormat": "markdown"
  }
}
```

---

## 4. 📚 session_manager

**Purpose**: Complete session lifecycle management with collaboration tracking

### Modes

#### `get` - Retrieve Specific Session
Get detailed information about a specific session.

**Parameters:**
```json
{
  "mode": "get",
  "workspaceId": "workspace-123",
  "sessionId": "session-456",
  "options": {
    "includeMetrics": true,
    "includeContent": true,
    "format": "json"
  }
}
```

#### `list` - List Sessions with Filtering
List sessions with advanced filtering and sorting.

**Parameters:**
```json
{
  "mode": "list",
  "workspaceId": "workspace-123",
  "filters": {
    "sortBy": "activity",
    "timeRange": "2w",
    "minActivity": 3
  },
  "options": {
    "limit": 20,
    "includeMetrics": true,
    "format": "table"
  }
}
```

#### `timeline` - Generate Conversation Timeline
Create rich conversation timeline visualization.

**Parameters:**
```json
{
  "mode": "timeline",
  "workspaceId": "workspace-123",
  "filters": {
    "timeRange": "1w"
  },
  "options": {
    "includeMetrics": true,
    "format": "timeline"
  }
}
```

#### `compare` - Compare Multiple Sessions
Compare sessions for similarities and differences.

**Parameters:**
```json
{
  "mode": "compare",
  "workspaceId": "workspace-123",
  "sessionIds": ["session-1", "session-2", "session-3"],
  "options": {
    "includeMetrics": true
  }
}
```

#### `analyze` - Deep Session Analysis
Perform comprehensive analysis of session patterns.

**Parameters:**
```json
{
  "mode": "analyze",
  "workspaceId": "workspace-123",
  "filters": {
    "timeRange": "1m"
  },
  "options": {
    "includeMetrics": true,
    "format": "detailed"
  }
}
```

---

## 5. 🌐 workspace_discovery

**Purpose**: Cross-workspace search and intelligent categorization

### Modes

#### `search` - Cross-Workspace Content Search
Search across all workspaces for specific content.

**Parameters:**
```json
{
  "mode": "search",
  "query": "React hooks implementation",
  "filters": {
    "searchType": "content",
    "includeInactive": false,
    "timeRange": "6m"
  },
  "options": {
    "limit": 15,
    "includeScore": true,
    "format": "json"
  }
}
```

#### `describe` - Natural Language Workspace Finding
Find workspaces using natural language descriptions.

**Parameters:**
```json
{
  "mode": "describe",
  "query": "Projects where I worked on user authentication",
  "options": {
    "includeInsights": true,
    "limit": 10
  }
}
```

#### `categorize` - Intelligent Workspace Grouping
Group workspaces by various criteria with AI assistance.

**Parameters:**
```json
{
  "mode": "categorize",
  "category": {
    "type": "technology",
    "criteria": ["frontend", "backend", "mobile", "data"]
  },
  "options": {
    "includeInsights": true,
    "format": "json"
  }
}
```

**Response:**
```json
{
  "results": {
    "categories": [
      {
        "name": "Frontend Development",
        "workspaces": [...],
        "count": 8,
        "characteristics": ["React", "Vue", "CSS", "JavaScript"]
      },
      {
        "name": "Backend Services",
        "workspaces": [...],
        "count": 5,
        "characteristics": ["Node.js", "Python", "API", "Database"]
      }
    ],
    "uncategorized": [...],
    "insights": [
      "Most projects use React for frontend development",
      "Backend services primarily use Node.js and Python"
    ]
  }
}
```

#### `relationships` - Map Workspace Relationships
Discover relationships and dependencies between workspaces.

**Parameters:**
```json
{
  "mode": "relationships",
  "workspaceId": "workspace-123",
  "options": {
    "includeInsights": true,
    "format": "graph"
  }
}
```

---

## 6. ⏱️ temporal_intelligence

**Purpose**: Time-based analysis and productivity insights with trend prediction

### Modes

#### `recent` - Recent Workspace Activity
Analyze recent workspace activity patterns.

**Parameters:**
```json
{
  "mode": "recent",
  "timeframe": {
    "range": "1w"
  },
  "options": {
    "includeInactive": false,
    "format": "table"
  }
}
```

#### `activity` - Deep Activity Pattern Analysis
Comprehensive analysis of workspace activity patterns.

**Parameters:**
```json
{
  "mode": "activity",
  "workspaceId": "workspace-123",
  "timeframe": {
    "range": "1m"
  },
  "options": {
    "format": "detailed"
  }
}
```

#### `productivity` - Multi-Dimensional Productivity Scoring
Generate comprehensive productivity metrics.

**Parameters:**
```json
{
  "mode": "productivity",
  "workspaceId": "workspace-123",
  "timeframe": {
    "range": "1m"
  },
  "metrics": {
    "types": ["efficiency", "focus", "learning", "problemSolving"],
    "depth": "comprehensive"
  },
  "options": {
    "includePredictions": true,
    "format": "detailed"
  }
}
```

**Response:**
```json
{
  "results": {
    "workspaceId": "workspace-123",
    "timeframe": "1m",
    "metrics": {
      "efficiency": 78,
      "focus": 85,
      "learning": 92,
      "problemSolving": 71,
      "codeQuality": 89,
      "collaboration": 65
    },
    "trends": {
      "improvement": 12.5,
      "consistency": 83,
      "patterns": [
        "Peak productivity between 9-11 AM",
        "Learning activities cluster on weekdays"
      ]
    },
    "insights": [
      "Strong learning progression in React development",
      "Problem-solving efficiency improving over time"
    ],
    "recommendations": [
      "Schedule complex tasks during morning hours",
      "Consider pair programming for collaboration boost"
    ]
  }
}
```

#### `compare` - Cross-Workspace Comparisons
Compare activity and productivity across multiple workspaces.

**Parameters:**
```json
{
  "mode": "compare",
  "workspaceIds": ["ws-1", "ws-2", "ws-3"],
  "timeframe": {
    "range": "2w"
  },
  "options": {
    "compareWith": "1m",
    "format": "chart"
  }
}
```

#### `trends` - Trend Analysis with Predictions
Advanced trend analysis with ML-powered predictions.

**Parameters:**
```json
{
  "mode": "trends",
  "workspaceId": "workspace-123",
  "timeframe": {
    "range": "3m"
  },
  "options": {
    "includePredictions": true,
    "format": "summary"
  }
}
```

---

## 7. 📤 data_exporter

**Purpose**: Comprehensive data extraction and export with multiple formats

### Modes

#### `prompts` - Export User Prompts
Extract and export user prompts with metadata.

**Parameters:**
```json
{
  "mode": "prompts",
  "workspaceId": "workspace-123",
  "filters": {
    "dateRange": {
      "start": "2024-01-01",
      "end": "2024-03-20"
    }
  },
  "export": {
    "format": "markdown",
    "outputDir": "./exports",
    "filename": "workspace-prompts"
  },
  "options": {
    "includeAnalysis": true,
    "cleanData": true
  }
}
```

#### `generations` - Export AI Generations
Extract and export AI generations with full metadata.

**Parameters:**
```json
{
  "mode": "generations",
  "workspaceId": "workspace-123",
  "filters": {
    "generationTypes": ["chat", "composer", "apply"]
  },
  "export": {
    "format": "json",
    "outputDir": "./exports"
  }
}
```

#### `all` - Complete Workspace Data Export
Export all workspace data in comprehensive format.

**Parameters:**
```json
{
  "mode": "all",
  "workspaceId": "workspace-123",
  "export": {
    "format": "markdown",
    "outputDir": "./exports/complete",
    "filename": "workspace-backup"
  },
  "options": {
    "includeAnalysis": true,
    "compress": true
  }
}
```

#### `summary` - Workspace Summary Reports
Generate formatted workspace summaries.

**Parameters:**
```json
{
  "mode": "summary",
  "workspaceIds": ["ws-1", "ws-2", "ws-3"],
  "export": {
    "format": "markdown",
    "template": "executive"
  },
  "options": {
    "includeAnalysis": true
  }
}
```

#### `analysis` - Analytical Reports
Generate comprehensive analytical reports.

**Parameters:**
```json
{
  "mode": "analysis",
  "workspaceId": "workspace-123",
  "filters": {
    "dateRange": {
      "start": "2024-01-01",
      "end": "2024-03-20"
    }
  },
  "export": {
    "format": "csv",
    "outputDir": "./analytics"
  }
}
```

---

## 8. 🎛️ workspace_orchestrator

**Purpose**: Unified workspace management and automation

### Modes

#### `batch` - Execute Batch Operations
Perform operations across multiple workspaces.

**Parameters:**
```json
{
  "mode": "batch",
  "operation": "analyze_all",
  "workspaceIds": ["ws-1", "ws-2", "ws-3"],
  "options": {
    "dryRun": false,
    "includeReport": true
  }
}
```

#### `maintain` - Automated Maintenance Tasks
Perform automated maintenance and optimization.

**Parameters:**
```json
{
  "mode": "maintain",
  "workspaceIds": ["ws-1", "ws-2"],
  "maintenance": {
    "cleanup": true,
    "optimize": true,
    "archive": false
  },
  "options": {
    "dryRun": true,
    "includeReport": true
  }
}
```

**Response:**
```json
{
  "results": {
    "operation": "maintenance",
    "workspacesProcessed": ["ws-1", "ws-2"],
    "results": [
      {
        "workspaceId": "ws-1",
        "success": true,
        "actions": ["cleanup_temp_files", "optimize_database"],
        "duration": 1234
      }
    ],
    "summary": {
      "totalProcessed": 2,
      "successful": 2,
      "failed": 0,
      "totalDuration": 2456
    },
    "report": "All maintenance tasks completed successfully"
  }
}
```

#### `automate` - Run Custom Workflows
Execute custom automation workflows.

**Parameters:**
```json
{
  "mode": "automate",
  "workflow": {
    "steps": [
      {
        "tool": "workspace_intelligence",
        "params": { "mode": "list" },
        "condition": "if_workspaces_found"
      },
      {
        "tool": "data_exporter",
        "params": { "mode": "summary" }
      }
    ],
    "schedule": "daily"
  },
  "options": {
    "notifyOnComplete": true
  }
}
```

#### `monitor` - Health Monitoring
Monitor workspace health and performance.

**Parameters:**
```json
{
  "mode": "monitor",
  "workspaceIds": ["ws-1", "ws-2"],
  "options": {
    "includeReport": true
  }
}
```

---

## 🔧 Error Handling

### Standard Error Format
```json
{
  "results": null,
  "metadata": {
    "tool": "workspace_intelligence",
    "mode": "list",
    "duration": 45,
    "timestamp": "2024-03-20T12:34:56Z"
  },
  "success": false,
  "error": {
    "code": "WORKSPACE_NOT_FOUND",
    "message": "Workspace 'invalid-id' not found",
    "details": {
      "workspaceId": "invalid-id",
      "suggestion": "Use workspace_intelligence list mode to see available workspaces"
    }
  }
}
```

### Common Error Codes
- `INVALID_MODE` - Unsupported mode for the tool
- `INVALID_PARAMETERS` - Parameter validation failed
- `WORKSPACE_NOT_FOUND` - Specified workspace doesn't exist
- `DATABASE_CONNECTION_FAILED` - Cannot connect to database
- `TIMEOUT` - Operation exceeded timeout limit
- `INSUFFICIENT_DATA` - Not enough data for analysis
- `PERMISSION_DENIED` - Access denied to resource

---

## 📊 Performance Guidelines

### Response Times (Typical)
- **Simple queries** (list, get): < 100ms
- **Analysis operations**: 200-500ms
- **Search operations**: 300-800ms
- **Complex analytics**: 500-2000ms
- **Export operations**: 1-10 seconds

### Rate Limiting
- **Concurrent requests**: Max 10 per client
- **Export operations**: Max 3 per minute
- **Analytics operations**: Max 5 per minute

### Optimization Tips
1. **Use filters** to reduce data processing
2. **Limit results** with the `limit` option
3. **Cache responses** for repeated queries
4. **Use dry-run** for testing complex operations

---

*Complete API documentation for TypeScript MCP Server v2.0+* 