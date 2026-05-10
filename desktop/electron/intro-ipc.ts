/**
 * intro-ipc.ts — main-process handler for the introduction phase.
 *
 * Each answer the user gives during the introduction is:
 *   1. Written to the live memory backend (Nia in prod, LocalMemory in dev),
 *      tagged source=introduction and memory_type matching the question.
 *   2. Mirrored into convex.memoryMirror so /admin/timeline picks it up.
 *   3. Optionally relayed to convex.intro:ingestAnswer for any cloud-side
 *      indexing we want to add later (the action is a thin wrapper today).
 *
 * Renderer calls via `window.angel.introIngestAnswer({ ... })`.
 */

import { ipcMain } from 'electron';
import { getMemory } from './agent/memory';
import { mirrorMemory, getConvexClient } from './convex-bridge';
import { currentUserId } from './settings-ipc';
import {
  generateIntroductionQuestions,
  type IntroQuestionTopic,
} from './agent/onboarding';

type IntroMemoryType = 'fact' | 'preference' | 'scratchpad';

function mapTypeToMemoryType(t: IntroMemoryType): 'episodic' | 'semantic' | 'preference' | 'observation' {
  // Facts about the user (work, people, projects) → semantic. Preferences
  // (frustrations, rhythm, never-do) → preference. Scratchpad-style
  // confessions → observation so they survive but don't compete with hard
  // facts on retrieval. All entries are tagged source=introduction so
  // /admin can filter the intake clearly.
  if (t === 'fact') return 'semantic';
  if (t === 'preference') return 'preference';
  return 'observation';
}


export interface IntroAnswerArgs {
  userId?: string;
  questionId: string;
  question: string;
  answer: string;
  type: IntroMemoryType;
}

export interface IntroGenerateArgs {
  personalityMd: string;
  userName?: string;
  topics: IntroQuestionTopic[];
  promptTemplate: string;
}

export function registerIntroIpc(): void {
  ipcMain.handle('intro:generateQuestions', async (_evt, args: IntroGenerateArgs) => {
    return await generateIntroductionQuestions(args);
  });

  ipcMain.handle('intro:ingestAnswer', async (_evt, args: IntroAnswerArgs) => {
    const userId = args.userId ?? currentUserId();
    const text = (args.answer ?? '').trim();
    if (!text) return { ok: false, error: 'empty answer' };

    const memoryType = mapTypeToMemoryType(args.type);
    const content = `[introduction · ${args.questionId}] Q: ${args.question} A: ${text}`;

    // 1. write to nia (or local fallback)
    try {
      const mem = getMemory();
      await mem.remember({
        userId,
        type: memoryType,
        content,
        timestamp: Date.now(),
        metadata: {
          source: 'introduction',
          questionId: args.questionId,
          question: args.question,
          rawAnswer: text,
        },
      });
    } catch (err) {
      console.warn('[intro-ipc] memory write failed (non-fatal):', err);
    }

    // 2. mirror into convex.memoryMirror so /admin/timeline shows it
    try {
      await mirrorMemory({
        userId,
        type: memoryType,
        content,
        timestamp: Date.now(),
        metadata: {
          source: 'introduction',
          questionId: args.questionId,
          question: args.question,
        },
      });
    } catch (err) {
      console.warn('[intro-ipc] convex mirror failed (non-fatal):', err);
    }

    // 3. fire intro:ingestAnswer convex action for cloud-side indexing
    try {
      const c = getConvexClient();
      if (c) {
        await c.action('intro/ingest:ingestAnswer' as never, {
          userId,
          questionId: args.questionId,
          question: args.question,
          answer: text,
          type: args.type,
        } as never);
      }
    } catch (err) {
      // non-fatal; nia + mirror already captured this
      console.warn('[intro-ipc] intro:ingest action failed (non-fatal):', err);
    }

    return { ok: true };
  });
}
