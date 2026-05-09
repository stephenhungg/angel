'use client';

import { useState, useTransition } from 'react';
import { motion } from 'framer-motion';

/**
 * password gate. posts to /api/admin-auth which sets the `angel_admin`
 * cookie if the password matches `ADMIN_PASSWORD`. on success, refresh —
 * the server layout re-renders with chrome.
 */
export function AdminGate() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await fetch('/api/admin-auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        window.location.reload();
      } else {
        setError('not it.');
      }
    });
  }

  return (
    <main className="min-h-screen bg-paper flex items-center justify-center gutter">
      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0.001, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0, 0, 0, 1] }}
        className="w-full max-w-[360px] flex flex-col gap-6"
      >
        <div className="flex items-baseline gap-1">
          <span className="font-display text-[40px] italic leading-none text-ink-primary">
            observatory
          </span>
          <span className="font-sans text-[14px] font-medium text-muted-deep">©</span>
        </div>
        <p className="font-sans text-[14px] text-muted-deep leading-relaxed">
          internal. live trait-space, per-user traces, and the synthesis log
          for angel's onboarding pipeline.
        </p>

        <label className="flex flex-col gap-2">
          <span className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted-secondary">
            password
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            className="border-b border-hairline bg-transparent py-2 font-mono text-[14px] text-ink-near outline-none focus:border-ink-near transition-colors"
          />
        </label>

        {error && (
          <span className="font-mono text-[12px] text-[#9a3a3a]">{error}</span>
        )}

        <button
          type="submit"
          disabled={pending}
          className="self-start font-sans text-[14px] font-semibold text-ink-primary border-b border-ink-primary pb-1 hover:text-muted-deep hover:border-muted-deep transition-colors disabled:opacity-40"
        >
          {pending ? 'checking…' : 'enter'}
        </button>
      </motion.form>
    </main>
  );
}
