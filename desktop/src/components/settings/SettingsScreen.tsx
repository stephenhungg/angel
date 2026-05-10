/**
 * SettingsScreen — first-run configuration. Pick transport (convex proxy or
 * own anthropic key), persist to settings.json in userData. After save we
 * call onComplete() and the App phase machine advances to onboarding.
 *
 * Mounted ONLY when settings.json doesn't exist AND no real ANTHROPIC_API_KEY
 * was in env at boot (stephen's dev path skips this entirely).
 *
 * The screen is also reachable from inside the room (via the esc menu's
 * "settings" button) where it doubles as a reset/start-over surface.
 */

import { useEffect, useState } from 'react';
import type { AngelSettings } from '@/global';
import { saveSettings, resetSettings, readSettingsBootstrap } from '@/lib/settings';

export type SettingsScreenMode = 'first-run' | 'edit';

interface Props {
  mode?: SettingsScreenMode;
  onComplete: (s: AngelSettings) => void;
  onCancel?: () => void;
}

export function SettingsScreen({ mode = 'first-run', onComplete, onCancel }: Props) {
  const [transport, setTransport] = useState<'convex' | 'direct'>('convex');
  const [apiKey, setApiKey] = useState('');
  const [convexUrl, setConvexUrl] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    void readSettingsBootstrap().then((boot) => {
      if (boot.settings) {
        setTransport(boot.settings.transport);
        setApiKey(boot.settings.anthropicApiKey ?? '');
        setConvexUrl(boot.settings.convexUrl);
      } else {
        setConvexUrl(boot.defaultConvexUrl);
      }
    });
  }, []);

  async function handleSave(): Promise<void> {
    setErr(null);
    if (transport === 'direct' && !apiKey.trim().startsWith('sk-ant-')) {
      setErr('paste a key starting with "sk-ant-".');
      return;
    }
    setSaving(true);
    try {
      const next = await saveSettings({
        transport,
        anthropicApiKey: transport === 'direct' ? apiKey.trim() : undefined,
        convexUrl: convexUrl.trim() || undefined,
      });
      onComplete(next);
    } catch (e) {
      setErr((e as Error).message ?? 'failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  async function handleReset(): Promise<void> {
    if (!confirm('reset everything? this clears your settings, your persona, and your introduction. you will start over from the first swipe.')) {
      return;
    }
    setResetting(true);
    try {
      await resetSettings();
      // also wipe persona persistence so app restarts clean
      try {
        localStorage.removeItem('angel-persona-v1');
      } catch {
        /* ignore */
      }
      // hard reload — every store re-bootstraps from fresh state
      location.reload();
    } finally {
      setResetting(false);
    }
  }

  return (
    <main
      className="onboarding-root min-h-screen kawaii-bg text-ink-near flex flex-col relative overflow-hidden"
      data-testid="settings-screen"
    >
      <header className="relative gutter pt-8 pb-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" className="w-6 h-6 text-sakura-500" fill="currentColor">
            <path d="M12 0 L14 10 L24 12 L14 14 L12 24 L10 14 L0 12 L10 10 Z" />
          </svg>
          <div className="font-display italic text-[28px] tracking-tight text-sakura-700">
            angel
          </div>
        </div>
        <div className="font-mono uppercase tracking-[0.18em] text-[10px] text-sakura-700 px-3 py-1.5 rounded-pill bg-sakura-100 ring-1 ring-sakura-200">
          {mode === 'first-run' ? 'first run · setup' : 'settings'}
        </div>
      </header>

      <section className="relative flex-1 flex flex-col items-center justify-center gutter pb-16 z-10">
        <div className="w-full max-w-[560px] flex flex-col gap-7">
          <div className="text-center flex flex-col gap-3">
            <h1 className="m-0 font-display italic text-[40px] leading-tight text-sakura-800 kawaii-text-glow">
              {mode === 'first-run' ? 'how should she think?' : 'settings'}
            </h1>
            <p className="m-0 font-sans text-[14px] text-muted-deep leading-relaxed">
              every angel needs a brain. pick where hers runs from. you can
              switch this later — it never leaves your machine.
            </p>
          </div>

          <fieldset className="flex flex-col gap-3 border-0 p-0">
            <TransportOption
              selected={transport === 'convex'}
              onSelect={() => setTransport('convex')}
              label="use angel's shared backend"
              detail="convex proxy. zero setup, zero cost to you. ~150ms slower per turn. (recommended)"
              tag="default"
            />
            <TransportOption
              selected={transport === 'direct'}
              onSelect={() => setTransport('direct')}
              label="use my own anthropic key"
              detail="direct calls to claude. fastest. you bring the key."
              tag="byo"
            />
          </fieldset>

          {transport === 'direct' && (
            <label className="flex flex-col gap-2">
              <span className="font-mono uppercase tracking-[0.18em] text-[10px] text-sakura-700">
                anthropic api key
              </span>
              <input
                type="password"
                placeholder="sk-ant-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                className="rounded-md border border-hairline bg-white px-3 py-2 font-mono text-[13px] text-ink-near focus:outline-none focus:border-sakura-400"
                style={{ pointerEvents: 'auto' }}
              />
              <span className="font-sans text-[11px] text-muted-secondary">
                stored locally in <code className="font-mono">settings.json</code>. never sent anywhere except claude.
              </span>
            </label>
          )}

          <details className="text-[12px] font-sans text-muted-secondary">
            <summary className="cursor-pointer select-none">advanced</summary>
            <label className="flex flex-col gap-2 mt-3">
              <span className="font-mono uppercase tracking-[0.18em] text-[10px] text-sakura-700">
                convex url
              </span>
              <input
                type="url"
                value={convexUrl}
                onChange={(e) => setConvexUrl(e.target.value)}
                spellCheck={false}
                className="rounded-md border border-hairline bg-white px-3 py-2 font-mono text-[12px] text-ink-near focus:outline-none focus:border-sakura-400"
              />
            </label>
          </details>

          {err && (
            <div className="rounded-md border border-sakura-300 bg-sakura-50 px-3 py-2 font-sans text-[13px] text-sakura-800">
              {err}
            </div>
          )}

          <div className="flex items-center justify-between gap-4 pt-2">
            {mode === 'edit' ? (
              <button
                type="button"
                onClick={onCancel}
                className="font-sans text-[13px] text-muted-deep hover:text-sakura-700"
              >
                cancel
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-pill bg-sakura-500 px-6 py-2.5 font-sans text-[14px] font-semibold text-white shadow-[0_4px_0_rgba(199,78,122,0.35)] transition-transform hover:-translate-y-0.5 hover:bg-sakura-600 disabled:opacity-60 disabled:hover:translate-y-0"
            >
              {saving ? 'saving…' : mode === 'first-run' ? 'continue' : 'save'}
            </button>
          </div>

          {mode === 'edit' && (
            <div className="border-t border-hairline pt-5 mt-2 flex flex-col gap-3">
              <div className="font-mono uppercase tracking-[0.18em] text-[10px] text-sakura-700">
                danger zone
              </div>
              <button
                type="button"
                onClick={handleReset}
                disabled={resetting}
                className="self-start rounded-md border border-sakura-300 px-4 py-2 font-sans text-[13px] text-sakura-700 hover:bg-sakura-50 disabled:opacity-60"
              >
                {resetting ? 'resetting…' : 'reset everything (start over)'}
              </button>
              <p className="m-0 font-sans text-[11px] text-muted-secondary">
                clears your persona, your introduction answers, and this
                settings file. on relaunch you'll see the swipe deck again.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function TransportOption({
  selected,
  onSelect,
  label,
  detail,
  tag,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  detail: string;
  tag: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={
        'group flex flex-col items-start gap-1 rounded-2xl border px-5 py-4 text-left transition-all ' +
        (selected
          ? 'border-sakura-400 bg-sakura-50 shadow-[0_4px_0_rgba(236,101,146,0.18)]'
          : 'border-hairline bg-cloud hover:border-sakura-300 hover:bg-sakura-50/40')
      }
      data-selected={selected}
    >
      <div className="flex items-center gap-2">
        <div
          className={
            'h-3 w-3 rounded-full ' +
            (selected ? 'bg-sakura-500 ring-2 ring-sakura-200' : 'bg-sakura-100 ring-1 ring-sakura-200')
          }
        />
        <span className="font-sans text-[15px] font-semibold text-ink-near">
          {label}
        </span>
        <span className="ml-auto font-mono uppercase tracking-[0.18em] text-[9px] text-sakura-700 px-2 py-0.5 rounded-pill bg-sakura-100">
          {tag}
        </span>
      </div>
      <span className="font-sans text-[12px] text-muted-deep leading-snug">
        {detail}
      </span>
    </button>
  );
}
