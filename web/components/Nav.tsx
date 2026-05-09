"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// moment's nav: wordmark + © glyph left, single 'menu' button right, hairline border below.
// no inline page links. menu is an overlay.
export function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="hairline gutter sticky top-0 z-40 flex h-[90px] items-center justify-between border-b bg-paper/90 backdrop-blur">
        <Link href="/" className="flex items-baseline gap-1">
          <span className="font-sans text-[24px] font-medium leading-none tracking-[-0.02em] text-ink-primary">
            angel
          </span>
          <span className="font-sans text-[14px] font-medium text-muted-deep">©</span>
        </Link>

        {/* matches moment menu computed: 12px Manrope 400 lineHeight normal
            tracking normal color rgb(0,0,0) */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="font-sans text-[12px] font-normal tracking-normal text-black transition-colors duration-200 ease-linear hover:text-muted-deep"
          style={{ lineHeight: "normal" }}
          aria-expanded={open}
          aria-label="toggle menu"
        >
          {open ? "close" : "menu"}
        </button>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0.001 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0.001 }}
            transition={{ duration: 0.4, ease: [0, 0, 0, 1] }}
            className="fixed inset-0 z-30 flex flex-col items-start justify-center gutter"
            style={{ background: "rgba(0,0,0,0.8)" }}
          >
            <nav className="flex flex-col gap-4 text-cloud">
              {[
                { label: "discover", href: "/discover" },
                { label: "origin", href: "#origin" },
                { label: "voices", href: "#voices" },
                { label: "begin", href: "/discover" },
              ].map((it) => (
                <Link
                  key={it.label}
                  href={it.href}
                  onClick={() => setOpen(false)}
                  className="font-sans text-[48px] font-medium leading-none tracking-[-0.02em] transition-colors duration-200 ease-linear hover:text-muted-tertiary tablet:text-[64px]"
                >
                  {it.label}
                </Link>
              ))}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
