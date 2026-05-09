"use client";

/**
 * page-transition — gsap pink wipe + mascot pop between routes.
 *
 * usage:
 *   1. wrap the app in <PageTransition>{children}</PageTransition> at layout
 *   2. replace <Link href="/foo"> with <TransitionLink href="/foo"> for any
 *      navigation that should trigger the kawaii wipe (other Link uses still
 *      navigate normally)
 *
 * choreography:
 *   click -> overlay slides up from bottom (pink gradient)
 *           mascot pops in (back.out)
 *           sparkles cascade
 *           router.push() fires
 *   route changes -> usePathname effect runs
 *           sparkles fade
 *           mascot scales out
 *           overlay slides up off-screen
 *           total ~1.3s
 *
 * an internal isAnimating ref guards against double-clicks + prevents
 * the reveal from running on initial mount or on navigations that
 * weren't triggered by us.
 */

import * as React from "react";
import {
  useCallback,
  useEffect,
  useRef,
  type AnchorHTMLAttributes,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import gsap from "gsap";

// module-level singleton: PageTransition registers its `go` fn on mount, every
// TransitionLink calls it directly. dodges the react 19 Context JSX-type
// collision when @types/react is duplicated in the bun lockfile.
let _registeredGo: ((href: string) => void) | null = null;
function setGo(fn: ((href: string) => void) | null) {
  _registeredGo = fn;
}
function callGo(href: string) {
  if (_registeredGo) _registeredGo(href);
}

const SPARKLES = Array.from({ length: 22 }, (_, i) => ({
  left: ((i * 173) % 100) + (i % 2 === 0 ? 2 : -2),
  top: ((i * 211) % 100) + (i % 3 === 0 ? 4 : -3),
  size: 8 + ((i * 7) % 14),
  delay: (i % 8) * 0.02,
}));

export function PageTransition({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const overlayRef = useRef<HTMLDivElement>(null);
  const isAnimating = useRef(false);

  // register/unregister the global go fn whenever pathname changes
  useEffect(() => {
    setGo(handleGo);
    return () => setGo(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const handleGo = useCallback(
    (href: string) => {
      if (isAnimating.current) return;
      if (href === pathname) return;
      const el = overlayRef.current;
      if (!el) {
        router.push(href);
        return;
      }
      isAnimating.current = true;

      // hide initial transforms before display:flex paints them
      gsap.set(el, { display: "flex", yPercent: 100 });
      gsap.set(".transition-mascot", { scale: 0.3, opacity: 0, rotate: -18 });
      gsap.set(".transition-sparkle", { opacity: 0, scale: 0.3 });
      gsap.set(".transition-tagline", { opacity: 0, y: 20 });

      gsap
        .timeline({
          onComplete: () => router.push(href),
        })
        .to(el, {
          yPercent: 0,
          duration: 0.6,
          ease: "power3.inOut",
        })
        .to(
          ".transition-mascot",
          {
            scale: 1,
            opacity: 1,
            rotate: 0,
            duration: 0.55,
            ease: "back.out(1.6)",
          },
          "-=0.25",
        )
        .to(
          ".transition-sparkle",
          {
            opacity: 1,
            scale: 1,
            duration: 0.4,
            stagger: { amount: 0.35, from: "random" },
            ease: "back.out(2)",
          },
          "-=0.4",
        )
        .to(
          ".transition-tagline",
          {
            opacity: 1,
            y: 0,
            duration: 0.4,
            ease: "power2.out",
          },
          "-=0.35",
        );
    },
    [pathname, router],
  );

  // when pathname changes, reveal the destination by sliding overlay off-screen.
  // skip the very first mount + any nav we didn't trigger.
  useEffect(() => {
    if (!isAnimating.current) return;
    const el = overlayRef.current;
    if (!el) {
      isAnimating.current = false;
      return;
    }
    // small delay so the destination paints under the overlay before reveal
    const t = window.setTimeout(() => {
      gsap
        .timeline({
          onComplete: () => {
            isAnimating.current = false;
          },
        })
        .to(".transition-tagline", {
          opacity: 0,
          y: -10,
          duration: 0.25,
          ease: "power2.in",
        })
        .to(
          ".transition-sparkle",
          {
            opacity: 0,
            scale: 0.3,
            duration: 0.25,
            stagger: { amount: 0.2, from: "random" },
          },
          "-=0.15",
        )
        .to(
          ".transition-mascot",
          {
            scale: 0.5,
            opacity: 0,
            rotate: 16,
            duration: 0.35,
            ease: "power2.in",
          },
          "-=0.25",
        )
        .to(
          el,
          {
            yPercent: -100,
            duration: 0.65,
            ease: "power3.inOut",
          },
          "-=0.25",
        )
        .set(el, { display: "none" });
    }, 120);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <>
      {children}
      <div
        ref={overlayRef}
        className="pointer-events-none fixed inset-0 z-[200] hidden items-center justify-center overflow-hidden"
        style={{
          background:
            "linear-gradient(180deg, #ff4f8b 0%, #ff85a8 55%, #ffc1d3 100%)",
        }}
        aria-hidden
      >
        {/* candy stripes overlay for kawaii texture */}
        <div
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, rgba(255,255,255,0.6) 0 22px, transparent 22px 44px)",
          }}
        />

        {/* sparkles scattered */}
        {SPARKLES.map((s, i) => (
          <span
            key={i}
            className="transition-sparkle pointer-events-none absolute"
            style={{
              left: `${s.left}%`,
              top: `${s.top}%`,
              width: s.size,
              height: s.size,
              borderRadius: "50%",
              background: "#ffffff",
              boxShadow: "0 0 12px rgba(255,255,255,0.8)",
            }}
          />
        ))}

        {/* center stack: mascot + tagline */}
        <div className="relative z-10 flex flex-col items-center gap-6">
          <img
            src="/kawaii/mascot-wave-t.png"
            alt=""
            className="transition-mascot pointer-events-none h-auto w-[260px] select-none tablet:w-[320px]"
            style={{
              filter: "drop-shadow(0 12px 0 rgba(155, 58, 95, 0.35))",
            }}
          />
          <div
            className="transition-tagline font-bagel text-[28px] leading-none text-white tablet:text-[36px]"
            style={{
              textShadow: "0 4px 0 rgba(155, 58, 95, 0.45)",
            }}
          >
            summoning angel ♡
          </div>
        </div>
      </div>
    </>
  );
}

type TransitionLinkProps = {
  href: string;
  children: React.ReactNode;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">;

export function TransitionLink({
  href,
  children,
  onClick,
  ...rest
}: TransitionLinkProps) {
  return (
    <a
      href={href}
      onClick={(e) => {
        // honor cmd/ctrl-click + middle-click for new tab
        if (
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey ||
          (e as React.MouseEvent).button === 1
        ) {
          return;
        }
        e.preventDefault();
        onClick?.(e);
        callGo(href);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
