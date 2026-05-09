"use client";

import { useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";

// register gsap plugins client-side once
if (typeof window !== "undefined") {
  gsap.registerPlugin(useGSAP, CustomEase, MotionPathPlugin);
  // moment.framer.photos's authored eases — preserved for cinematic feel
  if (!CustomEase.get("momentOut")) {
    CustomEase.create("momentOut", "0,0,0,1");
    CustomEase.create("momentLate", "0.12,0.23,0.5,1");
  }
}

/**
 * BaitIntro — the angel thesis embodied as motion.
 *
 *   stage 1 (saas):   fake generic ai-b2b landing — the slop you've seen 1000x
 *   stage 2 (glitch): RGB shift, scanlines, scramble — the corporate veneer fails
 *   stage 3 (reveal): kawaii pink wordmark + sparkle burst + tagline
 *   stage 4 (done):   real landing visible underneath
 *
 * powered by a master gsap timeline. uses CustomEase for moment-style curves,
 * MotionPathPlugin for sparkle radial burst, manual char-split for scramble.
 *
 * skips on repeat visits via sessionStorage.
 */
export function BaitIntro({ children }: { children: React.ReactNode }) {
  const [done, setDone] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // skip the bait if already seen this session
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem("angel:bait-seen") === "1") {
      setDone(true);
    }
  }, []);

  useGSAP(
    () => {
      if (done) return;

      const ctx = containerRef.current;
      if (!ctx) return;

      // master timeline: saas → glitch → reveal → handoff
      const tl = gsap.timeline({
        defaults: { ease: "momentOut" },
        onComplete: () => {
          window.sessionStorage.setItem("angel:bait-seen", "1");
          setDone(true);
        },
      });

      // ── stage 1: saas (let it sit for 4s, then trigger glitch)
      tl.set(".saas", { autoAlpha: 1 })
        .set([".glitch-layer", ".reveal-layer"], { autoAlpha: 0 })
        .to(".saas-headline-char", {
          y: 0,
          opacity: 1,
          duration: 0.6,
          stagger: 0.012,
          ease: "power2.out",
        })
        .to({}, { duration: 3.2 }) // dwell on saas
        // ── stage 2: glitch begins — saas convulses, scrambles, dies
        .addLabel("glitch")
        .to(".glitch-layer", { autoAlpha: 1, duration: 0.05 }, "glitch")
        .to(
          ".saas",
          {
            keyframes: [
              { x: -6, skewX: -2, duration: 0.06 },
              { x: 8, skewX: 1.5, duration: 0.06 },
              { x: -3, skewX: -1, duration: 0.06 },
              { x: 0, skewX: 0, duration: 0.06 },
            ],
            ease: "none",
          },
          "glitch",
        )
        .to(
          ".rgb-r",
          { x: -14, opacity: 0.7, duration: 0.4, ease: "power1.out" },
          "glitch",
        )
        .to(
          ".rgb-b",
          { x: 14, opacity: 0.65, duration: 0.4, ease: "power1.out" },
          "glitch",
        )
        .to(".scanlines", { opacity: 0.8, duration: 0.2 }, "glitch")
        .to(".noise-burst", { opacity: 0.85, duration: 0.1 }, "glitch+=0.1")
        // scramble the saas headline chars
        .add(() => scrambleChars(".saas-headline-char", "$%#@!?*<>/_+={}[]"))
        .to(
          ".saas-headline-char",
          {
            y: -40,
            opacity: 0,
            duration: 0.5,
            stagger: { each: 0.008, from: "random" },
            ease: "power2.in",
          },
          "glitch+=0.6",
        )
        // collapse the saas
        .to(
          ".saas",
          {
            autoAlpha: 0,
            scale: 0.9,
            filter: "blur(8px)",
            duration: 0.5,
          },
          "glitch+=0.9",
        )
        .to(
          ".glitch-layer",
          { autoAlpha: 0, duration: 0.3 },
          "glitch+=1.2",
        )
        // ── stage 3: reveal — kawaii sticker pops in
        .addLabel("reveal", "glitch+=1.4")
        .to(".reveal-layer", { autoAlpha: 1, duration: 0.3 }, "reveal")
        .fromTo(
          ".kawaii-wordmark",
          { scale: 0.4, rotate: -8, opacity: 0 },
          {
            scale: 1,
            rotate: 0,
            opacity: 1,
            duration: 1.2,
            ease: "elastic.out(1, 0.55)",
          },
          "reveal+=0.05",
        )
        // sparkle burst: motionPath in a circle around the wordmark
        .from(
          ".sparkle",
          {
            opacity: 0,
            scale: 0,
            duration: 0,
          },
          "reveal+=0.3",
        )
        .to(
          ".sparkle",
          {
            opacity: 1,
            scale: 1,
            duration: 0.18,
            stagger: { each: 0.04, from: "center" },
            ease: "back.out(2)",
          },
          "reveal+=0.3",
        )
        .to(
          ".sparkle",
          {
            motionPath: {
              path: ".sparkle-path",
              align: ".sparkle-path",
              alignOrigin: [0.5, 0.5],
              autoRotate: false,
            },
            duration: 1.4,
            stagger: { each: 0.04, from: "center" },
            ease: "power1.out",
          },
          "reveal+=0.4",
        )
        .to(
          ".sparkle",
          {
            opacity: 0,
            scale: 0.4,
            duration: 0.4,
            stagger: 0.02,
            ease: "power2.in",
          },
          "reveal+=1.5",
        )
        // tagline fades in beneath
        .from(
          ".tagline-jp",
          { y: 20, opacity: 0, duration: 0.6 },
          "reveal+=0.5",
        )
        .from(
          ".tagline-main",
          { y: 28, opacity: 0, duration: 0.7, ease: "back.out(1.4)" },
          "reveal+=0.7",
        )
        // ── final: fade everything to reveal the real landing
        .to(
          ".reveal-layer",
          {
            autoAlpha: 0,
            duration: 0.7,
            ease: "momentOut",
          },
          "reveal+=2.4",
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
  }

  return (
    <>
      {children}
      {!done && (
        <div
          ref={containerRef}
          className="fixed inset-0 z-[100] overflow-hidden"
        >
          {/* stage 1 — saas bait */}
          <SaasBait onSkip={handleSkip} />

          {/* stage 2 — glitch overlay (RGB shift, scanlines, noise burst) */}
          <GlitchLayer />

          {/* stage 3 — kawaii reveal */}
          <KawaiiReveal />
        </div>
      )}
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────
// stage 1 — generic ai-b2b SaaS landing
// ────────────────────────────────────────────────────────────────────────

function SaasBait({ onSkip }: { onSkip: () => void }) {
  const headline = "Enterprise-Grade AI Agents";
  return (
    <div className="saas absolute inset-0 bg-white text-slate-900">
      {/* ai-mesh-gradient bg, the most overdone trope */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse at 20% 10%, #e0e7ff 0%, transparent 40%), radial-gradient(ellipse at 80% 50%, #fce7f3 0%, transparent 40%), radial-gradient(ellipse at 50% 90%, #d1fae5 0%, transparent 40%)",
        }}
      />

      {/* nav */}
      <header className="relative z-10 flex h-[68px] items-center justify-between border-b border-slate-100 bg-white/60 px-10 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-gradient-to-br from-indigo-500 to-purple-600" />
          <span className="font-sans text-[18px] font-bold tracking-tight text-slate-900">
            Sentrix<span className="text-indigo-600">AI</span>
          </span>
          <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 font-sans text-[11px] font-semibold text-emerald-700">
            SOC 2 Type II
          </span>
        </div>
        <nav className="flex items-center gap-8 font-sans text-[14px] font-medium text-slate-600">
          <span className="cursor-default">Platform</span>
          <span className="cursor-default">Solutions</span>
          <span className="cursor-default">Customers</span>
          <span className="cursor-default">Pricing</span>
          <span className="cursor-default">Resources</span>
          <button
            type="button"
            className="rounded-md bg-indigo-600 px-4 py-2 font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            Book a Demo →
          </button>
        </nav>
      </header>

      {/* hero */}
      <main className="relative z-10 mx-auto max-w-6xl px-10 pt-20 pb-12 text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white px-4 py-1.5 font-sans text-[12px] font-semibold uppercase tracking-wider text-indigo-700 shadow-sm">
          <span>★</span>
          <span>Trusted by 500+ Fortune 1000 Enterprises</span>
        </div>
        <h1 className="mx-auto max-w-4xl font-sans text-[68px] font-bold leading-[1.05] tracking-tight text-slate-900">
          {headline.split("").map((c, i) => (
            <span
              key={i}
              className="saas-headline-char inline-block"
              style={{ opacity: 0, transform: "translateY(24px)" }}
            >
              {c === " " ? " " : c}
            </span>
          ))}
          <br />
          <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
            That Actually Ship.
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl font-sans text-[18px] leading-relaxed text-slate-600">
          Deploy autonomous AI agents at scale. Integrate with 200+ tools.
          Increase team productivity by up to <strong>73%</strong> with our
          patented agentic orchestration layer.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <button
            type="button"
            className="rounded-md bg-slate-900 px-6 py-3 font-sans text-[15px] font-semibold text-white shadow-md hover:bg-slate-800"
          >
            Start Free Trial
          </button>
          <button
            type="button"
            className="rounded-md border border-slate-300 bg-white px-6 py-3 font-sans text-[15px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            Watch Product Tour ▶
          </button>
        </div>
        <div className="mt-8 flex items-center justify-center gap-2 font-sans text-[12px] text-slate-400">
          <span>No credit card required</span>
          <span>·</span>
          <span>14-day free trial</span>
          <span>·</span>
          <span>Cancel anytime</span>
        </div>
      </main>

      {/* logo strip */}
      <div className="relative z-10 mt-8 border-t border-slate-100 bg-white py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-around opacity-50">
          {[
            "MORGAN",
            "ACME CORP",
            "GLOBEX",
            "INITECH",
            "STARK INDUSTRIES",
            "WAYNE ENT.",
          ].map((brand) => (
            <span
              key={brand}
              className="font-serif text-[15px] font-bold tracking-widest text-slate-400"
            >
              {brand}
            </span>
          ))}
        </div>
      </div>

      {/* skip — for impatient return visitors */}
      <button
        type="button"
        onClick={onSkip}
        className="absolute bottom-6 right-6 z-20 rounded-md border border-slate-200 bg-white/80 px-3 py-1.5 font-sans text-[11px] font-medium text-slate-400 backdrop-blur hover:text-slate-600"
      >
        skip intro →
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// stage 2 — glitch overlay (full-screen on top of saas, drives the break)
// ────────────────────────────────────────────────────────────────────────

function GlitchLayer() {
  return (
    <div className="glitch-layer pointer-events-none absolute inset-0 z-30">
      {/* RGB shift channels — overlay the saas with offset color tints */}
      <div
        aria-hidden
        className="rgb-r absolute inset-0 mix-blend-screen"
        style={{ background: "rgba(255, 79, 139, 0)", opacity: 0 }}
      />
      <div
        aria-hidden
        className="rgb-b absolute inset-0 mix-blend-screen"
        style={{ background: "rgba(79, 139, 255, 0)", opacity: 0 }}
      />

      {/* scanlines */}
      <div
        aria-hidden
        className="scanlines absolute inset-0 mix-blend-multiply"
        style={{
          opacity: 0,
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(0,0,0,0.5) 0px, rgba(0,0,0,0.5) 1px, transparent 1px, transparent 3px)",
        }}
      />

      {/* fractal noise burst */}
      <div
        aria-hidden
        className="noise-burst absolute inset-0"
        style={{
          opacity: 0,
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='2.5' numOctaves='3' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
          backgroundSize: "200px 200px",
        }}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// stage 3 — kawaii reveal (sparkle burst + wordmark + tagline)
// ────────────────────────────────────────────────────────────────────────

function KawaiiReveal() {
  return (
    <div
      className="reveal-layer absolute inset-0 flex items-center justify-center"
      style={{
        background:
          "radial-gradient(ellipse at center, #ffe5ee 0%, #fffafc 60%, #ffffff 100%)",
        opacity: 0,
      }}
    >
      {/* invisible motionPath circle for sparkle radial burst */}
      <svg
        aria-hidden
        className="absolute"
        viewBox="-200 -200 400 400"
        style={{ width: "min(80vw, 700px)", height: "min(80vw, 700px)" }}
      >
        <circle
          className="sparkle-path"
          cx="0"
          cy="0"
          r="180"
          fill="none"
          stroke="none"
        />
      </svg>

      {/* sparkles — 16 small stars that burst radially via motionPath */}
      {Array.from({ length: 16 }).map((_, i) => (
        <span
          key={i}
          className="sparkle absolute font-sans"
          style={{
            color: ["#ff4f8b", "#ffb7c5", "#ff95b3", "#ffd6e3"][i % 4],
            fontSize: i % 2 === 0 ? 24 : 16,
          }}
        >
          ✦
        </span>
      ))}

      {/* the wordmark — uses generated kawaii sticker */}
      <img
        src="/kawaii/wordmark-pink-nano.png"
        alt="angel"
        className="kawaii-wordmark relative z-10 max-h-[55vh] max-w-[60vw] drop-shadow-2xl"
        style={{ opacity: 0 }}
      />

      {/* tagline */}
      <div className="absolute bottom-[14%] flex flex-col items-center gap-2 text-center">
        <span
          className="tagline-jp font-sans text-[14px] font-medium tracking-wide opacity-85"
          style={{ color: "#c73e73" }}
        >
          天使 · she&apos;s not designed
        </span>
        <span
          className="tagline-main font-sans text-[28px] font-semibold tracking-tight"
          style={{ color: "#7a3e58" }}
        >
          she&apos;s discovered.
        </span>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// utility: scramble chars in place (DIY ScrambleText since plugin is paid)
// ────────────────────────────────────────────────────────────────────────

function scrambleChars(selector: string, charset: string) {
  const els = document.querySelectorAll<HTMLElement>(selector);
  const originals = Array.from(els).map((e) => e.textContent ?? "");
  let frame = 0;
  const id = window.setInterval(() => {
    frame++;
    if (frame > 12) {
      window.clearInterval(id);
      // restore originals so the disintegrate-up tween reads the right text
      els.forEach((e, i) => {
        e.textContent = originals[i];
      });
      return;
    }
    els.forEach((e) => {
      e.textContent = charset[Math.floor(Math.random() * charset.length)];
    });
  }, 40);
}
