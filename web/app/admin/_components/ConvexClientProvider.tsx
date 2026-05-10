'use client';

/**
 * ConvexClientProvider — wraps the /admin subtree so child components can
 * use `useQuery(api.observability.recentSwipes, ...)` and friends.
 *
 * if NEXT_PUBLIC_CONVEX_URL is unset (e.g. local dev without convex), we
 * skip the provider entirely. children that try to call useQuery will
 * gracefully receive `undefined` (which admin-live.ts treats as "fallback
 * to simulator").
 *
 * we render the provider as a no-op fragment when unconfigured rather than
 * throwing — the simulator path keeps /admin demoable offline.
 */

import { ReactNode, useState } from 'react';
import { ConvexProvider, ConvexReactClient } from 'convex/react';

// fall back to the public prod deployment when NEXT_PUBLIC_CONVEX_URL isn't
// set (common on vercel previews + local dev). these admin pages call
// useQuery — without a ConvexProvider ancestor that throws hard. the prod
// convex deployment URL is public anyway (it's already wired into desktop
// settings + visible in network requests), so hardcoding the fallback is
// safe.
const PROD_CONVEX_URL = 'https://necessary-leopard-395.convex.cloud';
const URL = process.env.NEXT_PUBLIC_CONVEX_URL ?? PROD_CONVEX_URL;

// convex/react bundles @types/react@18 which is incompatible at the
// type level with the web app's React 19 install (ReactNode shape diff).
// runtime is fine — we cast the provider to a compatible component type.
const TypedConvexProvider = ConvexProvider as unknown as React.ComponentType<{
  client: ConvexReactClient;
  children: ReactNode;
}>;

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new ConvexReactClient(URL));
  return <TypedConvexProvider client={client}>{children}</TypedConvexProvider>;
}
