/**
 * @file Contains TypeScript interfaces that define the data structures
 * for Cursor's `state.vscdb` SQLite database schema.
 *
 * SCHEMA DOCUMENTATION
 *
 * ---
 *
 * ItemTable (commonly found in VSCode state.vscdb):
 *   - key: string   // e.g., 'aiService:chat:session:1234'
 *   - value: string // JSON or text payload, often contains chat or session data
 *   Example row:
 *     key:   'aiService:chat:session:1234'
 *     value: '{ "messages": [ ... ] }'
 *
 * chat_messages (commonly found in Cursor state.vscdb):
 *   - id: string
 *   - conversationId: string
 *   - timestamp: number (epoch ms)
 *   - message: string // The actual chat message content
 *   - extensionState: string // JSON string with metadata (user, model, etc.)
 *   Example row:
 *     id: 'abc123'
 *     conversationId: 'conv456'
 *     timestamp: 1718000000000
 *     message: 'Hello, world!'
 *     extensionState: '{ "user": "neonk", "model": "gpt-4" }'
 *
 * Not all databases will have both tables. Use query_table to discover available tables.
 *
 * ---
 */

/**
 * Represents a single message in the chat history.
 * Based on common fields found in the `chat_messages` table.
 */
export interface ChatMessage {
  id: string;
  conversationId: string;
  timestamp: number;
  // The actual content of the message
  message: string;
  // JSON string containing other metadata like user, model, etc.
  extensionState: string;
}

/**
 * Represents a composer session.
 * Based on common fields found in the `composers` table.
 */
export interface ComposerSession {
  id: string;
  // The file path or context of the composer session
  context: string;
  // The code or text content within the composer
  content: string;
  timestamp: number;
} 

/**
 * Session Management Tool Schemas
 * Enhanced interfaces for the new session management capabilities
 */

/**
 * Enhanced composer session data with full conversation analysis
 */
export interface EnhancedComposerSession {
  composerId: string;
  sessionName: string;
  createdAt: Date;
  lastUpdatedAt: Date;
  totalPrompts: number;
  totalGenerations: number;
  conversationFlow: ConversationEntry[];
  codeChanges: CodeChange[];
  topics: string[];
  status: 'Active' | 'Completed' | 'Abandoned';
  metadata: {
    unifiedMode: string;
    forceMode: string;
    duration: string;
    activityLevel: 'High' | 'Medium' | 'Low';
  };
}

/**
 * Individual conversation entry (prompt or generation)
 */
export interface ConversationEntry {
  timestamp: Date;
  type: 'prompt' | 'generation';
  content: string;
  uuid: string;
  commandType?: number;
  generationType?: string;
  relatedUUID?: string;
}

/**
 * Code change tracking from apply generations
 */
export interface CodeChange {
  timestamp: Date;
  description: string;
  uuid: string;
  generationType: 'apply';
}

/**
 * Comprehensive conversation timeline
 */
export interface ConversationTimeline {
  workspaceId: string;
  totalEntries: number;
  timeRange: {
    start: Date;
    end: Date;
    duration: string;
  };
  conversationFlow: TimelineEntry[];
  statistics: {
    promptCount: number;
    generationCount: number;
    codeChanges: number;
    topicChanges: number;
  };
}

/**
 * Timeline entry with enhanced metadata
 */
export interface TimelineEntry {
  timestamp: Date;
  type: 'prompt' | 'generation' | 'code_change' | 'topic_shift';
  content: string;
  metadata: {
    uuid?: string;
    composerId?: string;
    commandType?: number;
    generationType?: string;
    topics?: string[];
  };
  relatedEntries?: string[];
}

/**
 * Related session search results
 */
export interface RelatedSession {
  composerId: string;
  sessionName: string;
  similarity: number;
  matchingTopics: string[];
  relevantConversations: ConversationSnippet[];
  lastActivity: Date;
  reasonForMatch: string;
}

/**
 * Conversation snippet for search results
 */
export interface ConversationSnippet {
  timestamp: Date;
  type: 'prompt' | 'generation';
  content: string;
  relevanceScore: number;
}

/**
 * Content Search Tool Schemas
 * Enhanced interfaces for content search and problem-solving capabilities
 */

/**
 * Search result from conversation searches
 */
export interface SearchResult {
  workspaceId: string;
  conversationId?: string;
  timestamp: Date;
  type: 'prompt' | 'generation' | 'solution';
  content: string;
  relevanceScore: number;
  contextSnippet: string;
  matchingTerms: string[];
}

/**
 * Similar problem found in past conversations
 */
