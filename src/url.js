import { onMounted, onUnmounted, watch } from 'vue'
import { PRESETS, expandDisabled } from './presets.js'
import { DEFAULT_SIZE, DEFAULT_ORIENTATION, SUPPORTED_SIZES } from './cube.js'

const EMPTY_MASK = () => ({ U: [], D: [], F: [], B: [], L: [], R: [] })
const FACES_ORDER = ['U', 'D', 'F', 'B', 'L', 'R']

function charsPerFace(N) {
  return Math.max(1, Math.ceil((N * N) / Math.log2(36)))
}

function findPreset(alg, size) {
  if (!alg) return null
  return PRESETS.find(p => p.algorithm === alg && (p.size || DEFAULT_SIZE) === size) || null
}

export const DEFAULTS = {
  alg: '',
  setup: '',
  speed: 450,
  size: DEFAULT_SIZE,
  mask: EMPTY_MASK(),
  orientation: null,
}

function encodeOrientation(o) {
  if (!o) return ''
  return `${Math.round(o.az)}.${Math.round(o.pol)}`
}

function decodeOrientation(s) {
  if (!s) return null
  const [a, p] = s.split('.').map(Number)
  if (!Number.isFinite(a) || !Number.isFinite(p)) return null
  if (p < 0 || p > 180) return null
  return { az: a, pol: p }
}

function orientationEqualsDefault(o) {
  if (!o) return true
  return o.az === DEFAULT_ORIENTATION.az && o.pol === DEFAULT_ORIENTATION.pol
}

function encodeAlg(alg) {
  return alg.replace(/\s+/g, '').replace(/'/g, '-')
}

function decodeAlg(s) {
  if (!s) return ''
  const out = []
  let i = 0
  while (i < s.length) {
    const ch = s[i]
    if (!/[UDFBLR]/.test(ch)) { i++; continue }
    let token = ch
    i++
    if (i < s.length && (s[i] === '-' || s[i] === "'" || s[i] === '2')) {
      token += s[i] === '-' ? "'" : s[i]
      i++
    }
    out.push(token)
  }
  return out.join(' ')
}

function encodeMask(mask, size) {
  if (!mask) return ''
  const width = charsPerFace(size)
  let any = false
  const parts = FACES_ORDER.map(f => {
    const arr = mask[f] || []
    if (arr.length) any = true
    let bits = 0
    for (const i of arr) if (i < size * size) bits |= (1 << i)
    return bits.toString(36).padStart(width, '0')
  })
  return any ? parts.join('') : ''
}

function decodeMask(s, size) {
  const out = EMPTY_MASK()
  if (!s) return out
  const width = charsPerFace(size)
  if (s.length !== width * 6) return out
  for (let f = 0; f < 6; f++) {
    const bits = parseInt(s.slice(f * width, (f + 1) * width), 36)
    if (Number.isNaN(bits)) continue
    for (let i = 0; i < size * size; i++) {
      if (bits & (1 << i)) out[FACES_ORDER[f]].push(i)
    }
  }
  return out
}

function maskEqualsDefault(mask) {
  if (!mask) return true
  return FACES_ORDER.every(f => !mask[f] || mask[f].length === 0)
}

export function encode(state) {
  const params = new URLSearchParams()
  const size = state.size || DEFAULT_SIZE

  if (size !== DEFAULTS.size) params.set('n', String(size))
  if (state.setup) params.set('p', encodeAlg(state.setup))
  if (state.alg && state.alg !== DEFAULTS.alg) params.set('a', encodeAlg(state.alg))

  const preset = findPreset(state.alg, size)
  const encodedMask = maskEqualsDefault(state.mask) ? '' : encodeMask(state.mask, size)
  const presetMask = preset ? encodeMask(expandDisabled(preset.disabled, size), size) : ''

  if (state.speed !== DEFAULTS.speed) params.set('s', String(state.speed))
  if (encodedMask && encodedMask !== presetMask) params.set('m', encodedMask)

  if (state.orientation && !orientationEqualsDefault(state.orientation)) {
    params.set('o', encodeOrientation(state.orientation))
  }

  return params.toString()
}

export function decode(payload) {
  const out = { ...DEFAULTS, mask: EMPTY_MASK() }
  if (!payload) return out
  const params = new URLSearchParams(payload)

  if (params.has('n')) {
    const n = Number(params.get('n'))
    if (SUPPORTED_SIZES.includes(n)) out.size = n
  }
  if (params.has('a')) out.alg = decodeAlg(params.get('a'))
  if (params.has('p')) out.setup = decodeAlg(params.get('p'))
  if (params.has('s')) out.speed = Number(params.get('s'))

  const preset = findPreset(out.alg, out.size)
  out.mask = params.has('m')
    ? decodeMask(params.get('m'), out.size)
    : (preset ? expandDisabled(preset.disabled, out.size) : EMPTY_MASK())

  if (params.has('o')) {
    out.orientation = decodeOrientation(params.get('o'))
  }

  return out
}

export function readHash() {
  const h = window.location.hash || ''
  return h.startsWith('#') ? h.slice(1) : h
}

function pageUrl(target) {
  const { origin, pathname } = window.location
  let path = pathname
  if (target === 'editor') {
    if (path.endsWith('embed.html')) path = path.replace(/embed\.html$/, 'index.html')
  } else {
    if (path.endsWith('index.html')) path = path.replace(/index\.html$/, 'embed.html')
    else if (path.endsWith('/')) path = path + 'embed.html'
    else if (!path.endsWith('embed.html')) path = path + '/embed.html'
  }
  return `${origin}${path}`
}

export function buildShareUrl(payload) {
  return pageUrl('editor') + (payload ? '#' + payload : '')
}

export function buildEmbedUrl(payload) {
  return pageUrl('embed') + (payload ? '#' + payload : '')
}

export function buildEmbedSnippet(payload, { width = 480, height = 360 } = {}) {
  const url = buildEmbedUrl(payload)
  return `<iframe src="${url}" width="${width}" height="${height}" style="border:0;border-radius:12px" allowfullscreen></iframe>`
}

/**
 * Hydrates `state` from the URL hash on mount, then writes back debounced.
 * Pass `{ writeBack: false }` for read-only embed usage.
 */
export function useUrlSync(state, { writeBack = true } = {}) {
  let timer = null
  let hydrating = false

  const hydrate = () => {
    const payload = readHash()
    if (!payload) return
    const decoded = decode(payload)
    hydrating = true
    Object.assign(state, decoded)
    setTimeout(() => { hydrating = false }, 0)
  }

  onMounted(() => {
    hydrate()
    window.addEventListener('hashchange', hydrate)
  })
  onUnmounted(() => {
    window.removeEventListener('hashchange', hydrate)
    if (timer) clearTimeout(timer)
  })

  if (!writeBack) return

  watch(state, () => {
    if (hydrating) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      const payload = encode(state)
      const next = payload ? '#' + payload : ''
      const cur = window.location.hash
      if (cur === next) return
      const url = window.location.pathname + window.location.search + next
      window.history.replaceState(null, '', url)
    }, 300)
  }, { deep: true })
}
