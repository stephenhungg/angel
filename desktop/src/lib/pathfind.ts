/**
 * Occupancy-grid pathfinder.
 *
 * One bake per room load → a 2D walkability grid over the room's xz extents
 * sampled at fixed cell size (5cm by default). Run A* over the grid for
 * every walk, then smooth the path with Bresenham line-of-sight so we
 * don't get a staircase of micro-waypoints.
 *
 * The grid is sampled against the WALL collider layer only — furniture is
 * handled by the avatar's runtime collision policy (see colliders.ts), so
 * the pathfinder never tries to route around chairs/desks. This keeps the
 * grid clean and the routes natural.
 */
import * as THREE from 'three';
import { isPositionClear } from './collision';

export type Grid = {
  /** lower-left corner of the grid in world coords (xz). */
  origin: { x: number; z: number };
  cellSize: number;
  width: number; // cells along x
  height: number; // cells along z
  walkable: Uint8Array; // 1 = walkable, 0 = blocked
  /** sampled feet height — used to keep ray origins consistent. */
  feetY: number;
  /** capsule radius the bake was sampled with. Re-baking is required if
   *  the avatar's radius changes significantly. */
  radius: number;
};

export type BakeOptions = {
  cellSize?: number;
  /** capsule radius for the clearance test. */
  radius?: number;
  /** xz bbox to sample. If omitted we compute it from the colliders. */
  bounds?: THREE.Box3;
  /** padding around the bounds so we have margin at room edges. */
  padding?: number;
  /** sample heights for the clearance test. */
  sampleYs?: readonly number[];
};

/** Bake a walkability grid by sweeping the room's xz extent and testing
 *  each cell against the WALL colliders. Sub-millisecond per ~10x10 room. */
export function bakeOccupancyGrid(
  walls: THREE.Object3D[],
  opts: BakeOptions = {},
): Grid {
  const cellSize = opts.cellSize ?? 0.05;
  const radius = opts.radius ?? 0.25;
  const padding = opts.padding ?? 0.5;

  // determine the world-space extents to sample
  let bbox = opts.bounds;
  if (!bbox) {
    bbox = new THREE.Box3();
    for (const w of walls) bbox.expandByObject(w);
  }
  // give ourselves a little headroom outside the strict bounds so we
  // never round a goal cell off the grid.
  bbox = bbox.clone().expandByScalar(padding);

  const origin = { x: bbox.min.x, z: bbox.min.z };
  const width = Math.max(2, Math.ceil((bbox.max.x - bbox.min.x) / cellSize));
  const height = Math.max(2, Math.ceil((bbox.max.z - bbox.min.z) / cellSize));
  const walkable = new Uint8Array(width * height);
  const feetY = bbox.min.y; // feet are at the bottom of the room bbox

  const probe = new THREE.Vector3();
  let walk = 0;
  for (let cz = 0; cz < height; cz++) {
    for (let cx = 0; cx < width; cx++) {
      probe.set(origin.x + cx * cellSize + cellSize / 2, feetY, origin.z + cz * cellSize + cellSize / 2);
      const clear = walls.length === 0 || isPositionClear(probe, radius, walls);
      walkable[cz * width + cx] = clear ? 1 : 0;
      if (clear) walk += 1;
    }
  }
  console.info('[pathfind] baked grid', {
    cells: width * height,
    walkable: walk,
    cellSize,
    width,
    height,
  });
  return { origin, cellSize, width, height, walkable, feetY, radius };
}

/** Convert a world-space xz to grid-cell coords (clamped to bounds). */
export function worldToCell(grid: Grid, x: number, z: number): { cx: number; cz: number } {
  const cx = Math.max(0, Math.min(grid.width - 1, Math.floor((x - grid.origin.x) / grid.cellSize)));
  const cz = Math.max(0, Math.min(grid.height - 1, Math.floor((z - grid.origin.z) / grid.cellSize)));
  return { cx, cz };
}

export function cellToWorld(grid: Grid, cx: number, cz: number): { x: number; z: number } {
  return {
    x: grid.origin.x + cx * grid.cellSize + grid.cellSize / 2,
    z: grid.origin.z + cz * grid.cellSize + grid.cellSize / 2,
  };
}

