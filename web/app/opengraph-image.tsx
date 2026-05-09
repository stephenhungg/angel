import { ImageResponse } from "next/og";

// next.js conventional file: served at /opengraph-image.png and auto-wires
// og:image / og:image:width / og:image:height in <head>. rebuilt per deploy,
// cached by vercel CDN.

export const runtime = "edge";
export const alt = "angel — kawaii AI coworker. discovered, not designed.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const SITE = "https://angel-swipe.vercel.app";

export default async function OGImage() {
  // load assets from our own deploy as base64 so they inline into the SVG
  // that ImageResponse renders (no external fetches at view time)
  const [wordmarkBuf, cherryBuf] = await Promise.all([
    fetch(`${SITE}/kawaii/wordmark-pink-nano.png`).then((r) => r.arrayBuffer()),
    fetch(`${SITE}/kawaii/cherry-pattern.png`).then((r) => r.arrayBuffer()),
  ]);
  const wordmark = `data:image/png;base64,${Buffer.from(wordmarkBuf).toString("base64")}`;
  const cherry = `data:image/png;base64,${Buffer.from(cherryBuf).toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "space-between",
          padding: "64px 76px",
          backgroundImage: `url(${cherry})`,
          backgroundSize: "440px auto",
          backgroundRepeat: "repeat",
          color: "#0a0507",
          position: "relative",
        }}
      >
        {/* soft white wash so text reads cleanly over the cherry pattern */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse at 25% 35%, rgba(255,255,255,0.85) 0%, rgba(255,245,250,0.55) 45%, rgba(255,235,245,0.65) 100%)",
            display: "flex",
          }}
        />

        {/* top kicker */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: 22,
            color: "#7a3e58",
            fontWeight: 500,
            zIndex: 2,
          }}
        >
          <span
            style={{
              display: "flex",
              width: 12,
              height: 12,
              borderRadius: 999,
              background: "#ff85a8",
            }}
          />
          <span>angel · 天使 · discovered, not designed</span>
        </div>

        {/* center: wordmark sticker (already in bagel typography) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            zIndex: 2,
          }}
        >
          <img
            src={wordmark}
            width={520}
            height={520}
            alt=""
            style={{
              width: 520,
              height: "auto",
              filter: "drop-shadow(0 12px 0 rgba(155, 58, 95, 0.35))",
            }}
          />
        </div>

        {/* bottom: tagline + url + cta pill */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 22,
            zIndex: 2,
            maxWidth: 1000,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 52,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              color: "#5e2640",
              fontWeight: 700,
            }}
          >
            she sits at the desk with you. you don&apos;t feel alone.
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 22,
              color: "#9b3a5f",
            }}
          >
            <span style={{ fontWeight: 500 }}>angel-swipe.vercel.app</span>
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: "#ff85a8",
                color: "#ffffff",
                padding: "12px 24px",
                borderRadius: 999,
                fontWeight: 600,
              }}
            >
              download angel ↓
            </span>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
