/**
 * monitorPose.ts — persistent storage + change broadcast for the desk
 * monitor's pose (depth, height, scale, anchor). The K-window calibration
 * panel writes to this; DeskMonitor reads + listens for change events.
 *
 * Storage key: `angel:monitor-pose:v1`. Bumping the version invalidates old
 * payloads on a contract change.
 */

const STORAGE_KEY = 'angel:monitor-pose:v1';

export type MonitorAnchor = 'desk_chair' | 'desk_workstation';

export interface MonitorPose {
  /** distance in metres forward of the seat to the screen centre */
  depth: number;
  /** screen-center y in world units (≈ seated eye level when at default 1.4) */
  height: number;
  /** uniform scale on the html-plane group; controls panel size in world */
  scale: number;
  /** which interactable the monitor anchors to */
  anchorTo: MonitorAnchor;
}

export const DEFAULT_MONITOR_POSE: MonitorPose = {
  depth: 0.6,
  height: 1.4,
  scale: 0.36,
  anchorTo: 'desk_chair',
};

export const MONITOR_POSE_EVENT = 'angel:monitor-tune';

export function readMonitorPose(): MonitorPose {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_MONITOR_POSE };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_MONITOR_POSE };
    const parsed = JSON.parse(raw) as Partial<MonitorPose>;
    return { ...DEFAULT_MONITOR_POSE, ...parsed };
  } catch {
    return { ...DEFAULT_MONITOR_POSE };
  }
}

/** Merge a partial pose patch into storage and broadcast a change event so
 *  the live DeskMonitor picks it up without a reload. */
export function writeMonitorPose(patch: Partial<MonitorPose>): MonitorPose {
  const next = { ...readMonitorPose(), ...patch };
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* quota etc. — non-fatal */
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(MONITOR_POSE_EVENT, { detail: next }));
  }
  return next;
}

export function resetMonitorPose(): MonitorPose {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(MONITOR_POSE_EVENT, { detail: DEFAULT_MONITOR_POSE }));
  }
  return { ...DEFAULT_MONITOR_POSE };
}
