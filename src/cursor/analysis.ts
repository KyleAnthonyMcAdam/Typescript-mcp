/**
 * Workspace Analysis Engine
 * 
 * This module provides intelligent analysis of Cursor workspace data,
 * extracting meaningful insights from conversations, code changes, and activities.
 */

import { logger } from '../lib/logger.js';

export interface WorkspaceAnalysis {
  id: string;
  smartLabel: string;
  projectType: string;
  technologies: string[];
  primaryTechnology: string;
  currentStatus: 'Setup' | 'Active' | 'Problem Solving' | 'Documentation' | 'Complete' | 'Abandoned';
  lastActivity: Date;
  activitySummary: string;
  keyTopics: string[];
  collaborators: string[];
  problemsSolved: string[];
  currentGoals: string[];
  timeInvestment: {
    totalHours: number;
    sessionsCount: number;
    averageSessionLength: number;
  };
  metrics: {
    promptCount: number;
    generationCount: number;
    codeChanges: number;
    conversationThreads: number;
  };
  confidence: number; // 0-1 score for analysis confidence
}

export interface ConversationData {
  prompts: Array<{
    unixMs?: number;
    generationUUID?: string;
    textDescription?: string;
    text?: string;
    commandType?: number;
  }>;
  generations: Array<{
    unixMs?: number;
    generationUUID?: string;
    type?: string;
    textDescription?: string;
  }>;
}

export interface ComposerSession {
  composerId: string;
  name: string;
  createdAt: number;
  lastUpdatedAt: number;
  unifiedMode: string;
  forceMode: string;
}

// Enhanced technology keywords with more comprehensive patterns
const TECHNOLOGY_PATTERNS = {
  // Frontend Frameworks & Libraries
  'React': ['react', 'jsx', 'tsx', 'component', 'usestate', 'useeffect', 'props', 'react-dom', 'create-react-app'],
  'Vue': ['vue', 'vuejs', 'vue.js', 'nuxt', 'composition api', 'reactive', 'ref('],
  'Angular': ['angular', 'ng-', 'typescript', '@angular', '@component', '@injectable'],
  'Svelte': ['svelte', 'sveltekit', '.svelte'],
  
  // Backend Frameworks
  'Node.js': ['nodejs', 'node.js', 'npm', 'package.json', 'express', 'node_modules', 'require(', 'module.exports'],
  'Express': ['express', 'app.listen', 'middleware', 'app.get', 'app.post', 'router'],
  'Django': ['django', 'python', 'models.py', 'views.py', 'urls.py', 'settings.py', 'manage.py'],
  'Flask': ['flask', 'python', 'app.route', '@app.route', 'render_template'],
  'FastAPI': ['fastapi', 'python', 'pydantic', '@app.get', '@app.post', 'uvicorn'],
  'Spring': ['spring', 'java', '@controller', '@service', '@repository', '@autowired'],
  'Next.js': ['nextjs', 'next.js', 'next/image', 'next/router', 'getServerSideProps', 'getStaticProps'],
  
  // Programming Languages
  'TypeScript': ['typescript', '.ts', '.tsx', 'interface', 'type', 'enum', 'namespace', 'tsc'],
  'JavaScript': ['javascript', '.js', '.mjs', 'function', 'const', 'let', 'var', 'arrow function'],
  'Python': ['python', '.py', 'def ', 'import ', 'pip', 'requirements.txt', 'venv', '__init__.py'],
  'Java': ['java', '.java', 'class ', 'public static', 'maven', 'gradle', 'springframework'],
  'C#': ['csharp', 'c#', '.cs', 'using System', 'namespace', '.net', 'visual studio'],
  'Go': ['golang', 'go', '.go', 'func main', 'package main', 'go mod'],
  'Rust': ['rust', '.rs', 'cargo', 'fn main', 'cargo.toml', 'struct', 'impl'],
  'PHP': ['php', '.php', '<?php', 'composer', 'laravel', 'symfony'],
  
  // Databases
  'MongoDB': ['mongodb', 'mongo', 'mongoose', 'collection', 'aggregation', 'bson'],
  'PostgreSQL': ['postgresql', 'postgres', 'psql', 'pg_', 'pgadmin'],
  'MySQL': ['mysql', 'mariadb', 'mysqldump', 'phpmyadmin'],
  'SQLite': ['sqlite', 'sqlite3', '.db', '.sqlite', 'sqlite_'],
  'Redis': ['redis', 'cache', 'redis-cli', 'redisinsight'],
  
  // DevOps & Tools
  'Docker': ['docker', 'dockerfile', 'container', 'docker-compose', 'image', 'containerization'],
  'Kubernetes': ['kubernetes', 'k8s', 'kubectl', 'pod', 'deployment', 'service', 'namespace'],
  'AWS': ['aws', 'amazon', 'ec2', 's3', 'lambda', 'cloudformation', 'iam', 'vpc'],
  'Azure': ['azure', 'microsoft', 'az cli', 'resource group', 'app service'],
  'Git': ['git', 'github', 'gitlab', 'commit', 'push', 'pull', 'merge', 'branch', 'repository'],
  
  // Testing
  'Jest': ['jest', 'test', 'expect', 'describe', 'it(', 'beforeEach'],
  'Cypress': ['cypress', 'e2e', 'cy.', 'integration test'],
  'Pytest': ['pytest', 'test_', 'assert', 'fixture', 'conftest.py'],
  
  // Mobile
  'React Native': ['react native', 'react-native', 'expo', 'metro', 'react-native-cli'],
  'Flutter': ['flutter', 'dart', 'widget', 'pubspec.yaml', 'flutter doctor'],
  'Swift': ['swift', 'ios', 'xcode', 'cocoapods', 'swift package'],
  'Kotlin': ['kotlin', 'android', 'gradle', 'android studio'],
  
  // AI/ML
  'TensorFlow': ['tensorflow', 'tf.', 'keras', 'tensor', 'neural network'],
  'PyTorch': ['pytorch', 'torch', 'neural', 'tensor', 'autograd'],
  'OpenAI': ['openai', 'gpt', 'chatgpt', 'ai', 'llm', 'language model'],
  'LangChain': ['langchain', 'llm', 'chain', 'agent', 'retrieval'],
  
  // MCP & Cursor Specific
  'MCP': ['mcp', 'model context protocol', 'mcp server', 'cursor', 'typescript-mcp'],
  'Cursor': ['cursor', 'cursor ai', 'composer', 'workspace', 'ai assistant']
};

