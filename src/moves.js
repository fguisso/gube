// Geometric move engine, inspired by cubing.js's `{ family, amount }` model.
//
// A move is a `family` string (R, M, x, Rw, r, ...) plus an integer `amount`
// (sign = direction). There is no dedicated "slice" or "rotation" type — every
// move is just a family that resolves, geometrically, to an axis + a SET of
// layers + a base direction. This single table is the shared contract reused by
// the parser, the 3D player and (later) the Bluetooth move stream.

const PI2 = Math.PI / 2

// Direction convention (matches the original face turns):
// about +axis, the high-index layer turns -1 and the low-index layer turns +1.
// Slices/wides/rotations "follow" a face: M←L, E←D, S←F, r←R, x←R, y←U, z←F.
const BASE = {
  R:  { axis: 'x', sign: -1, kind: 'high1' },
  L:  { axis: 'x', sign: +1, kind: 'low1' },
  U:  { axis: 'y', sign: -1, kind: 'high1' },
  D:  { axis: 'y', sign: +1, kind: 'low1' },
  F:  { axis: 'z', sign: -1, kind: 'high1' },
  B:  { axis: 'z', sign: +1, kind: 'low1' },
  Rw: { axis: 'x', sign: -1, kind: 'high2' },
  Lw: { axis: 'x', sign: +1, kind: 'low2' },
  Uw: { axis: 'y', sign: -1, kind: 'high2' },
  Dw: { axis: 'y', sign: +1, kind: 'low2' },
  Fw: { axis: 'z', sign: -1, kind: 'high2' },
  Bw: { axis: 'z', sign: +1, kind: 'low2' },
  M:  { axis: 'x', sign: +1, kind: 'mid' },  // follows L
  E:  { axis: 'y', sign: +1, kind: 'mid' },  // follows D
  S:  { axis: 'z', sign: -1, kind: 'mid' },  // follows F
  x:  { axis: 'x', sign: -1, kind: 'all' },  // follows R
  y:  { axis: 'y', sign: -1, kind: 'all' },  // follows U
  z:  { axis: 'z', sign: -1, kind: 'all' },  // follows F
}

// Lowercase wide aliases: r === Rw, u === Uw, ...
const LOWER_WIDE = { r: 'Rw', l: 'Lw', u: 'Uw', d: 'Dw', f: 'Fw', b: 'Bw' }

// One move token: family (+ optional 'w'), optional repeat count, optional prime.
// Order matters: two-char wide (`Rw`) before single faces.
const TOKEN_SRC = "([UDFBLR]w|[UDFBLR]|[MES]|[xyz]|[rludfb])(\\d*)('?)"
const TOKEN_RE = new RegExp('^' + TOKEN_SRC + '$')
const SCAN_RE = new RegExp(TOKEN_SRC, 'g')

function normalizeFamily(fam) {
  return LOWER_WIDE[fam] || fam
}

function layersFor(kind, N) {
  const top = N - 1
  switch (kind) {
    case 'high1': return [top]
    case 'low1':  return [0]
    case 'high2': return N >= 2 ? [top, top - 1] : [top]
    case 'low2':  return N >= 2 ? [0, 1] : [0]
    case 'mid':   return N % 2 ? [(N - 1) / 2] : []   // slices need an odd N
    case 'all':   return Array.from({ length: N }, (_, i) => i)
    default:      return []
  }
}

// Parse a single token into { family, amount } (amount sign = direction).
export function parseToken(token) {
  const m = TOKEN_RE.exec(token)
  if (!m) return null
  const family = normalizeFamily(m[1])
  if (!BASE[family]) return null
  const mag = m[2] ? parseInt(m[2], 10) : 1
  const dir = m[3] === "'" ? -1 : 1
  return { family, amount: mag * dir }
}

function serialize({ family, amount }) {
  const mag = Math.abs(amount)
  return family + (mag > 1 ? mag : '') + (amount < 0 ? "'" : '')
}

// Split an algorithm string into an array of token strings (notation preserved
// for display): "M2 U M2" -> ["M2", "U", "M2"]. Supports faces, wides, slices
// and rotations; commutators/conjugates are out of scope for now.
export function parseAlgorithm(str) {
  if (!str) return []
  const out = []
  let m
  SCAN_RE.lastIndex = 0
  while ((m = SCAN_RE.exec(str)) !== null) {
    const fam = normalizeFamily(m[1])
    if (!BASE[fam]) continue
    out.push(m[0])
  }
  return out
}

// Invert a token: R -> R', R' -> R, R2 -> R2', Rw -> Rw', M2 -> M2'.
export function invertMove(token) {
  const parsed = parseToken(token)
  if (!parsed) return token
  return serialize({ family: parsed.family, amount: -parsed.amount })
}

// Resolve a token to geometry for a given cube size N:
// { axis, layers, angle, label }. Returns null for no-ops (e.g. a slice on 2x2).
export function resolveMove(token, N) {
  const parsed = parseToken(token)
  if (!parsed) return null
  const base = BASE[parsed.family]
  const layers = layersFor(base.kind, N)
  if (!layers.length) return null
  return {
    axis: base.axis,
    layers,
    angle: base.sign * PI2 * parsed.amount,
    label: token,
  }
}
