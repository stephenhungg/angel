/**
 * Agent state + tool definitions. Used by orchestrator (desktop main) and
 * surfaced via convex subscriptions to renderer.
 */

import type { Emotion, AnchorId } from './scene.js';

export interface AgentState {
  userId: string;
  emotion: Emotion;
  location: AnchorId;
  faceExpression?: string;
  currentTaskId?: string;
  isWalking: boolean;
  walkTarget?: AnchorId;
  updatedAt: number;
}

export type TaskStatus = 'pending' | 'running' | 'verifying' | 'success' | 'failed';

export type TaskType = 'delegate' | 'browse' | 'parallel' | 'deploy' | 'background';

export interface AngelTask {
  id: string;
  userId: string;
  intent: string;
  translatedPrompt?: string;
  type: TaskType;
  status: TaskStatus;
  startedAt: number;
  completedAt?: number;
  output?: {
    summary: string;
    evidence: string[];
    artifactUrl?: string;
  };
  error?: string;
}

export type MemoryType = 'episodic' | 'semantic' | 'preference';

export interface MemoryEntry {
  id: string;
  userId: string;
  type: MemoryType;
  content: string;
  timestamp: number;
  embedding?: number[];
  metadata?: {
    sourceTurnId?: string;
    relatedTaskId?: string;
    confidence?: number;
  };
}

export interface OrchestratorOutput {
  say?: string;
  emotion?: Emotion;
  tools?: ToolCall[];
}

export type ToolCall =
  | { tool: 'walkTo'; args: { anchor: AnchorId } }
  | { tool: 'delegate'; args: { intent: string; repo?: string } }
  | { tool: 'browse'; args: { intent: string } }
  | { tool: 'remember'; args: { fact: string; type?: MemoryType } }
  | { tool: 'react'; args: { emotion: Emotion } }
  | { tool: 'expression'; args: { face: string } }
  | { tool: 'deploy'; args: { target: 'vercel' | 'fly' | 'render' } };