// Enhanced project type patterns
const PROJECT_TYPE_PATTERNS = {
  'Web Application': ['web app', 'website', 'frontend', 'backend', 'full stack', 'api', 'server', 'client'],
  'Mobile App': ['mobile', 'ios', 'android', 'react native', 'flutter', 'app store', 'mobile development'],
  'DevOps/Tooling': ['devops', 'deployment', 'ci/cd', 'docker', 'kubernetes', 'automation', 'script', 'infrastructure'],
  'Data Analysis': ['data', 'analysis', 'visualization', 'pandas', 'numpy', 'jupyter', 'dataset', 'analytics'],
  'Machine Learning': ['ml', 'ai', 'model', 'training', 'neural', 'tensorflow', 'pytorch', 'deep learning'],
  'Game Development': ['game', 'unity', 'unreal', 'godot', 'pygame', 'gaming'],
  'Desktop Application': ['desktop', 'electron', 'tkinter', 'qt', 'gui', 'desktop app'],
  'Library/Package': ['library', 'package', 'npm', 'pip', 'gem', 'framework', 'sdk', 'component library'],
  'Learning/Tutorial': ['learn', 'tutorial', 'course', 'practice', 'exercise', 'study', 'example'],
  'Bug Fix/Debugging': ['bug', 'fix', 'debug', 'error', 'issue', 'problem', 'troubleshoot'],
  'MCP Development': ['mcp', 'model context protocol', 'mcp server', 'cursor integration', 'tool development'],
  'API Development': ['api', 'rest', 'graphql', 'endpoint', 'microservice', 'web service']
};

// Enhanced status detection patterns
const STATUS_PATTERNS = {
  'Setup': ['setup', 'install', 'initialize', 'create project', 'getting started', 'first time', 'configuration', 'environment'],
  'Active': ['implement', 'add feature', 'working on', 'build', 'develop', 'creating', 'coding', 'writing'],
  'Problem Solving': ['error', 'bug', 'fix', 'debug', 'issue', 'problem', 'stuck', 'help', 'troubleshoot', 'not working'],
  'Documentation': ['document', 'readme', 'comment', 'explain', 'write docs', 'documentation', 'guide'],
  'Complete': ['done', 'finished', 'complete', 'deploy', 'release', 'final', 'production', 'live'],
  'Abandoned': ['abandon', 'stop', 'cancel', 'give up', 'not working', 'switching to']
};

/**
 * Analyzes workspace content to extract intelligent insights
 */
