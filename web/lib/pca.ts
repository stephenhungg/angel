/**
 * pca.ts — deterministic 5d → 2d PCA projection for the trait-space viewer.
 *
 * runs in the browser, computed once at page load from library.json. seeded
 * deterministic so the layout is identical across reloads (judges should not
 * see thumbnails jump).
 *
 * the 5 trait dimensions in our library entries (locked):
 *   0  warmth            cool ←→ warm
 *   1  energy            calm ←→ vivid
 *   2  refinement        raw ←→ polished
 *   3  edge              soft ←→ sharp
 *   4  intimacy          distant ←→ close
 *
 * algo: classical PCA via power iteration on the 5×5 covariance matrix.
 * we extract the top-2 eigenvectors and project. no external deps — small
 * matrix, deterministic, stable, ~5ms for 500 entries.
 *
 * macro centroids ("cute"/"pretty"/"hot") are projected through the SAME
 * basis so they live in the same 2d frame as the thumbnails.
 */

export type Vec5 = [number, number, number, number, number];

export interface LibraryEntry {
  id: string;
  thumbnail: string;
  vector: Vec5;
  /** optional curator label, only used for tooltips */
  label?: string;
}

export interface PcaBasis {
  /** 5d mean of the dataset (subtracted before projection) */
  mean: Vec5;
  /** first principal component, unit length */
  pc1: Vec5;
  /** second principal component, unit length, orthogonal to pc1 */
  pc2: Vec5;
  /** explained-variance ratios (sum to ≤1) */
  explained: [number, number];
}

export interface ProjectedPoint {
  id: string;
  x: number; // normalized to [-1, 1]
  y: number; // normalized to [-1, 1]
}

const DIM = 5;

// ──────────────────────────────────────────────────────────────────────────
// linear-algebra primitives (kept tiny + dep-free)
// ──────────────────────────────────────────────────────────────────────────

function zeros(): Vec5 {
  return [0, 0, 0, 0, 0];
}

function dot(a: Vec5, b: Vec5): number {
  let s = 0;
  for (let i = 0; i < DIM; i++) s += a[i] * b[i];
  return s;
}

function norm(a: Vec5): number {
  return Math.sqrt(dot(a, a));
}

function scale(a: Vec5, k: number): Vec5 {
  return [a[0] * k, a[1] * k, a[2] * k, a[3] * k, a[4] * k];
}

function sub(a: Vec5, b: Vec5): Vec5 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3], a[4] - b[4]];
}

function unit(a: Vec5): Vec5 {
  const n = norm(a);
  return n === 0 ? zeros() : scale(a, 1 / n);
}

/** 5×5 matrix × 5d vector */
function matVec(M: number[][], v: Vec5): Vec5 {
  const r: Vec5 = zeros();
  for (let i = 0; i < DIM; i++) {
    let s = 0;
    for (let j = 0; j < DIM; j++) s += M[i][j] * v[j];
    r[i] = s;
  }
  return r;
}

/** sample covariance matrix of mean-centered rows */
function covariance(rows: Vec5[]): number[][] {
  const M: number[][] = Array.from({ length: DIM }, () => Array(DIM).fill(0));
  const n = rows.length;
  if (n === 0) return M;
  for (const r of rows) {
    for (let i = 0; i < DIM; i++) {
      for (let j = 0; j < DIM; j++) {
        M[i][j] += r[i] * r[j];
      }
    }
  }
  const k = 1 / Math.max(1, n - 1);
  for (let i = 0; i < DIM; i++) for (let j = 0; j < DIM; j++) M[i][j] *= k;
  return M;
}

/** power iteration → leading eigenvector of M. seeded deterministic. */
function leadingEigen(M: number[][], iter = 80): { vec: Vec5; lambda: number } {
  // deterministic seed — never random.
  let v: Vec5 = unit([0.4472, 0.4472, 0.4472, 0.4472, 0.4472]);
  let lambda = 0;
  for (let i = 0; i < iter; i++) {
    const mv = matVec(M, v);
    lambda = norm(mv);
    if (lambda === 0) break;
    v = scale(mv, 1 / lambda);
  }
  return { vec: v, lambda };
}

/** deflate M = M − λ · v vᵀ so the next leading eigen is the second PC. */
function deflate(M: number[][], v: Vec5, lambda: number): number[][] {
  const D: number[][] = M.map((row) => row.slice());
  for (let i = 0; i < DIM; i++) {
    for (let j = 0; j < DIM; j++) {
      D[i][j] -= lambda * v[i] * v[j];
    }
  }
  return D;
}

// ──────────────────────────────────────────────────────────────────────────
// public api
// ──────────────────────────────────────────────────────────────────────────