export interface SimilarProblem {
  workspaceId: string;
  problemDescription: string;
  solutionApproach: string;
  success: boolean;
  relevanceScore: number;
  conversationLink: string;
  technologyStack: string[];
}

/**
 * Solution pattern extracted from conversations
 */
export interface SolutionPattern {
  id: string;
  problemType: string;
  solution: string;
  steps: string[];
  technologies: string[];
  sourceConversations: string[];
  effectivenessScore: number;
  lastUsed: Date;
}

/**
 * Time-Based Intelligence Tool Schemas
 * Enhanced interfaces for temporal analysis and activity patterns
 */

/**
 * Recent workspace activity with detailed context
 */
export interface RecentWorkspaceActivity {
  workspaceId: string;
  workspaceLabel: string;
  lastActivity: Date;
  activityAge: string;
  activityIntensity: 'High' | 'Medium' | 'Low';
  recentContext: string;
  sessionPatterns: SessionPattern[];
  currentStatus: string;
  timeInvestment: {
    totalHours: number;
    recentHours: number;
    sessionsCount: number;
  };
  abandonmentRisk: 'High' | 'Medium' | 'Low' | 'None';
}

/**
 * Session pattern analysis
 */
export interface SessionPattern {
  date: Date;
  duration: number; // minutes
  promptCount: number;
  generationCount: number;
  activityType: 'coding' | 'problem_solving' | 'exploration' | 'documentation';
  productivity: number; // 0-1 score
}

/**
 * Activity analytics for workspace
 */
export interface ActivityAnalytics {
  workspaceId: string;
  workspaceLabel: string;
  timeRange: {
    start: Date;
    end: Date;
    totalDays: number;
  };
  workSessions: WorkSession[];
  patterns: {
    productiveHours: number[];
    averageSessionLength: number;
    peakDays: string[];
    bottlenecks: string[];
  };
  trends: {
    conversationFrequency: number;
    codeChangeFrequency: number;
    problemSolvingTime: number;
    learningProgression: string;
  };
  insights: string[];
}

/**
 * Individual work session analysis
 */
export interface WorkSession {
  startTime: Date;
  endTime: Date;
  duration: number; // minutes
  promptCount: number;
  generationCount: number;
  codeChanges: number;
  topics: string[];
  productivity: number;
  sessionType: 'intensive' | 'exploration' | 'maintenance' | 'learning';
}

/**
 * Interactive Selection Tool Schemas
 * Enhanced interfaces for smart workspace selection and guided discovery
 */

/**
 * Smart workspace selection result
 */
export interface WorkspaceSelectionResult {
  workspaceId: string;
  workspaceLabel: string;
  relevanceScore: number;
  matchReasons: string[];
  metadata: {
    technology: string[];
    status: string;
    lastActivity: Date;
    activityLevel: number;
  };
  suggestions: string[];
}

/**
 * Workspace discovery wizard session
 */
export interface WizardSession {
  sessionId: string;
  intent: string;
  currentStep: number;
  totalSteps: number;
  collectedInfo: {
    preferences: any;
    context: string;
    requirements: string[];
  };
  suggestions: WorkspaceSelectionResult[];
  nextActions: string[];
}

/**
 * Advanced Analytics Tool Schemas
 * Enhanced interfaces for productivity metrics and cross-workspace intelligence
 */

/**
 * Comprehensive productivity metrics
 */
export interface ProductivityMetrics {
  workspaceId?: string;
  timeframe: string;
  metrics: {
    efficiency: number; // 0-100 score
    focus: number; // 0-100 score
    learning: number; // 0-100 score
    problemSolving: number; // 0-100 score
    codeQuality: number; // 0-100 score
    collaboration: number; // 0-100 score
  };
  trends: {
    improvement: number; // positive/negative percentage
    consistency: number; // 0-100 score
    patterns: string[];
  };
  insights: string[];
  recommendations: string[];
}

/**
 * Cross-workspace activity comparison
 */
export interface WorkspaceComparison {
  workspaces: WorkspaceActivitySummary[];
  comparisonType: string;
  timeframe: string;
  insights: {
    topPerformers: string[];
    needsAttention: string[];
    patterns: string[];
    recommendations: string[];
  };
  visualData: {
    chartType: string;
    dataPoints: any[];
    categories: string[];
  };
}

/**
 * Workspace activity summary for comparisons
 */
export interface WorkspaceActivitySummary {
  workspaceId: string;
  workspaceLabel: string;
  activityScore: number;
  productivityScore: number;
  learningScore: number;
  successIndicators: string[];
  timeInvestment: number; // hours
  recentTrend: 'improving' | 'stable' | 'declining';
}