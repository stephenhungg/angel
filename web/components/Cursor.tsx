"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Cursor — single circle that inverts against whatever's underneath via
 * `mix-blend-mode: difference` on a white fill. White on pink → teal.
 * White on white → black. Auto-contrast everywhere.
 *
 * Default 24px. Grows to 64px on `a, button, [role=button], [data-cursor-grow]`.
 * Smooth rAF lerp follow. Hidden on touch devices via `(pointer: fine)` MQ.
 *
 * lifted from portfolio-temp/portfolio/components/Cursor.tsx
 */
export function Cursor() {
  const elRef = useRef<HTMLDivElement>(null);
  const target = useRef({ x: -100, y: -100 });
  const current = useRef({ x: -100, y: -100 });
  const rafRef = useRef<number | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    setEnabled(true);

    const onMove = (e: MouseEvent) => {
      target.current.x = e.clientX;
      target.current.y = e.clientY;
    };
    const onOver = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const interactive = t.closest('a, button, [role="button"], [data-cursor-grow]');
      setHovering(!!interactive);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseover", onOver, { passive: true });

    const tick = () => {
      current.current.x += (target.current.x - current.current.x) * 0.2;
      current.current.y += (target.current.y - current.current.y) * 0.2;
      const el = elRef.current;
      if (el) {
        el.style.transform = `translate3d(${current.current.x}px, ${current.current.y}px, 0) translate(-50%, -50%)`;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseover", onOver);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  if (!enabled) return null;

  const size = hovering ? 64 : 24;

  return (
    <div
      ref={elRef}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[9999] hidden tablet:block"
      style={{
        width: size,
        height: size,
        borderRadius: 9999,
        background: "#fff",
        mixBlendMode: "difference",
        transition:
          "width 350ms cubic-bezier(0.42,0.21,0,1), height 350ms cubic-bezier(0.42,0.21,0,1)",
        willChange: "transform, width, height",
      }}
    />
  );
}
