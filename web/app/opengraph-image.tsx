import { ImageResponse } from "next/og";

// next.js conventional file: served at /opengraph-image
// rebuilds on every deploy, cached by vercel CDN.
// also auto-wires the og:image / og:image:width / og:image:height meta tags.

export const runtime = "edge";
export const alt = "angel — kawaii AI coworker. discovered, not designed.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const SITE = "https://angel-swipe.vercel.app";

export default async function OGImage() {
  // load Bagel Fat One from google fonts — next/og needs the raw font buffer
  const bagel = await fetch(
    "https://fonts.gstatic.com/s/bagelfatone/v3/hYkPPucsQOr5dy02WmQr5Zkd0DA.woff",
  ).then((r) => r.arrayBuffer());

  // load the kawaii wordmark sticker from our own deploy
  const wordmarkData = await fetch(`${SITE}/kawaii/wordmark-pink-nano.png`).then((r) =>
    r.arrayBuffer(),
  );
  const wordmarkB64 = Buffer.from(wordmarkData).toString("base64");
  const wordmark = `data:image/png;base64,${wordmarkB64}`;

  const cherryData = await fetch(`${SITE}/kawaii/cherry-pattern.png`).then((r) =>
    r.arrayBuffer(),
  );
  const cherryB64 = Buffer.from(cherryData).toString("base64");
  const cherry = `data:image/png;base64,${cherryB64}`;

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
          padding: "72px 80px",
          fontFamily: '"Bagel"',
          backgroundImage: `url(${cherry})`,
          backgroundSize: "440px auto",
          backgroundRepeat: "repeat",
          color: "#0a0507",
        }}
      >
        {/* soft white wash so text reads cleanly over the pattern */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse at 25% 35%, rgba(255,255,255,0.85) 0%, rgba(255,245,250,0.55) 45%, rgba(255,235,245,0.65) 100%)",
            display: "flex",
          }}
        />

        {/* top: small kicker label */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontFamily: "sans-serif",
            fontSize: 22,
            color: "#7a3e58",
            zIndex: 2,
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: 12,
              height: 12,
              borderRadius: 999,
              background: "#ff85a8",
            }}
          />
          <span>angel · 天使 · discovered, not designed</span>
        </div>

        {/* middle: wordmark + tagline */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 28,
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

        {/* bottom: tagline (bagel) + url */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 18,
            zIndex: 2,
            maxWidth: 920,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 56,
              lineHeight: 1.05,
              letterSpacing: "-0.01em",
              color: "#5e2640",
            }}
          >
            she sits at the desk with you. you don&apos;t feel alone.
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontFamily: "sans-serif",
              fontSize: 22,
              color: "#9b3a5f",
            }}
          >
            <span>angel-swipe.vercel.app</span>
            <span
              style={{
                display: "inline-flex",
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
    {
      ...size,
      fonts: [
        {
          name: "Bagel",
          data: bagel,
          style: "normal",
          weight: 400,
        },
      ],
    },
  );
}