export async function analyzeWorkspaceContent(
  workspaceId: string,
  conversationData: ConversationData,
  composerSessions: ComposerSession[]
): Promise<WorkspaceAnalysis> {
  logger.info(`Starting enhanced analysis for workspace ${workspaceId}`);
  
  // Normalize conversation data
  const normalizedPrompts = conversationData.prompts.map(p => ({
    text: p.textDescription || p.text || '',
    timestamp: p.unixMs || Date.now(),
    uuid: p.generationUUID || ''
  }));
  
  const normalizedGenerations = conversationData.generations.map(g => ({
    text: g.textDescription || '',
    timestamp: g.unixMs || Date.now(),
    type: g.type || 'unknown',
    uuid: g.generationUUID || ''
  }));
  
  const analysis: WorkspaceAnalysis = {
    id: workspaceId,
    smartLabel: '',
    projectType: 'Unknown',
    technologies: [],
    primaryTechnology: '',
    currentStatus: 'Active',
    lastActivity: new Date(),
    activitySummary: '',
    keyTopics: [],
    collaborators: [],
    problemsSolved: [],
    currentGoals: [],
    timeInvestment: {
      totalHours: 0,
      sessionsCount: 0,
      averageSessionLength: 0
    },
    metrics: {
      promptCount: normalizedPrompts.length,
      generationCount: normalizedGenerations.length,
      codeChanges: normalizedGenerations.filter(g => g.type === 'apply').length,
      conversationThreads: composerSessions.length
    },
    confidence: 0
  };

  // Combine all text content for analysis
  const allText = [
    ...normalizedPrompts.map(p => p.text),
    ...normalizedGenerations.map(g => g.text),
    ...composerSessions.map(s => s.name)
  ].join(' ').toLowerCase();

  logger.info(`Analyzing ${allText.length} characters of text content`);

  // Generate smart label
  analysis.smartLabel = generateSmartLabel(allText, composerSessions, normalizedPrompts);
  
  // Detect technologies
  analysis.technologies = detectTechnologies(allText);
  analysis.primaryTechnology = analysis.technologies[0] || 'Unknown';
  
  // Determine project type
  analysis.projectType = determineProjectType(allText);
  
  // Detect current status
  analysis.currentStatus = detectProjectStatus(allText, { prompts: normalizedPrompts, generations: normalizedGenerations });
  
  // Extract key topics
  analysis.keyTopics = extractKeyTopics(allText);
  
  // Calculate time investment
  analysis.timeInvestment = calculateTimeInvestment({ prompts: normalizedPrompts, generations: normalizedGenerations }, composerSessions);
  
  // Get last activity
  analysis.lastActivity = getLastActivity({ prompts: normalizedPrompts, generations: normalizedGenerations });
  
  // Generate activity summary
  analysis.activitySummary = generateActivitySummary({ prompts: normalizedPrompts, generations: normalizedGenerations }, analysis);
  
  // Extract problems solved and goals
  analysis.problemsSolved = extractProblemsSolved(allText);
  analysis.currentGoals = extractCurrentGoals(allText);
  
  // Calculate confidence score
  analysis.confidence = calculateConfidenceScore(analysis, allText);
  
  logger.info(`Analysis complete for ${workspaceId}: ${analysis.smartLabel} (${Math.round(analysis.confidence * 100)}% confidence)`);
  
  return analysis;
}

/**
 * Enhanced smart label generation with better fallbacks
 */
function generateSmartLabel(allText: string, composerSessions: ComposerSession[], prompts: any[]): string {
  // Try composer session names first
  if (composerSessions.length > 0) {
    const sessionNames = composerSessions
      .filter(s => s.name && s.name.length > 3)
      .map(s => s.name)
      .slice(0, 3)
      .join(' ');
      
    const projectName = extractProjectName(sessionNames);
    if (projectName && projectName !== 'Development Project') {
      return projectName;
    }
  }
  
  // Try first meaningful prompt
  if (prompts.length > 0) {
    const firstPrompt = prompts[0].text;
    if (firstPrompt && firstPrompt.length > 10) {
      const extracted = extractProjectName(firstPrompt);
      if (extracted && extracted !== 'Development Project') {
        return extracted;
      }
    }
  }
  
  // Look for technology + project patterns
  const technologies = detectTechnologies(allText);
  const projectType = determineProjectType(allText);
  
  if (technologies.length > 0 && projectType !== 'Unknown') {
    if (projectType === 'MCP Development') {
      return `${technologies[0]} MCP Server`;
    }
    return `${technologies[0]} ${projectType}`;
  }
  
  // Look for specific patterns in text
  const patterns = [
    /(?:building|creating|developing|working on)\s+(?:a\s+)?([a-zA-Z][a-zA-Z0-9\s]{3,25})/gi,
    /(?:project|app|application|tool)\s+(?:called\s+)?([a-zA-Z][a-zA-Z0-9\s]{3,25})/gi,
    /help.*?(?:with|create|build)\s+([a-zA-Z][a-zA-Z0-9\s]{3,25})/gi
  ];
  
  for (const pattern of patterns) {
    const matches = [...allText.matchAll(pattern)];
    if (matches.length > 0) {
      const candidate = matches[0][1].trim();
      if (candidate.length > 3 && candidate.length < 30 && !isGenericText(candidate)) {
        return capitalizeWords(candidate);
      }
    }
  }
  
  // Fallback to technology or type
  if (technologies.length > 0) {
    return `${technologies[0]} Project`;
  }
  
  if (projectType !== 'Unknown') {
    return projectType;
  }
  
  return 'Development Project';
}

