import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "angel — kawaii AI coworker. discovered, not designed.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const SITE = "https://angel-swipe.vercel.app";

export default async function OGImage() {
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
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#fff5fa",
          position: "relative",
        }}
      >
        {/* RIGHT: cherry-pattern band, ~40% width */}
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            width: "44%",
            backgroundImage: `url(${cherry})`,
            backgroundSize: "260px auto",
            backgroundRepeat: "repeat",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* white sticker card holding the wordmark — pops against cherry bg */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 380,
              height: 380,
              background: "#ffffff",
              borderRadius: 36,
              border: "6px solid #ffffff",
              boxShadow:
                "0 16px 0 rgba(155, 58, 95, 0.35), 0 30px 60px rgba(155, 58, 95, 0.25)",
              transform: "rotate(-4deg)",
            }}
          >
            <img
              src={wordmark}
              width={300}
              height={300}
              alt=""
              style={{ width: 300, height: "auto" }}
            />
          </div>
        </div>

        {/* LEFT: white panel with the copy */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            width: "60%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "64px 56px 64px 76px",
            background:
              "linear-gradient(90deg, #ffffff 0%, #ffffff 70%, rgba(255,255,255,0) 100%)",
          }}
        >
          {/* top kicker */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              fontSize: 22,
              color: "#7a3e58",
              fontWeight: 500,
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

          {/* big tagline */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 76,
                lineHeight: 0.98,
                letterSpacing: "-0.03em",
                color: "#0a0507",
                fontWeight: 800,
              }}
            >
              she sits at the desk
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 76,
                lineHeight: 0.98,
                letterSpacing: "-0.03em",
                color: "#ff4f8b",
                fontWeight: 800,
              }}
            >
              with you.
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 14,
                fontSize: 28,
                lineHeight: 1.3,
                color: "#5e2640",
                maxWidth: 520,
              }}
            >
              a kawaii desktop coworker. discovered, not prompted. one of millions of versions of her.
            </div>
          </div>

          {/* bottom: url + cta pill */}
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
                background: "#ff4f8b",
                color: "#ffffff",
                padding: "12px 24px",
                borderRadius: 999,
                fontWeight: 600,
                boxShadow: "0 6px 0 rgba(155, 58, 95, 0.35)",
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
