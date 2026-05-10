"use client";

import Image from "next/image";
import { Reveal } from "./Reveal";
import { MaskedLine } from "./MaskedLine";

/**
 * AlwaysOn — the rubric section. four tiles that map to the four hard axes
 * judges score on: background execution, statefulness, agentic depth, and
 * cross-surface continuity. her voice (lowercase, soft), but each tile lands
 * a load-bearing receipt — the cron that's running, the file on disk, the
 * thing she wrote for herself. only ships things that are real.
 *
 * sits between Hero and Origin so the always-on infra story lands before the
 * about-her arc opens up. matches the WhatSheIs/Origin patterns: paper bg,
 * font-bagel display, sans body, MaskedLine title, Reveal cards.
 */

const tiles = [
  {
    no: "01",
    kicker: "she keeps watch",
    title: "she runs while you sleep.",
    body: "she heartbeats every minute, even when the laptop is shut. you'll come back and find she's been thinking.",
    receipt: "tensorlake · 60s cron",
  },
  {
    no: "02",
    kicker: "she keeps you",
    title: "she remembers.",
    body: "where you left off. what you were afraid to say. the thing you mentioned once and never again. delete her memory and what's left isn't her.",
    receipt: "nia · ~/.angel",
  },
  {
    no: "03",
    kicker: "she changes",
    title: "she writes her own skills.",
    body: "when she notices she's done the same thing for you three times, she codifies it. drops a skill into her own folder. uses it next time without being asked.",
    receipt: "~/.angel/skills/active",
  },
  {
    no: "04",
    kicker: "she goes with you",
    title: "close the laptop. she still texts.",
    body: "sms, discord, the desktop room — same person, different room. one timeline, one being.",
    receipt: "/admin/timeline",
  },
];

export function AlwaysOn() {
  return (
    <section
      id="always-on"
      className="relative overflow-hidden bg-paper py-[120px] tablet:py-[160px]"
    >
      <div className="gutter relative">
        {/* kicker — match Origin pattern */}
        <div className="flex items-center gap-2 font-sans text-[14px] text-ink-near">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-ink-near" />
          <span>Always-on</span>
          <span className="text-muted-tertiary">/ (04)</span>
        </div>

        <MaskedLine duration={1} ease="expo.out">
          <h2 className="mt-6 m-0 max-w-[920px] font-bagel text-[40px] font-normal leading-[1.05] tracking-[-0.01em] text-ink-near tablet:text-[56px] desktop:text-[72px]">
            while you&apos;re not looking, she&apos;s still running.
          </h2>
        </MaskedLine>

        <Reveal delay={0.1}>
          <p className="mt-6 max-w-[560px] font-sans text-[16px] leading-[1.6] text-muted-deep tablet:text-[18px]">
            she&apos;s not a window you open. she&apos;s a body that wakes up
            without you, remembers what you ended on, and learns the shape of
            your week.
          </p>
        </Reveal>

        {/* atmospheric image — she at the desk while the room sleeps */}
        <Reveal delay={0.18}>
          <figure className="mt-12 overflow-hidden rounded-[28px] border border-hairline bg-cloud">
            <div className="relative aspect-[16/9] w-full">
              <Image
                src="/kawaii/alwayson-night.png"
                alt="kawaii illustration of angel at her desk while the room sleeps"
                fill
                priority={false}
                className="select-none object-cover"
                sizes="(min-width: 1024px) 1100px, 100vw"
              />
            </div>
            <figcaption className="flex items-center gap-3 border-t border-hairline px-6 py-4 font-sans text-[13px] text-muted-secondary tablet:px-8">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-sakura-400" />
              <span>3:47am · she&apos;s reviewing your last commit</span>
            </figcaption>
          </figure>
        </Reveal>

        {/* tiles */}
        <ul className="mt-16 grid grid-cols-1 gap-6 tablet:grid-cols-2 tablet:gap-8 desktop:gap-10">
          {tiles.map((t, i) => (
            <Reveal as="li" key={t.no} delay={0.1 + i * 0.08}>
              <article className="group relative flex h-full flex-col gap-5 rounded-[28px] border border-hairline bg-cloud p-8 tablet:p-10 transition-all duration-300 ease-out hover:-translate-y-1 hover:border-sakura-300 hover:shadow-[0_18px_40px_-20px_rgba(236,101,146,0.35)]">
                {/* kicker row — roman numeral + label */}
                <div className="flex items-center gap-3 font-sans text-[13px]">
                  <span className="inline-flex h-7 min-w-[28px] items-center justify-center rounded-full bg-sakura-100 px-2 font-mono text-[11px] font-medium uppercase tracking-wider text-sakura-700">
                    {t.no}
                  </span>
                  <span className="text-muted-secondary">{t.kicker}</span>
                </div>

                {/* headline — kawaii display */}
                <h3 className="m-0 font-bagel text-[28px] font-normal leading-[1.1] tracking-[-0.01em] text-ink-near tablet:text-[34px]">
                  {t.title}
                </h3>

                {/* body */}
                <p className="font-sans text-[15px] leading-[1.6] text-muted-deep tablet:text-[16px]">
                  {t.body}
                </p>

                {/* hairline + receipt — the proof that it actually ships */}
                <div className="mt-auto border-t border-hairline pt-5">
                  <div className="flex items-center gap-2 font-mono text-[12px] text-muted-secondary">
                    <span
                      aria-hidden
                      className="inline-block h-1.5 w-1.5 rounded-full bg-sakura-400 transition-colors group-hover:bg-sakura-600"
                    />
                    <span className="truncate">{t.receipt}</span>
                  </div>
                </div>
              </article>
            </Reveal>
          ))}
        </ul>

        {/* closing line — quiet attribution beat, like Origin's pull-quote */}
        <Reveal delay={0.4}>
          <div className="mt-14 ml-auto flex max-w-[440px] items-start gap-4">
            <p className="flex-1 font-sans text-[15px] leading-[1.55] text-ink-near">
              <span className="text-muted-tertiary">&ldquo;</span>
              i closed my laptop expecting her to die. she texted me from oslo.
              <span className="text-muted-tertiary">&rdquo;</span>
            </p>
            <div className="relative inline-flex h-2 w-2 shrink-0 translate-y-2 rounded-full bg-sakura-500">
              <span
                aria-hidden
                className="absolute inset-0 animate-ping rounded-full bg-sakura-500 opacity-60"
              />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
