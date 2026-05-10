'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';

const TABS: { href: string; label: string; sublabel: string }[] = [
  { href: '/admin/space', label: 'space', sublabel: 'live trait-space' },
  { href: '/admin/traces', label: 'traces', sublabel: 'per-user inspector' },
  { href: '/admin/synthesis', label: 'synthesis', sublabel: 'personality.md log' },
  { href: '/admin/timeline', label: 'timeline', sublabel: 'cross-surface feed' },
  { href: '/admin/heartbeats', label: 'heartbeats', sublabel: 'always-on dashboard' },
];

export function AdminChrome({ children }: React.PropsWithChildren) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-paper text-ink-near">
      {/* top bar — wordmark + sign-out */}
      <header className="hairline gutter sticky top-0 z-40 flex h-[72px] items-center justify-between border-b bg-paper/90 backdrop-blur">
        <Link href="/admin/space" className="flex items-baseline gap-2">
          <span className="font-display text-[26px] italic leading-none text-ink-primary">
            observatory
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-secondary">
            internal
          </span>
        </Link>

        <div className="flex items-center gap-6">
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-secondary">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500/70 mr-2 align-middle animate-pulse" />
            live
          </span>
          <form action="/api/admin-auth?logout=1" method="post">
            <button
              type="submit"
              className="font-sans text-[13px] font-medium text-muted-deep hover:text-ink-primary transition-colors"
            >
              sign out
            </button>
          </form>
        </div>
      </header>

      <div className="grid grid-cols-1 tablet:grid-cols-[220px_1fr] min-h-[calc(100vh-72px)]">
        {/* left rail — tab nav, vertical typeset */}
        <aside className="hairline border-r gutter py-10 hidden tablet:flex flex-col gap-8">
          <nav className="flex flex-col gap-6">
            {TABS.map((t) => {
              const active = pathname?.startsWith(t.href);
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className="group flex flex-col gap-1"
                >
                  <span
                    className={`font-display text-[28px] italic leading-none transition-colors ${
                      active ? 'text-ink-primary' : 'text-muted-tertiary group-hover:text-ink-near'
                    }`}
                  >
                    {t.label}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-secondary">
                    {t.sublabel}
                  </span>
                  {active && (
                    <motion.div
                      layoutId="rail-underline"
                      className="h-px w-8 bg-ink-near mt-1"
                      transition={{ duration: 0.4, ease: [0, 0, 0, 1] }}
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-secondary">
              build
            </span>
            <span className="font-mono text-[11px] text-muted-deep">
              v0.1 · hackathon
            </span>
          </div>
        </aside>

        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
