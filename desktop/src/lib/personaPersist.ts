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
import { useSwipeStore } from '@/stores/swipe';
import { VALID_VRM_URLS } from '@/lib/vrmMatcher';

const STORAGE_KEY = 'angel-persona-v1';

/** Fallback if a persisted vrmUrl doesn't match any of the 5 curated
 *  bodies — happens when an older build saved the placeholder URL or
 *  someone hand-edited localStorage. Keep in sync with
 *  Scene.tsx#FALLBACK_VRM. */
const FALLBACK_VRM = '/vrm/cottagecore.vrm';

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

/** Sync hydrate from disk — call before React mounts so App phase init sees persona. */
export function hydratePersonaFromStorageOnce(): void {
  if (typeof window === 'undefined') return;
  if (useAngelStore.getState().persona) return;

  const saved = read();
  if (!saved) return;

  const claim: ClaimTokenPayload = {
    userId: saved.userId,
    vrmId: saved.traits.aesthetic,
    paletteHex: saved.paletteHex,
    name: saved.name,
    traits: saved.traits,
    iat: Math.floor(saved.savedAt / 1000),
    exp: Math.floor(saved.savedAt / 1000) + 60 * 60 * 24 * 365,
  };
  try {
    // accept any vrmUrl that's a known curated body, otherwise rewrite to
    // FALLBACK_VRM. This handles old saves that pointed at the placeholder
    // (`2068967230566994300.vrm`) which is no longer in the picker.
    let sanitized = saved.vrmUrl;
    if (sanitized && !VALID_VRM_URLS.has(sanitized)) {
      console.info('[personaPersist] unknown vrmUrl, falling back', sanitized, '→', FALLBACK_VRM);
      sanitized = FALLBACK_VRM;
      write({ ...saved, vrmUrl: sanitized });
    }
    useAngelStore.getState().applyClaim(claim, sanitized);
  } catch (err) {
    console.warn('[personaPersist] hydrate threw:', err);
  }
}

/** Drop the saved persona — used by the "rediscover" path if we add one. */
export function clearSavedPersona(): void {
  write(null);
  try {
    useSwipeStore.getState().reset();
  } catch {
    /* ignore */
  }
}

/**
 * Full re-onboarding: wipe the saved persona AND the in-memory one AND the
 * swipe deck state. Useful during development/demo rehearsal — bind to a
 * button or call from devtools as `window.__angel.rediscover()`.
 */
export function rediscoverAngel(): void {
  write(null);
  try {
    useAngelStore.setState({ persona: null });
  } catch (err) {
    console.warn('[personaPersist] clear persona threw:', err);
  }
  try {
    useSwipeStore.getState().reset();
  } catch (err) {
    console.warn('[personaPersist] reset swipe store threw:', err);
  }
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
  hydratePersonaFromStorageOnce();

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

  if (typeof window !== 'undefined') {
    const w = window as unknown as { __angel?: Record<string, unknown> };
    w.__angel = {
      ...(w.__angel ?? {}),
      rediscover: rediscoverAngel,
      clearSavedPersona,
      // hop-in helper for clearing the calibration localStorage cache —
      // localStorage takes priority over interactables.default.json, so any
      // bad in-session calibration sticks until cleared.
      clearInteractableOverrides: async () => {
        const m = await import('./interactables');
        m.clearOverrides();
        console.info('[__angel] cleared interactable overrides — reload the window to re-read defaults');
      },
      // monitor pose tuner — persists to localStorage AND broadcasts a
      // change event so the live DeskMonitor picks it up. examples:
      //   window.__angel.tuneMonitor({ depth: 0.5, height: 1.45 })
      //   window.__angel.tuneMonitor({ scale: 0.5 })  // bigger panel
      //   window.__angel.tuneMonitor({ anchorTo: 'desk_workstation' })
      //   window.__angel.resetMonitorPose()           // back to defaults
      tuneMonitor: async (patch: {
        depth?: number;
        height?: number;
        scale?: number;
        anchorTo?: 'desk_chair' | 'desk_workstation';
      }) => {
        const m = await import('./monitorPose');
        const next = m.writeMonitorPose(patch);
        console.info('[__angel] tuneMonitor →', next);
      },
      resetMonitorPose: async () => {
        const m = await import('./monitorPose');
        const next = m.resetMonitorPose();
        console.info('[__angel] resetMonitorPose →', next);
      },
    };
  }

  return unsub;
}