/**
 * Extracts potential project name from text with better cleaning
 */
function extractProjectName(text: string): string | null {
  if (!text || text.length < 3) return null;
  
  // Clean the text
  let cleaned = text
    .replace(/^(how to|can you|help me|i want to|please|let's|let me|create|build|develop|make|working on|building|understanding|review|fix|debug)/gi, '')
    .replace(/\b(app|application|project|website|tool|service|system|code|file|script|program|software)\b/gi, '')
    .replace(/[^\w\s-]/g, '')
    .trim();
  
  // Take first meaningful part
  const words = cleaned.split(/\s+/).filter(w => w.length > 2);
  if (words.length > 0 && words.length <= 4) {
    const candidate = words.join(' ');
    if (candidate.length > 3 && candidate.length < 40 && !isGenericText(candidate)) {
      return capitalizeWords(candidate);
    }
  }
  
  return null;
}

/**
 * Enhanced generic text detection
 */
function isGenericText(text: string): boolean {
  const generic = [
    'development', 'project', 'application', 'system', 'tool', 'service',
    'website', 'app', 'code', 'program', 'software', 'script', 'file',
    'this', 'that', 'something', 'anything', 'everything', 'nothing',
    'issue', 'problem', 'error', 'bug', 'help', 'question'
  ];
  
  const lowerText = text.toLowerCase();
  return generic.some(term => lowerText.includes(term)) && text.split(' ').length < 4;
}

/**
 * Enhanced technology detection with better scoring
 */
function detectTechnologies(text: string): string[] {
  const techScores = new Map<string, number>();
  
  Object.entries(TECHNOLOGY_PATTERNS).forEach(([tech, patterns]) => {
    let score = 0;
    patterns.forEach((pattern, index) => {
      // Weight earlier patterns more heavily
      const weight = patterns.length - index;
      const regex = new RegExp(`\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      const matches = text.match(regex);
      if (matches) {
        score += matches.length * weight;
      }
    });
    if (score > 0) {
      techScores.set(tech, score);
    }
  });
  
  return Array.from(techScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tech]) => tech);
}

/**
 * Enhanced project type determination
 */
function determineProjectType(text: string): string {
  const typeScores = new Map<string, number>();
  
  Object.entries(PROJECT_TYPE_PATTERNS).forEach(([type, patterns]) => {
    let score = 0;
    patterns.forEach((pattern, index) => {
      const weight = patterns.length - index;
      const regex = new RegExp(`\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      const matches = text.match(regex);
      if (matches) {
        score += matches.length * weight;
      }
    });
    if (score > 0) {
      typeScores.set(type, score);
    }
  });
  
  if (typeScores.size === 0) return 'Unknown';
  
  return Array.from(typeScores.entries())
    .sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Enhanced status detection focusing on recent activity
 */
function detectProjectStatus(text: string, conversationData: any): 'Setup' | 'Active' | 'Problem Solving' | 'Documentation' | 'Complete' | 'Abandoned' {
  // Focus on recent conversations
  const recentTexts = [
    ...conversationData.prompts.slice(-5).map((p: any) => p.text),
    ...conversationData.generations.slice(-5).map((g: any) => g.text)
  ].join(' ').toLowerCase();
  
  const statusScores = new Map<string, number>();
  
  Object.entries(STATUS_PATTERNS).forEach(([status, patterns]) => {
    let score = 0;
    patterns.forEach(pattern => {
      const regex = new RegExp(`\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      const matches = recentTexts.match(regex);
      if (matches) {
        score += matches.length;
      }
    });
    if (score > 0) {
      statusScores.set(status, score);
    }
  });
  
  if (statusScores.size === 0) return 'Active';
  
  const topStatus = Array.from(statusScores.entries())
    .sort((a, b) => b[1] - a[1])[0][0];
  
  return topStatus as any;
}

/**
 * Enhanced key topic extraction
 */
function extractKeyTopics(text: string): string[] {
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3)
    .filter(word => !/^(this|that|they|have|been|will|would|could|should|when|where|what|how|with|from|your|mine|our)$/.test(word));
  
  const wordCounts = new Map<string, number>();
  words.forEach(word => {
    wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
  });
  
  return Array.from(wordCounts.entries())
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => capitalizeWords(word));
}

/**
 * Extract problems that were solved
 */
function extractProblemsSolved(text: string): string[] {
  const problemPatterns = [
    /(?:fixed|solved|resolved|debugged)\s+([^.!?]{10,50})/gi,
    /(?:issue|problem|bug).*?(?:fixed|resolved|solved)/gi
  ];
  
  const problems: string[] = [];
  problemPatterns.forEach(pattern => {
    const matches = [...text.matchAll(pattern)];
    matches.forEach(match => {
      if (match[1]) {
        problems.push(capitalizeWords(match[1].trim()));
      }
    });
  });
  
  return problems.slice(0, 3);
}

/**
 * Extract current goals from conversation
 */
function extractCurrentGoals(text: string): string[] {
  const goalPatterns = [
    /(?:want to|need to|trying to|goal is to|planning to)\s+([^.!?]{10,50})/gi,
    /(?:implement|add|create|build)\s+([^.!?]{10,50})/gi
  ];
  
  const goals: string[] = [];
  goalPatterns.forEach(pattern => {
    const matches = [...text.matchAll(pattern)];
    matches.forEach(match => {
      if (match[1]) {
        goals.push(capitalizeWords(match[1].trim()));
      }
    });
  });
  
  return goals.slice(0, 3);
}

/**
 * Calculate time investment metrics
 */
function calculateTimeInvestment(conversationData: any, composerSessions: ComposerSession[]) {
  const sessions = composerSessions.length || 1;
  const conversations = conversationData.prompts.length + conversationData.generations.length;
  
  // Estimate based on conversation complexity
  const estimatedHours = Math.max(0.5, conversations * 0.1 + sessions * 0.5);
  const avgSessionLength = estimatedHours / sessions;
  
  return {
    totalHours: Math.round(estimatedHours * 10) / 10,
    sessionsCount: sessions,
    averageSessionLength: Math.round(avgSessionLength * 10) / 10
  };
}

/**
 * Get the last activity timestamp
 */
function getLastActivity(conversationData: any): Date {
  const allTimestamps = [
    ...conversationData.prompts.map((p: any) => p.timestamp),
    ...conversationData.generations.map((g: any) => g.timestamp)
  ].filter(t => t && t > 0);
  
  if (allTimestamps.length === 0) {
    return new Date();
  }
  
  const lastTimestamp = Math.max(...allTimestamps);
  return new Date(lastTimestamp);
}

/**
 * Generate activity summary
 */
function generateActivitySummary(conversationData: any, analysis: WorkspaceAnalysis): string {
  const { promptCount, generationCount, codeChanges } = analysis.metrics;
  const tech = analysis.primaryTechnology;
  const type = analysis.projectType;
  
  let summary = `${type} using ${tech}. `;
  
  if (codeChanges > 0) {
    summary += `Active development with ${codeChanges} code modifications. `;
  }
  
  if (promptCount > 10) {
    summary += `Extensive conversation history (${promptCount} prompts). `;
  }
  
  return summary.trim();
}

/**
 * Enhanced confidence score calculation
 */
function calculateConfidenceScore(analysis: WorkspaceAnalysis, allText: string): number {
  let confidence = 0.3; // Base confidence
  
  // Boost for specific technologies detected
  if (analysis.technologies.length > 0) confidence += 0.2;
  if (analysis.technologies.length > 2) confidence += 0.1;
  
  // Boost for non-generic project type
  if (analysis.projectType !== 'Unknown') confidence += 0.2;
  
  // Boost for meaningful smart label
  if (analysis.smartLabel !== 'Development Project') confidence += 0.2;
  
  // Boost for conversation volume
  if (analysis.metrics.promptCount > 5) confidence += 0.1;
  if (analysis.metrics.promptCount > 20) confidence += 0.1;
  
  // Boost for code changes
  if (analysis.metrics.codeChanges > 0) confidence += 0.1;
  
  // Text length factor
  if (allText.length > 1000) confidence += 0.1;
  
  return Math.min(1.0, confidence);
}

/**
 * Capitalize words properly
 */
function capitalizeWords(text: string): string {
  return text.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
} 