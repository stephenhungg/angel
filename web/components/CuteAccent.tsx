"use client";

import Image from "next/image";

/**
 * CuteAccent — single absolutely-positioned kawaii sticker accent.
 *
 *   <CuteAccent kind="bow" pos="top-right" size={120} rotate={-12} />
 *
 * Available kinds (lookup keys map to /public/kawaii/cute-*-t.png):
 *   bow · boba · strawberry · cake · blossom · cloud · hearts · moon
 *
 * Floating accents — absolute pos with optional rotate, ignores pointer events.
 */

const ASSETS = {
  bow: "/kawaii/cute-bow.png",
  boba: "/kawaii/cute-boba.png",
  strawberry: "/kawaii/cute-strawberry.png",
  cake: "/kawaii/cute-cake.png",
  blossom: "/kawaii/cute-blossom.png",
  cloud: "/kawaii/cute-cloud.png",
  hearts: "/kawaii/cute-hearts.png",
  moon: "/kawaii/cute-moon.png",
} as const;

type Kind = keyof typeof ASSETS;

type Props = {
  kind: Kind;
  /** css size in px (square) */
  size?: number;
  /** rotation in degrees */
  rotate?: number;
  /** css positioning props */
  top?: string;
  left?: string;
  right?: string;
  bottom?: string;
  /** opacity 0..1 */
  opacity?: number;
  className?: string;
  /** drop-shadow strength */
  shadow?: number;
};

export function CuteAccent({
  kind,
  size = 120,
  rotate = 0,
  top,
  left,
  right,
  bottom,
  opacity = 1,
  className = "",
  shadow = 0.25,
}: Props) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute select-none ${className}`}
      style={{
        top,
        left,
        right,
        bottom,
        width: size,
        height: size,
        transform: `rotate(${rotate}deg)`,
        opacity,
        filter: `drop-shadow(0 8px 0 rgba(155, 58, 95, ${shadow * 0.6})) drop-shadow(0 18px 28px rgba(199, 78, 122, ${shadow * 0.4}))`,
      }}
    >
      <Image
        src={ASSETS[kind]}
        alt=""
        width={size * 2}
        height={size * 2}
        className="h-full w-full object-contain"
      />
    </div>
  );
}
