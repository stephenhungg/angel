# BUILD_DESKTOP.md — packaging the Electron app

How to turn `desktop/` into a downloadable `.dmg` for users.

## prerequisites

- macOS Apple Silicon (arm64) — current pipeline only cross-builds *to* arm64,
  not from x64
- [bun](https://bun.sh) installed
- gh CLI authenticated against `stephenhungg/angel` (`gh auth status`)
- a writable Electron cache. If `~/Library/Caches/electron` is owned by `root`
  (legacy installs), point electron-builder at a different directory:
  ```bash
  export ELECTRON_CACHE=/tmp/angel-build-cache/electron
  export ELECTRON_BUILDER_CACHE=/tmp/angel-build-cache/electron-builder
  mkdir -p "$ELECTRON_CACHE" "$ELECTRON_BUILDER_CACHE"
  ```

## one-shot build

```bash
cd desktop
bun run package
```

This runs:
1. `prepackage` → `bun run build` (electron-vite builds main, preload, renderer
   into `dist-electron/`)
2. `electron-builder --mac --arm64` → produces the `.dmg`

Output: `desktop/dist-release/Angel-<version>-arm64.dmg` (~340 MB).

The unpackaged `.app` lands at `desktop/dist-release/mac-arm64/Angel.app` if you
want to inspect or smoke-test it first.

## what gets packaged

`extraResources` in `desktop/package.json` controls what ships outside the
asar. Currently:

| from                                           | to (in `Angel.app/Contents/Resources/`) |
| ---------------------------------------------- | --------------------------------------- |
| `desktop/public/**` (vrm, animations, room.glb, library) | `Resources/public/**`                   |
| `desktop/electron/data/**`                     | `Resources/electron/data/**`            |
| `desktop/electron/agent/personality_synthesis.prompt.md` | `Resources/electron/agent/personality_synthesis.prompt.md` |
| `desktop/electron/agent/personality_examples/**` | `Resources/electron/agent/personality_examples/**` |

The renderer's static assets (`/vrm/...`, `/library/...`, etc.) come through
the standard Vite publicDir copy, so they're inside `dist-electron/renderer/`
and resolve against `loadFile('renderer/index.html')` automatically.

The library JSON, personality prompt, and personality fallbacks are loaded by
`electron/swipe-ipc.ts` and `electron/agent/onboarding.ts` from a candidate
list that includes `process.resourcesPath` — so they're found in production.

## icon

Generated from `web/public/kawaii/agency-pink.png` via:

```bash
cd desktop/build
ICON_SRC=../../web/public/kawaii/agency-pink.png
mkdir icon.iconset
sips -z 16 16     "$ICON_SRC" --out icon.iconset/icon_16x16.png
sips -z 32 32     "$ICON_SRC" --out icon.iconset/icon_16x16@2x.png
# ... (16 → 1024 sizes, see git history)
sips -z 1024 1024 "$ICON_SRC" --out icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset -o icon.icns
```

The `.icns` is checked into `desktop/build/icon.icns` so contributors don't
need to regenerate.

## publishing to GitHub Releases

```bash
# from monorepo root
gh release create v0.0.1-alpha \
  --title "Angel v0.0.1-alpha" \
  --notes "First downloadable build. macOS arm64. Unsigned." \
  desktop/dist-release/Angel-0.0.1-arm64.dmg
```

The direct download URL for that asset is deterministic:

```
https://github.com/stephenhungg/angel/releases/download/v0.0.1-alpha/Angel-0.0.1-arm64.dmg
```

Both `web/app/download/page.tsx` and `web/app/reveal/page.tsx` link to that URL.
**When you cut a new version, update the `MAC_DMG_URL` constant in
`web/app/download/page.tsx` and the `href` in the reveal page download
fallback.**

## llm transport — convex proxy mode (v0.0.2+)

The bundled `.dmg` ships with **zero anthropic credentials**. Instead, the
electron orchestrator routes every Claude call through a convex action
(`convex/llm/proxy.ts → callClaude`) which runs on the production convex
deployment (which has `ANTHROPIC_API_KEY` set as an env var, same one used
by the SMS + Discord orchestrators). End-users never need an Anthropic key.
Cost is borne by Stephen's Anthropic account via the convex deployment.

### dual-mode switch (in `desktop/electron/agent/runner.ts`)

The runner picks transport at runtime:

| environment                                | mode     | transport                                  |
| ------------------------------------------ | -------- | ------------------------------------------ |
| `ANTHROPIC_API_KEY` set                    | `direct` | direct anthropic SDK (fastest — dev path)  |
| no key, but `CONVEX_URL` set               | `convex` | proxied via `api.llm.proxy.callClaude`     |
| neither                                    | `none`   | falls back to mock orchestrator            |

Stephen's dev machine has `ANTHROPIC_API_KEY` in `desktop/.env.local`, so
the direct path keeps working unchanged. The packaged `.dmg` does *not*
ship that env var — it only ships `CONVEX_URL`, which defaults to:

```
CONVEX_URL=https://necessary-leopard-395.convex.site
```

Set this in the production env (either `desktop/.env.production` baked at
build time, or via `process.env.CONVEX_URL` already wired in main.ts).

### gotchas

- **Tool-use loops are N round-trips.** Each turn of the orchestrator's
  tool-use loop becomes one `callClaude` action call. Each adds ~50–150ms
  vs direct anthropic. Fine for the embodied loop (avatar latency
  dominates). Streaming is **not** proxied for v0.0.2 — actions return
  once. If/when we want streamed token-by-token output we need a separate
  websocket or http-stream relay.
- **Verifier (haiku_review) uses the same dual-mode.** See
  `desktop/electron/agent/tools/verifier.ts → checkHaikuReview`. Same
  fallback ladder: direct → convex → heuristic.
- **SMS / Discord / web-side `/api/synthesize-personality` are unaffected.**
  They already run server-side and have their own anthropic key access.
- **Errors fall through to mock.** If the convex action throws (e.g.
  network blip, key missing on convex), `runOrchestrator` catches it and
  drops to `runMockOrchestrator` — the desktop never hard-breaks.

## install flow (for end users)

1. Download `Angel-X.X.X-arm64.dmg`
2. Open the .dmg, drag `Angel.app` → `Applications`
3. First launch: right-click `Angel.app` → **Open** (Gatekeeper warning is
   expected — the app is unsigned)
4. Alternative: `xattr -cr /Applications/Angel.app` to clear the quarantine
   attribute so a normal double-click works
5. Visit `https://angel-swipe.vercel.app/swipe`, swipe, click **let her in**
   → browser hands the `angel://claim?token=...` URL to the installed app

## known issues / gotchas

- **Unsigned**: no Apple Developer cert, so first launch shows a Gatekeeper
  warning. Code signing is intentionally disabled (`identity: null`).
- **arm64 only**: Intel Macs and Windows are not yet built. Adding them is a
  matter of extending the `target` array in `desktop/package.json` and running
  on a machine that can produce those binaries.
- **Cache permissions**: the system electron cache may be `root`-owned from a
  prior install. Use the env vars above to redirect to `/tmp/angel-build-cache`.
- **asar**: enabled. If a future native module (`.node`) breaks at runtime,
  add `"asarUnpack": ["**/*.node"]` to the `build` config.
- **Three.js / VRM assets**: served as static files from the renderer bundle,
  not via Node imports — asar doesn't affect them.
- **`process.cwd()`**: in a packaged app, cwd is `/`. Code that reads files
  must use `app.getAppPath()`, `__dirname` (resolves into the asar), or
  `process.resourcesPath` (resolves to `Contents/Resources/`). The path-
  resolution helpers in `swipe-ipc.ts` and `agent/onboarding.ts` already
  iterate through all three.

## smoke test

```bash
# launch the unpackaged build
open desktop/dist-release/mac-arm64/Angel.app
# or run directly to see stdout/stderr
desktop/dist-release/mac-arm64/Angel.app/Contents/MacOS/Angel
```

You should see the kawaii onboarding (swipe deck) since no persona is in
storage. Quit, then test the deep-link claim flow by visiting
`https://angel-swipe.vercel.app`, swiping, and clicking **let her in**.
