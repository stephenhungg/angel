/**
 * settings.ts — renderer-side wrapper around window.angel.settings.*.
 *
 * Thin layer; the canonical store lives in main process (settings.json in
 * userData). The renderer only mirrors what main returns and forwards
 * mutations through IPC.
 */

import type { AngelSettings } from '@/global';

export interface SettingsBootstrap {
  settings: AngelSettings | null;
  shouldShowSettings: boolean;
  bootHasEnvKey: boolean;
  defaultConvexUrl: string;
}

export async function readSettingsBootstrap(): Promise<SettingsBootstrap> {
  return await window.angel.settings.get();
}

export async function saveSettings(
  partial: Partial<AngelSettings>,
): Promise<AngelSettings> {
  return await window.angel.settings.set(partial);
}

export async function resetSettings(): Promise<void> {
  await window.angel.settings.reset();
}

export async function markIntroComplete(): Promise<AngelSettings> {
  return await window.angel.settings.markIntroComplete();
}