function isWalkable(grid: Grid, cx: number, cz: number): boolean {
  if (cx < 0 || cz < 0 || cx >= grid.width || cz >= grid.height) return false;
  return grid.walkable[cz * grid.width + cx] === 1;
}

/** Find the nearest walkable cell to (cx, cz) by spiraling outward. Used
 *  when the requested goal lands inside a wall (which happens when the
 *  user calibrates an approach right at the edge of a wall). */
function nearestWalkable(grid: Grid, cx: number, cz: number, maxRadius = 30): { cx: number; cz: number } | null {
  if (isWalkable(grid, cx, cz)) return { cx, cz };
  for (let r = 1; r <= maxRadius; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue; // ring only
        if (isWalkable(grid, cx + dx, cz + dz)) return { cx: cx + dx, cz: cz + dz };
      }
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* A*                                                                         */
/* -------------------------------------------------------------------------- */

const NEIGHBORS_8 = [
  [-1, 0, 1.0],
  [1, 0, 1.0],
  [0, -1, 1.0],
  [0, 1, 1.0],
  [-1, -1, Math.SQRT2],
  [1, 1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
] as const;

/** Min-heap on f-score. Open list for A*. Custom impl avoids the npm tax. */
class MinHeap {
  private heap: Array<{ idx: number; f: number }> = [];
  push(idx: number, f: number) {
    this.heap.push({ idx, f });
    this.siftUp(this.heap.length - 1);
  }
  pop(): { idx: number; f: number } | null {
    if (this.heap.length === 0) return null;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.siftDown(0);
    }
    return top;
  }
  size(): number {
    return this.heap.length;
  }
  private siftUp(i: number) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.heap[p].f <= this.heap[i].f) break;
      [this.heap[p], this.heap[i]] = [this.heap[i], this.heap[p]];
      i = p;
    }
  }
  private siftDown(i: number) {
    const n = this.heap.length;
    while (true) {
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      let m = i;
      if (l < n && this.heap[l].f < this.heap[m].f) m = l;
      if (r < n && this.heap[r].f < this.heap[m].f) m = r;
      if (m === i) break;
      [this.heap[m], this.heap[i]] = [this.heap[i], this.heap[m]];
      i = m;
    }
  }
}

/** Octile heuristic — admissible for 8-connected grids. */
function octile(dx: number, dz: number): number {
  const a = Math.abs(dx);
  const b = Math.abs(dz);
  return Math.max(a, b) + (Math.SQRT2 - 1) * Math.min(a, b);
}

/** Run A* and return a path of world (x,z) waypoints, or null if unreachable.
 *  The path is smoothed with line-of-sight before being returned. */
export function aStar(
  grid: Grid,
  start: { x: number; z: number },
  goal: { x: number; z: number },
): Array<{ x: number; z: number }> | null {
  const sCell = worldToCell(grid, start.x, start.z);
  const gCellRaw = worldToCell(grid, goal.x, goal.z);

  // if either endpoint is in a wall, snap to the nearest walkable cell.
  const gCell = isWalkable(grid, gCellRaw.cx, gCellRaw.cz)
    ? gCellRaw
    : nearestWalkable(grid, gCellRaw.cx, gCellRaw.cz);
  if (!gCell) return null;
  const sStart = isWalkable(grid, sCell.cx, sCell.cz)
    ? sCell
    : (nearestWalkable(grid, sCell.cx, sCell.cz) ?? sCell);

  const idx = (cx: number, cz: number) => cz * grid.width + cx;
  const cellCount = grid.width * grid.height;

  const gScore = new Float64Array(cellCount).fill(Infinity);
  const cameFrom = new Int32Array(cellCount).fill(-1);
  const startIdx = idx(sStart.cx, sStart.cz);
  const goalIdx = idx(gCell.cx, gCell.cz);
  gScore[startIdx] = 0;

  const open = new MinHeap();
  open.push(startIdx, octile(gCell.cx - sStart.cx, gCell.cz - sStart.cz));
  const openSet = new Uint8Array(cellCount);
  openSet[startIdx] = 1;

  let visited = 0;
  while (open.size() > 0) {
    const top = open.pop()!;
    const i = top.idx;
    if (i === goalIdx) {
      // reconstruct
      const cells: Array<{ cx: number; cz: number }> = [];
      let cur = i;
      while (cur !== -1) {
        cells.push({ cx: cur % grid.width, cz: Math.floor(cur / grid.width) });
        cur = cameFrom[cur];
      }
      cells.reverse();
      const worldPath = cells.map((c) => cellToWorld(grid, c.cx, c.cz));
      const smooth = simplifyPath(grid, worldPath);
      // ensure the very last waypoint is the literal goal so the avatar
      // arrives at the calibrated point, not just the goal cell center.
      smooth[smooth.length - 1] = { x: goal.x, z: goal.z };
      // similarly anchor the start so the avatar doesn't snap back.
      smooth[0] = { x: start.x, z: start.z };
      console.info('[pathfind] aStar found path', {
        cells: cells.length,
        smooth: smooth.length,
        visited,
      });
      return smooth;
    }
    openSet[i] = 0;
    visited += 1;
    const cx = i % grid.width;
    const cz = Math.floor(i / grid.width);
    for (const [dx, dz, cost] of NEIGHBORS_8) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (!isWalkable(grid, nx, nz)) continue;
      // disallow diagonal squeezing through corners
      if (dx !== 0 && dz !== 0) {
        if (!isWalkable(grid, cx + dx, cz) || !isWalkable(grid, cx, cz + dz)) continue;
      }
      const ni = idx(nx, nz);
      const tentative = gScore[i] + cost;
      if (tentative < gScore[ni]) {
        cameFrom[ni] = i;
        gScore[ni] = tentative;
        const f = tentative + octile(gCell.cx - nx, gCell.cz - nz);
        open.push(ni, f);
        openSet[ni] = 1;
      }
    }
  }
  console.warn('[pathfind] aStar no path', { visited, start, goal });
  return null;
}

