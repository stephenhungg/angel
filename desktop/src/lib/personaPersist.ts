/**
 * personaPersist.ts — survive a launch. Once the user commits a persona at
 * the end of the swipe + reveal flow, we cache it in localStorage so the
 * next app open lands them straight in the room with their angel intact —
 * no re-swiping the discovery flow every time.
 *
 * The persona slice on useAngelStore lives in-memory by default; this module
 * is the only thing that touches storage. Idempotent — `setupPersonaPersist`
 * can be called once at App-level and it'll boot the cache + subscribe to
 * future commits.
 *
 * Storage key: `angel-persona-v1`. Bumping the version invalidates old
 * payloads if the contract changes incompatibly.
 */

import type { ClaimTokenPayload, PersonaTraits } from '@angel/shared';
import { useAngelStore } from '@/stores/angel';
import { useSwipeStore } from './swipeStore';

const STORAGE_KEY = 'angel-persona-v1';

interface SavedPersona {
  userId: string;
  name: string;
  paletteHex: string;
  traits: PersonaTraits;
  vrmUrl?: string;
  savedAt: number;
}

function read(): SavedPersona | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedPersona;
    if (!parsed?.userId || !parsed?.traits) return null;
    return parsed;
  } catch {
    return null;
  }
}

function write(p: SavedPersona | null): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (p) localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* quota etc. — non-fatal */
  }
}

/** Drop the saved persona — used by the "rediscover" path if we add one. */
export function clearSavedPersona(): void {
  write(null);
  // also reset onboarding phase back to title so the user lands on the
  // discover screen on next refresh
  try {
    useSwipeStore.getState().setPhase('title');
  } catch {
    /* ignore */
  }
}

/**
 * Full re-onboarding: wipe the saved persona AND the in-memory one AND the
 * swipe deck state. App.tsx's `if (!persona)` gate flips and the title
 * screen mounts. Useful during development/demo rehearsal — bind to a button
 * or call from devtools as `window.__angel.rediscover()`.
 */
export function rediscoverAngel(): void {
  // 1. clear localStorage
  write(null);
  // 2. clear the in-memory persona slice → App.tsx unmounts the room
  try {
    useAngelStore.setState({ persona: null });
  } catch (err) {
    console.warn('[personaPersist] clear persona threw:', err);
  }
  // 3. reset the swipe store: fresh session, empty history, phase=title
  try {
    const swipe = useSwipeStore.getState();
    swipe.reset();
    swipe.setPhase('title');
  } catch (err) {
    console.warn('[personaPersist] reset swipe store threw:', err);
  }
  // 4. release pointer lock so the user can interact with the title screen
  if (typeof document !== 'undefined' && document.pointerLockElement) {
    try {
      document.exitPointerLock();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Boot-time: if a persona is on disk, hydrate the angel store with it via
 * applyClaim (same path as a fresh JWT delivery). Then subscribe to future
 * persona changes so any new commit lands in storage too.
 */
export function setupPersonaPersist(): () => void {
  // 1. hydrate from storage
  const saved = read();
  if (saved) {
    const claim: ClaimTokenPayload = {
      userId: saved.userId,
      vrmId: saved.traits.aesthetic, // matches what Reveal builds
      paletteHex: saved.paletteHex,
      name: saved.name,
      traits: saved.traits,
      iat: Math.floor(saved.savedAt / 1000),
      exp: Math.floor(saved.savedAt / 1000) + 60 * 60 * 24 * 365, // 1y — local cache
    };
    try {
      useAngelStore.getState().applyClaim(claim, saved.vrmUrl);
      // mark onboarding done so any logic gated on phase agrees with persona
      useSwipeStore.getState().setPhase('done');
    } catch (err) {
      console.warn('[personaPersist] hydrate threw:', err);
    }
  }

  // 2. subscribe to future commits
  const unsub = useAngelStore.subscribe(
    (s) => s.persona,
    (p) => {
      if (!p) return;
      const payload: SavedPersona = {
        userId: p.userId,
        name: p.name,
        paletteHex: p.paletteHex,
        traits: p.traits,
        vrmUrl: p.vrmUrl,
        savedAt: Date.now(),
      };
      write(payload);
    },
  );

  // 3. expose dev helpers on window so you can fire rediscover from devtools
  if (typeof window !== 'undefined') {
    const w = window as unknown as { __angel?: Record<string, unknown> };
    w.__angel = {
      ...(w.__angel ?? {}),
      rediscover: rediscoverAngel,
      clearSavedPersona,
    };
  }

  return unsub;
}