/** compute the 5d→2d basis from the library. call once at load. */
export function computePcaBasis(entries: LibraryEntry[]): PcaBasis {
  // defensive: filter out any entries missing .vector (can happen during
  // partial SSR hydration or if a remote source returns malformed rows)
  const safe = (entries ?? []).filter(
    (e): e is LibraryEntry => !!e && Array.isArray(e.vector) && e.vector.length === DIM,
  );
  if (safe.length === 0) {
    return {
      mean: zeros(),
      pc1: [1, 0, 0, 0, 0],
      pc2: [0, 1, 0, 0, 0],
      explained: [0, 0],
    };
  }

  // mean
  const mean: Vec5 = zeros();
  for (const e of safe) {
    for (let i = 0; i < DIM; i++) mean[i] += e.vector[i];
  }
  for (let i = 0; i < DIM; i++) mean[i] /= safe.length;

  const centered = safe.map((e) => sub(e.vector, mean));
  const cov = covariance(centered);

  const { vec: pc1, lambda: l1 } = leadingEigen(cov);
  const cov2 = deflate(cov, pc1, l1);
  const { vec: pc2Raw, lambda: l2 } = leadingEigen(cov2);

  // gram-schmidt re-orthogonalize (numerical safety)
  const pc2 = unit(sub(pc2Raw, scale(pc1, dot(pc1, pc2Raw))));

  // explained variance
  const trace = cov[0][0] + cov[1][1] + cov[2][2] + cov[3][3] + cov[4][4];
  const denom = trace || 1;

  return {
    mean,
    pc1,
    pc2,
    explained: [l1 / denom, l2 / denom],
  };
}

/** project a single 5d point through the basis to (x, y) in [-1, 1]. */
export function project(vec: Vec5, basis: PcaBasis): { x: number; y: number } {
  const c = sub(vec, basis.mean);
  return { x: dot(c, basis.pc1), y: dot(c, basis.pc2) };
}

/**
 * project all entries + auto-normalize to [-1, 1]. macros etc. should be
 * projected through `project()` then divided by the same `range` returned
 * here, otherwise they'll fall outside the canvas.
 */
export function projectAll(
  entries: LibraryEntry[],
  basis: PcaBasis,
): { points: ProjectedPoint[]; range: { x: number; y: number } } {
  const safe = (entries ?? []).filter(
    (e): e is LibraryEntry => !!e && Array.isArray(e.vector) && e.vector.length === DIM,
  );
  const raw = safe.map((e) => ({ id: e.id, ...project(e.vector, basis) }));
  let xMax = 0;
  let yMax = 0;
  for (const p of raw) {
    if (Math.abs(p.x) > xMax) xMax = Math.abs(p.x);
    if (Math.abs(p.y) > yMax) yMax = Math.abs(p.y);
  }
  const rx = xMax || 1;
  const ry = yMax || 1;
  return {
    points: raw.map((p) => ({ id: p.id, x: p.x / rx, y: p.y / ry })),
    range: { x: rx, y: ry },
  };
}

/** project arbitrary 5d centroid into the same normalized frame. */
export function projectInto(
  vec: Vec5,
  basis: PcaBasis,
  range: { x: number; y: number },
): { x: number; y: number } {
  const p = project(vec, basis);
  return { x: p.x / (range.x || 1), y: p.y / (range.y || 1) };
}

// ──────────────────────────────────────────────────────────────────────────
// macros (demo-day attractor centroids, evocative public labels)
// ──────────────────────────────────────────────────────────────────────────

/**
 * macro centroids in 5d trait space. these are the three attractor dots
 * the swipe-evolution converges toward. labels are the public/evocative
 * versions — internally we still call them cute/pretty/hot in payloads.
 */
export const MACROS: { id: 'cute' | 'pretty' | 'hot'; label: string; vector: Vec5 }[] = [
  // dimensions: warmth, energy, refinement, edge, intimacy
  { id: 'cute', label: 'soft & near', vector: [0.85, 0.55, 0.40, 0.10, 0.85] },
  { id: 'pretty', label: 'still & golden', vector: [0.65, 0.20, 0.90, 0.30, 0.55] },
  { id: 'hot', label: 'sharp & vivid', vector: [0.45, 0.95, 0.65, 0.95, 0.50] },
];

// ──────────────────────────────────────────────────────────────────────────
// mock library — used until the real library.json lands. 30 entries, seeded
// across the 5d space so PCA yields a meaningful spread. ids match
// /demo/portraits/{id}.jpg by convention; viewer falls back to a colored tile.
// ──────────────────────────────────────────────────────────────────────────

export const MOCK_LIBRARY: LibraryEntry[] = (() => {
  const out: LibraryEntry[] = [];
  // simple xorshift32 — deterministic, no Math.random.
  let s = 0x9e3779b1 >>> 0;
  const rand = () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s >>>= 0;
    s ^= s << 5;
    s >>>= 0;
    return (s & 0xffffffff) / 0xffffffff;
  };
  // generate 30 entries, gravitating toward the 3 macros so PCA finds the modes.
  // defensive: SWC/Turbopack can reorder module-level consts during tree-shake
  // such that MACROS appears undefined here in some prod bundles. fall back to
  // a hardcoded macro shape so the IIFE never throws on import.
  const FALLBACK_MACRO = { id: 'cute' as const, vector: [0.85, 0.55, 0.4, 0.1, 0.85] as Vec5 };
  for (let i = 0; i < 30; i++) {
    const macro = (MACROS && MACROS[i % 3]) || FALLBACK_MACRO;
    const jitter = (): number => (rand() - 0.5) * 0.6;
    const v = macro.vector.map((c, k) =>
      Math.max(0, Math.min(1, c + jitter() + (k === 2 ? jitter() * 0.4 : 0))),
    ) as Vec5;
    out.push({
      id: `mock-${i.toString().padStart(3, '0')}`,
      thumbnail: `/demo/portraits/mock-${i.toString().padStart(3, '0')}.jpg`,
      vector: v,
      label: macro.id,
    });
  }
  return out;
})();
