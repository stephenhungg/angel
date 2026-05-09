# @angel/web — landing + swipe onboarding

> next.js 15 + tailwind. **deployed to vercel = the submission url.** owner: stephen.

## what lives here

- landing page (chunky cartoon font, miside-coded)
- swipe onboarding: 3 rounds × 4 archetypes
- clip embeddings + weighted centroid + pca → 768d persona vector
- voice cluster assignment
- writes `users` row to convex
- generates JWT claim token, redirects to `angel://claim?token=...`

## scripts

```bash
bun run dev          # localhost:3000
bun run build        # production build
bun run typecheck    # tsc --noEmit
```

## structure

```
web/
├── src/app/                 # next.js app router pages
├── src/components/          # swipe ui, archetype card, vector visualizer
├── src/lib/                 # clip embeddings, pca, claim token gen
└── public/archetypes/       # archetype reference images
```

## env

needs `.env.local` with:
- `NEXT_PUBLIC_CONVEX_URL`
- `OPENAI_API_KEY` (for clip embeddings)
- `JWT_SECRET` (must match desktop)

see root `.env.example`.

## deploy

```bash
vercel --prod
# OR — first 200 ppl get $30 credit with code NOZOMIO-V0 on v0
```

## handoff to desktop

after final swipe → POST to `/api/claim` → returns deep link → `window.location = 'angel://claim?token=xxx'`

protocol handler logic lives in `desktop/electron/persona/claim.ts`.
