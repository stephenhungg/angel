"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { TransitionLink } from "./PageTransition";

/**
 * Nav — ported verbatim from portfolio-temp/portfolio/components/Nav.tsx,
 * then adapted: kawaii sticker wordmark instead of the "stpn." text, sakura
 * pink hover instead of muted-medium gray.
 *
 * Pattern: dot-grid icon rotates 45° to cross on open. Drawer height 0 → auto
 * via paused gsap timeline, links stagger in via opacity + y. drawerVisible
 * state drives the bg-white flip (stays white during the entire close anim
 * so it doesn't pop transparent mid-collapse).
 */

const NAV_LINKS = [
  { href: "/download", label: "download" },
  { href: "#origin", label: "origin" },
  { href: "#what-she-is", label: "what she is" },
  { href: "#archetypes", label: "archetypes" },
  { href: "https://github.com/stephenhungg/angel", label: "github" },
];

function DotIcon({ open }: { open: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid grid-cols-2 gap-[3px] transition-transform duration-500 ${
        open ? "rotate-45" : "rotate-0"
      }`}
      style={{ transitionTimingFunction: "cubic-bezier(0.42, 0.21, 0, 1)" }}
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <span key={i} className="block h-[5px] w-[5px] rounded-full bg-current" />
      ))}
    </span>
  );
}

export function Nav() {
  const [open, setOpen] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const linksRef = useRef<HTMLUListElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  useEffect(() => {
    const drawer = drawerRef.current;
    const links = linksRef.current;
    if (!drawer || !links) return;

    const tl = gsap
      .timeline({
        paused: true,
        onStart: () => setDrawerVisible(true),
        onReverseComplete: () => setDrawerVisible(false),
      })
      .to(drawer, { duration: 0.55, height: "auto", ease: "power3.out" })
      .to(
        links.querySelectorAll("li"),
        {
          duration: 0.5,
          opacity: 1,
          y: 0,
          ease: "power3.out",
          stagger: 0.045,
        },
        0.12,
      )
      .reverse();

    tlRef.current = tl;
    return () => {
      tl.kill();
    };
  }, []);

  useEffect(() => {
    const tl = tlRef.current;
    if (!tl) return;
    tl.reversed(!open);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      className="fixed inset-x-0 top-4 z-30 mx-auto w-[calc(100%-2rem)] max-w-[1280px] tablet:top-6"
      style={{ transition: "background-color 200ms linear" }}
    >
      <div
        className={`border border-white/50 bg-cloud/35 px-4 shadow-[0_8px_24px_-8px_rgba(199,78,122,0.25),inset_0_1px_0_rgba(255,255,255,0.6)] backdrop-blur-2xl transition-[border-radius,background-color] duration-500 ease-[cubic-bezier(0.42,0.21,0,1)] tablet:px-6 ${
          drawerVisible
            ? "rounded-[32px] bg-cloud/85"
            : "rounded-pill"
        }`}
        style={{
          WebkitBackdropFilter: "blur(24px) saturate(140%)",
          backdropFilter: "blur(24px) saturate(140%)",
        }}
      >
        <nav className="flex items-center justify-between py-2 tablet:py-2.5">
          {/* kawaii sticker wordmark + bow flourish — slim variant */}
          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="group relative inline-flex items-center gap-1.5"
          >
            <Image
              src="/kawaii/wordmark-pink-nano-t.png"
              alt="angel"
              width={400}
              height={200}
              className="h-8 w-auto select-none tablet:h-9 desktop:h-10"
              style={{
                filter: "drop-shadow(0 3px 0 rgba(155, 58, 95, 0.25))",
              }}
              priority
            />
            <Image
              src="/kawaii/cute-bow-t.png"
              alt=""
              aria-hidden
              width={120}
              height={120}
              className="h-5 w-auto -translate-y-0.5 select-none transition-transform duration-300 ease-out group-hover:rotate-12 group-hover:scale-110 tablet:h-6 desktop:h-7"
            />
          </Link>
          <button
            type="button"
            aria-label={open ? "close menu" : "open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center text-ink-near transition-colors hover:text-sakura-600"
          >
            <DotIcon open={open} />
          </button>
        </nav>

        {/* drawer — sits inside the morphing pill. height animates 0 → auto via gsap */}
        <div ref={drawerRef} aria-hidden={!open} style={{ height: 0, overflow: "hidden" }}>
          <div className="border-t border-hairline/60 pb-7 pt-6 tablet:pb-10 tablet:pt-8">
            <ul ref={linksRef} className="flex flex-col gap-1 tablet:gap-2">
              {NAV_LINKS.map((item) => {
                const isDownload = item.href === "/download";
                const isExternal = item.href.startsWith("http");
                const cls =
                  "block font-bagel text-[32px] leading-[1.05] tracking-[-0.02em] text-ink-near transition-colors duration-300 hover:text-sakura-500 tablet:text-[44px] desktop:text-[56px]";
                return (
                  <li
                    key={item.href}
                    style={{ opacity: 0, transform: "translateY(20px)" }}
                  >
                    {isDownload ? (
                      <TransitionLink
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className={cls}
                      >
                        {item.label}
                      </TransitionLink>
                    ) : isExternal ? (
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setOpen(false)}
                        className={cls}
                      >
                        {item.label}
                      </a>
                    ) : (
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className={cls}
                      >
                        {item.label}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="mt-8 flex items-end justify-end gap-6 font-sans text-[14px] font-medium text-muted-deep tablet:mt-10 tablet:text-[15px]">
              <div className="flex flex-col items-end gap-1 text-right">
                <a
                  href="https://github.com/stephenhungg/angel"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center hover:text-sakura-600"
                >
                  github →
                </a>
                <TransitionLink href="/download" className="inline-flex min-h-11 items-center hover:text-sakura-600">
                  download angel ↓
                </TransitionLink>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