/* -------------------------------------------------------------------------- */
/* path simplification (Bresenham line-of-sight)                              */
/* -------------------------------------------------------------------------- */

/** Reduce a long cell-by-cell path to the minimum number of waypoints
 *  while preserving line-of-sight. Each pair of consecutive output points
 *  has clear walkable cells along the Bresenham line between them. */
export function simplifyPath(grid: Grid, path: Array<{ x: number; z: number }>): Array<{ x: number; z: number }> {
  if (path.length <= 2) return path.slice();
  const out: Array<{ x: number; z: number }> = [path[0]];
  let anchor = 0;
  for (let i = 2; i < path.length; i++) {
    if (!hasLineOfSight(grid, path[anchor], path[i])) {
      out.push(path[i - 1]);
      anchor = i - 1;
    }
  }
  out.push(path[path.length - 1]);
  return out;
}

function hasLineOfSight(grid: Grid, a: { x: number; z: number }, b: { x: number; z: number }): boolean {
  const ac = worldToCell(grid, a.x, a.z);
  const bc = worldToCell(grid, b.x, b.z);
  let x0 = ac.cx;
  let z0 = ac.cz;
  const x1 = bc.cx;
  const z1 = bc.cz;
  const dx = Math.abs(x1 - x0);
  const dz = Math.abs(z1 - z0);
  const sx = x0 < x1 ? 1 : -1;
  const sz = z0 < z1 ? 1 : -1;
  let err = dx - dz;
  while (true) {
    if (!isWalkable(grid, x0, z0)) return false;
    if (x0 === x1 && z0 === z1) return true;
    const e2 = 2 * err;
    if (e2 > -dz) {
      err -= dz;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      z0 += sz;
    }
  }
}

/** Cheap straight-line query (no path allocation) — useful when the start
 *  and goal are within sight and we want to skip A* entirely. */
export function isStraightShot(
  grid: Grid,
  start: { x: number; z: number },
  goal: { x: number; z: number },
): boolean {
  return hasLineOfSight(grid, start, goal);
}

/* -------------------------------------------------------------------------- */
/* singleton — bake once at room load, read everywhere                        */
/* -------------------------------------------------------------------------- */

let _activeGrid: Grid | null = null;

export function setActiveGrid(g: Grid | null): void {
  _activeGrid = g;
}

export function getActiveGrid(): Grid | null {
  return _activeGrid;
}

/** Convenience — plan a path against the active grid, or return null if
 *  the grid hasn't been baked yet (caller should fall back to straight-line). */
export function planPath(
  start: { x: number; z: number },
  goal: { x: number; z: number },
): Array<{ x: number; z: number }> | null {
  if (!_activeGrid) return null;
  return aStar(_activeGrid, start, goal);
}
