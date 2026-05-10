export const PRESETS = [
  {
    name: 'Sune',
    size: 3,
    algorithm: "R U R' U R U2 R'",
    disabled: { D: 'all', F: [3,4,5,6,7,8], B: [3,4,5,6,7,8], L: [3,4,5,6,7,8], R: [3,4,5,6,7,8] },
  },
  {
    name: 'Anti-Sune',
    size: 3,
    algorithm: "R U2 R' U' R U' R'",
    disabled: { D: 'all', F: [3,4,5,6,7,8], B: [3,4,5,6,7,8], L: [3,4,5,6,7,8], R: [3,4,5,6,7,8] },
  },
  {
    name: 'T-Perm',
    size: 3,
    algorithm: "R U R' U' R' F R2 U' R' U' R U R' F'",
    disabled: { D: 'all' },
  },
  {
    name: 'Y-Perm',
    size: 3,
    algorithm: "F R U' R' U' R U R' F' R U R' U' R' F R F'",
    disabled: { D: 'all' },
  },
  {
    name: '2x2 OLL · Sune',
    size: 2,
    algorithm: "R U R' U R U2 R'",
    disabled: { D: 'all', F: [2,3], B: [2,3], L: [2,3], R: [2,3] },
  },
  {
    name: '2x2 PLL · Y-Perm',
    size: 2,
    algorithm: "F R U' R' U' R U R' F' R U R' U' R' F R F'",
    disabled: { D: 'all' },
  },
]

export function expandDisabled(disabled, size = 3) {
  const fresh = { U: [], D: [], F: [], B: [], L: [], R: [] }
  if (!disabled) return fresh
  const all = Array.from({ length: size * size }, (_, i) => i)
  Object.keys(disabled).forEach(face => {
    const v = disabled[face]
    if (v === 'all') fresh[face] = all.slice()
    else if (Array.isArray(v)) fresh[face] = v.filter(i => i < size * size).sort((a, b) => a - b)
  })
  return fresh
}
