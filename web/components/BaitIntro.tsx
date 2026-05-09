"use client";

import { useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";

if (typeof window !== "undefined") {
  gsap.registerPlugin(useGSAP, CustomEase);
  if (!CustomEase.get("momentOut")) {
    CustomEase.create("momentOut", "0,0,0,1");
    CustomEase.create("expoOut", "0.16, 1, 0.3, 1");
  }
}

/**
 * BaitIntro — angel's signature opening sequence.
 *
 * choreography (master gsap timeline):
 *
 *   1. saas:      buzzword-loaded fake AI b2b SaaS landing — dwell ~4s
 *   2. break:     vintage no-signal SMPTE color-bar VHS static glitch
 *                 (saas convulses underneath, tv static + bars flicker on top)
 *   3. black:     everything collapses to full black
 *   4. kanji:     "天使" appears in Noto Serif Japanese (white, large) via
 *                 masked-line SplitText reveal (each line slides up from
 *                 below into a clip mask, expoOut, stagger 0.18)
 *                 below it: " a n g e l " spaced-out, smaller, same serif,
 *                 same line-mask reveal animation.
 *   5. wipe:      svg-shape-overlays cascade — multiple morphing paths sweep
 *                 from black into pink/sakura, layered with delays
 *                 (port of Blake Bowen's codepen)
 *   6. landing:   real pink kawaii landing visible underneath
 *
 * skips on repeat visits via sessionStorage.
 */

const NUM_PATHS = 4;
const NUM_POINTS = 10;

export function BaitIntro({ children }: { children: React.ReactNode }) {
  const [done, setDone] = useState(false);
  const [hideBait, setHideBait] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem("angel:bait-seen") === "1") {
      setDone(true);
      setHideBait(true);
    }
  }, []);

  useGSAP(
    () => {
      if (done) return;
      const node = containerRef.current;
      if (!node) return;

      // ───── SVG shape-overlays setup (port of Blake Bowen's codepen)
      const overlayPaths = node.querySelectorAll<SVGPathElement>(".shape-overlays__path");
      const allPoints: number[][] = [];
      for (let i = 0; i < overlayPaths.length; i++) {
        allPoints.push(new Array(NUM_POINTS).fill(100));
      }

      function renderOverlay() {
        for (let i = 0; i < overlayPaths.length; i++) {
          const path = overlayPaths[i];
          const points = allPoints[i];
          let d = `M 0 0 V ${points[0]} C`;
          for (let j = 0; j < NUM_POINTS - 1; j++) {
            const p = ((j + 1) / (NUM_POINTS - 1)) * 100;
            const cp = p - (1 / (NUM_POINTS - 1) * 100) / 2;
            d += ` ${cp} ${points[j]} ${cp} ${points[j + 1]} ${p} ${points[j + 1]}`;
          }
          d += ` V 100 H 0`;
          path.setAttribute("d", d);
        }
      }
      renderOverlay();

      // master timeline
      const tl = gsap.timeline({
        defaults: { ease: "momentOut" },
        onUpdate: renderOverlay,
        onComplete: () => {
          window.sessionStorage.setItem("angel:bait-seen", "1");
          setDone(true);
          window.setTimeout(() => setHideBait(true), 100);
        },
      });

      // initial state
      tl.set(".saas", { autoAlpha: 1 })
        .set([".tv-glitch", ".black-collapse", ".kanji-reveal", ".shape-overlays"], {
          autoAlpha: 0,
        })
        .set(".kanji-line-inner", { yPercent: 110 })
        // ────────────────────────────────────────────────────────────
        // STAGE 1: saas dwell — quick read of the buzzwords (~2.4s total)
        // ────────────────────────────────────────────────────────────
        .from(".saas-headline-char", {
          y: 24,
          opacity: 0,
          duration: 0.35,
          stagger: 0.008,
          ease: "power2.out",
        })
        .from(".saas-stat", { y: 12, opacity: 0, stagger: 0.04, duration: 0.3 }, "<+0.15")
        .to({}, { duration: 1.4 })
        // ────────────────────────────────────────────────────────────
        // STAGE 2: break — pure SMPTE no-signal vintage TV static
        // ────────────────────────────────────────────────────────────
        .addLabel("break")
        .to(".tv-glitch", { autoAlpha: 1, duration: 0.05 }, "break")
        // SMPTE bars flicker on/off with random horizontal offset (VHS feel)
        .to(
          ".smpte-bars",
          {
            keyframes: [
              { opacity: 0.95, x: -10, duration: 0.08 },
              { opacity: 0, duration: 0.05 },
              { opacity: 0.85, x: 14, duration: 0.1 },
              { opacity: 0, duration: 0.04 },
              { opacity: 1, x: -6, duration: 0.14 },
              { opacity: 0.85, x: 0, duration: 0.4 },
              { opacity: 1, x: -3, duration: 0.3 },
            ],
            ease: "none",
          },
          "break",
        )
        .to(".tv-noise", { opacity: 0.75, duration: 0.15 }, "break")
        .to(".tv-scanlines", { opacity: 0.55, duration: 0.15 }, "break")
        // saas convulses underneath
        .to(
          ".saas",
          {
            keyframes: [
              { x: -8, skewX: -2, duration: 0.05 },
              { x: 10, skewX: 1.5, duration: 0.05 },
              { x: -4, skewX: -1, duration: 0.05 },
              { x: 0, skewX: 0, duration: 0.05 },
            ],
            ease: "none",
          },
          "break",
        )
        .to(".saas", { filter: "brightness(0.85) blur(1.5px)", duration: 0.4 }, "break+=0.3")
        // ────────────────────────────────────────────────────────────
        // STAGE 3: collapse to BLACK
        // ────────────────────────────────────────────────────────────
        .addLabel("black", "break+=1.6")
        .to(".black-collapse", { autoAlpha: 1, duration: 0.35 }, "black")
        .to([".saas", ".tv-glitch"], { autoAlpha: 0, duration: 0.25 }, "black+=0.1")
        // ────────────────────────────────────────────────────────────
        // STAGE 4: 天使 kanji + spaced 'angel' — masked-line splittext reveal
        // ────────────────────────────────────────────────────────────
        .addLabel("kanji", "black+=0.5")
        .to(".kanji-reveal", { autoAlpha: 1, duration: 0.05 }, "kanji")
        .to(
          ".kanji-line-inner",
          {
            yPercent: 0,
            duration: 0.9,
            stagger: 0.18,
            ease: "expoOut",
          },
          "kanji+=0.05",
        )
        // hold on the kanji
        .to({}, { duration: 1.2 })
        // ────────────────────────────────────────────────────────────
        // STAGE 5: shape-overlays — paths sweep from bottom up, pink wipe
        // ────────────────────────────────────────────────────────────
        .addLabel("wipe")
        .to(".shape-overlays", { autoAlpha: 1, duration: 0.05 }, "wipe");
      // animate each path's control points one by one with cascading delays
      const pointsDelay = Array.from({ length: NUM_POINTS }, () => Math.random() * 0.3);
      const delayPerPath = 0.18;
      for (let i = 0; i < overlayPaths.length; i++) {
        const points = allPoints[i];
        const pathDelay = delayPerPath * i;
        for (let j = 0; j < NUM_POINTS; j++) {
          const delay = pointsDelay[j] + pathDelay;
          tl.to(
            points,
            { [j]: 0, duration: 0.9, ease: "power2.inOut" },
            `wipe+=${delay}`,
          );
        }
      }
      tl
        // fade the kanji as the wipe rises
        .to(
          [".kanji-reveal"],
          { opacity: 0, duration: 0.5, ease: "power2.in" },
          "wipe+=0.4",
        )
        // hold the pink wipe momentarily
        .to({}, { duration: 0.3 })
        // ────────────────────────────────────────────────────────────
        // STAGE 6: handoff — fade wipe + black layer to reveal the hero.
        //
        // (the previous stage tried to choreograph individual hero pieces
        // via .hero-bg / .hero-decor / .hero-wordmark targets, but
        // useGSAP({ scope: containerRef }) constrains selectors to the
        // bait overlay div — those classes live on Hero siblings, not
        // descendants, so all 11 selectors silently no-op'd. dropped
        // for clean console + Hero's own framer-motion entrance handles
        // the reveal.)
        // ────────────────────────────────────────────────────────────
        .to(
          [".shape-overlays", ".black-collapse"],
          { autoAlpha: 0, duration: 0.9, ease: "momentOut" },
        );

      return () => {
        tl.kill();
      };
    },
    { scope: containerRef, dependencies: [done] },
  );

  function handleSkip() {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("angel:bait-seen", "1");
    }
    setDone(true);
    setHideBait(true);
  }

  if (hideBait) return <>{children}</>;

  return (
    <>
      {children}
      <div
        ref={containerRef}
        className="fixed inset-0 z-[100] overflow-hidden"
        style={{ pointerEvents: done ? "none" : "auto" }}
      >
        <SaasBait onSkip={handleSkip} />
        <TvGlitch />
        <BlackCollapse />
        <KanjiReveal />
        <ShapeOverlays />
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────
// stage 1 — buzzword-overloaded ai-b2b SaaS landing
// ────────────────────────────────────────────────────────────────────────

function SaasBait({ onSkip }: { onSkip: () => void }) {
  const headline = "Enterprise-Grade AI Agents";
  return (
    <div className="saas absolute inset-0 overflow-y-auto bg-white text-slate-900">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          background:
            "radial-gradient(ellipse at 15% 10%, #e0e7ff 0%, transparent 35%), radial-gradient(ellipse at 85% 30%, #fce7f3 0%, transparent 40%), radial-gradient(ellipse at 50% 80%, #d1fae5 0%, transparent 35%), radial-gradient(ellipse at 30% 90%, #ddd6fe 0%, transparent 40%)",
        }}
      />
      <header className="relative z-10 flex h-[68px] items-center justify-between border-b border-slate-200 bg-white/70 px-10 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-gradient-to-br from-indigo-500 to-purple-600" />
          <span className="font-sans text-[18px] font-bold tracking-tight text-slate-900">
            Sentrix<span className="text-indigo-600">AI</span>
          </span>
          <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 font-sans text-[11px] font-semibold text-emerald-700">
            SOC 2 · ISO 27001 · HIPAA · GDPR
          </span>
        </div>
        <nav className="flex items-center gap-6 font-sans text-[13px] font-medium text-slate-600">
          {["Platform", "Solutions", "Customers", "Pricing", "Resources", "Docs", "Blog"].map((x) => (
            <span key={x} className="cursor-default">{x}</span>
          ))}
          <button type="button" className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700">Sign In</button>
          <button type="button" className="rounded-md bg-indigo-600 px-4 py-2 font-semibold text-white shadow-sm">Book a Demo →</button>
        </nav>
      </header>
      <main className="relative z-10 mx-auto max-w-6xl px-10 pt-16 pb-10 text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white px-4 py-1.5 font-sans text-[11px] font-semibold text-indigo-700 shadow-sm">
          <span>★</span>
          <span>Trusted by 500+ Fortune 1000 Enterprises</span>
          <span>·</span>
          <span>Series C · $200M ARR</span>
        </div>
        <h1 className="mx-auto max-w-4xl font-sans text-[64px] font-bold leading-[1.05] tracking-tight text-slate-900">
          {headline.split("").map((c, i) => (
            <span key={i} className="saas-headline-char inline-block">{c === " " ? " " : c}</span>
          ))}
          <br />
          <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">That Actually Ship.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl font-sans text-[16px] leading-relaxed text-slate-600">
          The <strong>production-ready</strong> agentic orchestration platform.
          Deploy <strong>multi-modal LLMs</strong> at scale, fine-tune
          foundation models, and operationalize <strong>RAG pipelines</strong>{" "}
          with sub-100ms latency. <strong>RLHF-aligned</strong>. Zero-trust
          governance. Production-grade observability.
        </p>
        <div className="mt-7 flex items-center justify-center gap-4">
          <button type="button" className="rounded-md bg-slate-900 px-6 py-3 font-sans text-[15px] font-semibold text-white shadow-md">Start Free 14-Day Trial</button>
          <button type="button" className="rounded-md border border-slate-300 bg-white px-6 py-3 font-sans text-[15px] font-semibold text-slate-700">Watch Product Tour ▶</button>
        </div>
        <div className="mt-5 flex items-center justify-center gap-3 font-sans text-[12px] text-slate-500">
          <span>No credit card required</span>·<span>SOC 2 Type II</span>·<span>99.99% SLA</span>·<span>Cancel anytime</span>
        </div>
        <div className="mt-10 grid grid-cols-4 gap-6">
          {[
            { v: "73%", l: "productivity increase" },
            { v: "10x", l: "deployment speed" },
            { v: "$4.2M", l: "average annual savings" },
            { v: "99.99%", l: "platform SLA" },
          ].map((s) => (
            <div key={s.l} className="saas-stat rounded-lg border border-slate-200 bg-white/60 p-4 backdrop-blur">
              <div className="font-sans text-[28px] font-bold text-slate-900">{s.v}</div>
              <div className="mt-1 font-sans text-[11px] text-slate-500">{s.l}</div>
            </div>
          ))}
        </div>
      </main>
      <div className="relative z-10 mt-2 border-y border-slate-200 bg-white py-6">
        <div className="mx-auto max-w-6xl px-10">
          <div className="mb-3 text-center font-sans text-[10px] font-semibold text-slate-400">Powering Mission-Critical AI Workflows At</div>
          <div className="flex items-center justify-around opacity-60">
            {["MORGAN", "ACME CORP", "GLOBEX", "INITECH", "STARK INDUSTRIES", "WAYNE ENT.", "UMBRELLA", "PIED PIPER"].map((b) => (
              <span key={b} className="font-serif text-[13px] font-bold tracking-widest text-slate-500">{b}</span>
            ))}
          </div>
        </div>
      </div>
      <button type="button" onClick={onSkip} className="absolute bottom-6 right-6 z-20 rounded-md border border-slate-200 bg-white/90 px-3 py-1.5 font-sans text-[11px] font-medium text-slate-400 backdrop-blur">skip intro →</button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// stage 2 — vintage no-signal SMPTE TV static glitch
// ────────────────────────────────────────────────────────────────────────

function TvGlitch() {
  // SMPTE color bars (top 7 columns + bottom castellation)
  // top: white, yellow, cyan, green, magenta, red, blue
  // bottom: blue/black/magenta/black/cyan/black/white (the broadcast pattern)
  const topBars = "linear-gradient(90deg, #c0c0c0 0%, #c0c0c0 14.28%, #c0c000 14.28%, #c0c000 28.57%, #00c0c0 28.57%, #00c0c0 42.85%, #00c000 42.85%, #00c000 57.14%, #c000c0 57.14%, #c000c0 71.42%, #c00000 71.42%, #c00000 85.71%, #0000c0 85.71%, #0000c0 100%)";
  const midBars = "linear-gradient(90deg, #0000c0 0%, #0000c0 14.28%, #131313 14.28%, #131313 28.57%, #c000c0 28.57%, #c000c0 42.85%, #131313 42.85%, #131313 57.14%, #00c0c0 57.14%, #00c0c0 71.42%, #131313 71.42%, #131313 85.71%, #c0c0c0 85.71%, #c0c0c0 100%)";
  const bottomBars = "linear-gradient(90deg, #00214c 0%, #00214c 25%, #ffffff 25%, #ffffff 37.5%, #32006a 37.5%, #32006a 50%, #131313 50%, #131313 75%, #131313 75%, #131313 100%)";

  return (
    <div className="tv-glitch pointer-events-none absolute inset-0 z-40">
      {/* SMPTE bars — full screen, flickers via gsap */}
      <div className="smpte-bars absolute inset-0" style={{ opacity: 0 }}>
        <div className="absolute inset-x-0 top-0 h-[70%]" style={{ background: topBars }} />
        <div className="absolute inset-x-0 top-[70%] h-[10%]" style={{ background: midBars }} />
        <div className="absolute inset-x-0 top-[80%] h-[20%]" style={{ background: bottomBars }} />
      </div>

      {/* heavy fractal noise — VHS static layer */}
      <div
        aria-hidden
        className="tv-noise absolute inset-0 mix-blend-screen"
        style={{
          opacity: 0,
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='3.5' numOctaves='3' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
          backgroundSize: "200px 200px",
        }}
      />

      {/* CRT-style horizontal scanlines */}
      <div
        aria-hidden
        className="tv-scanlines absolute inset-0 mix-blend-multiply"
        style={{
          opacity: 0,
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(0,0,0,0.6) 0px, rgba(0,0,0,0.6) 1px, transparent 1px, transparent 3px)",
        }}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// stage 3 — black collapse layer
// ────────────────────────────────────────────────────────────────────────

function BlackCollapse() {
  return <div className="black-collapse absolute inset-0 z-[50] bg-black" style={{ opacity: 0 }} />;
}

// ────────────────────────────────────────────────────────────────────────
// stage 4 — kanji + spaced 'a n g e l' on black, masked-line splittext reveal
// ────────────────────────────────────────────────────────────────────────

function KanjiReveal() {
  return (
    <div className="kanji-reveal absolute inset-0 z-[60] flex flex-col items-center justify-center gap-10" style={{ opacity: 0 }}>
      {/* 天使 — large kanji, Noto Serif Japanese, white. masked line reveal:
          outer div has overflow:hidden, inner translates from yPercent:110 → 0 */}
      <div className="overflow-hidden leading-none">
        <div className="kanji-line-inner font-notoJP text-white" style={{
          fontSize: "clamp(120px, 22vw, 320px)",
          fontWeight: 500,
          lineHeight: 1,
          letterSpacing: "0.05em",
        }}>
          天使
        </div>
      </div>
      {/* spaced angel — same serif, smaller, very wide letter-spacing */}
      <div className="overflow-hidden leading-none">
        <div className="kanji-line-inner font-notoJP text-white" style={{
          fontSize: "clamp(20px, 2.6vw, 36px)",
          fontWeight: 400,
          letterSpacing: "1.2em",
          paddingLeft: "1.2em", // visually balance the trailing space added by letter-spacing
        }}>
          a n g e l
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// stage 5 — svg-shape-overlays: morphing path layers, pink/sakura wipe
// (port of Blake Bowen's codepen — replaces orange gradients with pink)
// ────────────────────────────────────────────────────────────────────────

function ShapeOverlays() {
  return (
    <svg
      className="shape-overlays absolute inset-0 z-[70]"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ opacity: 0, width: "100%", height: "100%" }}
    >
      <defs>
        {/* sakura gradient — deep pink to pale pink */}
        <linearGradient id="sakura1" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#c73e73" />
          <stop offset="100%" stopColor="#ff95b3" />
        </linearGradient>
        {/* sakura mid — sakura pink to pale */}
        <linearGradient id="sakura2" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ff4f8b" />
          <stop offset="100%" stopColor="#ffd6e3" />
        </linearGradient>
        {/* sakura light — pale pink to white */}
        <linearGradient id="sakura3" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffb7c5" />
          <stop offset="100%" stopColor="#fffafc" />
        </linearGradient>
        <linearGradient id="sakura4" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffe5ee" />
          <stop offset="100%" stopColor="#ffffff" />
        </linearGradient>
      </defs>
      <path className="shape-overlays__path" fill="url(#sakura1)" />
      <path className="shape-overlays__path" fill="url(#sakura2)" />
      <path className="shape-overlays__path" fill="url(#sakura3)" />
      <path className="shape-overlays__path" fill="url(#sakura4)" />
    </svg>
  );
}
