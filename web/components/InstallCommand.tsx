"use client";

import { useState } from "react";

const CMD = "curl -sSL https://angel.stephenhung.me/install.sh | bash";

/**
 * one-line installer terminal box. click anywhere to copy.
 * the underlying install.sh handles the gatekeeper-quarantine dance so
 * judges don't need to know about `xattr -cr`.
 */
export function InstallCommand() {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(CMD).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="group relative flex w-full max-w-[640px] items-center justify-between gap-4 overflow-hidden rounded-2xl border border-sakura-200 bg-[#1a1118] px-5 py-4 text-left shadow-[0_10px_0_rgba(155,58,95,0.25),0_24px_50px_-15px_rgba(199,78,122,0.4)] transition-all duration-200 hover:-translate-y-0.5 hover:border-sakura-300 hover:shadow-[0_12px_0_rgba(155,58,95,0.3),0_28px_55px_-15px_rgba(199,78,122,0.5)]"
      aria-label="copy install command to clipboard"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden
          className="font-mono text-[14px] text-sakura-300 select-none"
        >
          $
        </span>
        <span className="truncate font-mono text-[13px] text-cloud tablet:text-[14px]">
          {CMD}
        </span>
      </span>
      <span
        className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-1 font-sans text-[12px] font-semibold transition-colors ${
          copied
            ? "bg-sakura-500 text-cloud"
            : "bg-sakura-100 text-sakura-700 group-hover:bg-sakura-200"
        }`}
      >
        {copied ? "copied ♡" : "copy"}
      </span>
    </button>
  );
}
