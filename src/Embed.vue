<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { CubeRenderer, DEFAULT_SIZE, parseAlgorithm, invertMove } from './cube.js'
import { buildShareUrl, encode, useUrlSync } from './url.js'

const sleep = ms => new Promise(r => setTimeout(r, ms))
const RESTART_DELAY_MS = 2000

const canvas = ref(null)
let renderer = null
let playbackToken = 0

const state = reactive({
  alg: '',
  setup: '',
  speed: 450,
  size: DEFAULT_SIZE,
  mask: {},
  orientation: null,
  hint: false,
})

const isPlaying = ref(false)
const isAnimating = ref(false)
const currentMoveIndex = ref(0)

useUrlSync(state, { writeBack: false })

const parsedMoves = computed(() => parseAlgorithm(state.alg))
const showPlayer = computed(() => parsedMoves.value.length > 0)

const FACES_CW = ['F', 'R', 'B', 'L']
function currentRotationSnap() {
  if (!state.orientation) return 0
  return ((Math.round(state.orientation.az / 90) % 4) + 4) % 4
}
function remapMove(token, snap) {
  if (!snap) return token
  const idx = FACES_CW.indexOf(token[0])
  if (idx < 0) return token
  return FACES_CW[(idx + snap) % 4] + token.slice(1)
}

function rebuildWithSetup() {
  if (!renderer) return
  renderer.buildCube()
  if (!state.setup) return
  const snap = currentRotationSnap()
  for (const t of parseAlgorithm(state.setup)) {
    renderer.performMove(remapMove(t, snap), 0)
  }
}
const finished = computed(() =>
  parsedMoves.value.length > 0 && currentMoveIndex.value >= parsedMoves.value.length
)
const editorUrl = computed(() => {
  const payload = encode(state)
  return buildShareUrl(payload)
})

watch(() => state.alg, () => {
  pause()
  currentMoveIndex.value = 0
  rebuildWithSetup()
  nextTick(() => play())
})

watch(() => state.setup, () => {
  pause()
  currentMoveIndex.value = 0
  rebuildWithSetup()
  nextTick(() => play())
})

watch(() => state.size, n => {
  pause()
  currentMoveIndex.value = 0
  if (renderer) {
    renderer.setSize(n)
    rebuildWithSetup()
  }
  nextTick(() => play())
})

watch(() => state.mask, m => {
  if (renderer) {
    renderer.disabledStickers = m
    renderer.applyDisabledMask()
  }
}, { deep: true })

watch(() => state.hint, v => renderer?.setHintFacelets(v))

onMounted(() => {
  renderer = new CubeRenderer(canvas.value, state.size)
  renderer.disabledStickers = state.mask
  renderer.hintFacelets = state.hint
  renderer.init()
  if (state.orientation) renderer.setOrientation(state.orientation)
  if (state.setup) rebuildWithSetup()
  if (Object.values(state.mask).some(a => a && a.length)) renderer.flashMaskIn()
  setTimeout(() => renderer?.resize(), 100)
  setTimeout(() => renderer?.resize(), 500)
  nextTick(() => play())
})

onUnmounted(() => {
  pause()
  renderer?.dispose()
})

async function play() {
  if (isPlaying.value || !renderer || !parsedMoves.value.length) return
  isPlaying.value = true
  const myToken = ++playbackToken
  while (isPlaying.value && myToken === playbackToken) {
    if (currentMoveIndex.value >= parsedMoves.value.length) {
      await sleep(RESTART_DELAY_MS)
      if (myToken !== playbackToken) return
      currentMoveIndex.value = 0
      rebuildWithSetup()
      await sleep(50)
      continue
    }
    const move = parsedMoves.value[currentMoveIndex.value]
    isAnimating.value = true
    await renderer.performMove(remapMove(move, currentRotationSnap()), state.speed)
    isAnimating.value = false
    if (myToken !== playbackToken) return
    currentMoveIndex.value++
  }
}
function pause() { isPlaying.value = false; playbackToken++ }
function replay() {
  pause()
  currentMoveIndex.value = 0
  rebuildWithSetup()
  nextTick(() => play())
}
function togglePlay() {
  if (isPlaying.value) pause()
  else if (finished.value) replay()
  else play()
}

async function stepForward() {
  if (!renderer || currentMoveIndex.value >= parsedMoves.value.length || isAnimating.value) return
  pause()
  const move = parsedMoves.value[currentMoveIndex.value]
  isAnimating.value = true
  await renderer.performMove(remapMove(move, currentRotationSnap()), state.speed)
  isAnimating.value = false
  currentMoveIndex.value++
}
async function stepBack() {
  if (!renderer || currentMoveIndex.value <= 0 || isAnimating.value) return
  pause()
  currentMoveIndex.value--
  const inv = invertMove(parsedMoves.value[currentMoveIndex.value])
  isAnimating.value = true
  await renderer.performMove(remapMove(inv, currentRotationSnap()), state.speed)
  isAnimating.value = false
}
</script>

<template>
  <div class="embed-stage">
    <div v-if="showPlayer" class="embed-formula">
      <div class="formula-text">
        <span
          v-for="(m, i) in parsedMoves"
          :key="i"
          class="move"
          :class="{ done: i < currentMoveIndex, current: i === currentMoveIndex }"
        >{{ m }}</span>
      </div>
    </div>

    <div class="embed-canvas-wrap">
      <canvas class="cube-canvas" ref="canvas"></canvas>
    </div>

    <div class="embed-bottom">
      <div v-if="showPlayer" class="embed-controls">
        <button class="ctrl-btn" @click="stepBack" :disabled="currentMoveIndex <= 0 || isAnimating">‹</button>
        <button class="ctrl-btn play" @click="togglePlay" :title="isPlaying ? 'Pause' : finished ? 'Replay' : 'Play'">
          <span v-if="isPlaying">❚❚</span>
          <svg v-else-if="finished" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 3-6.7" />
            <path d="M3 4v5h5" />
          </svg>
          <span v-else>▶</span>
        </button>
        <button class="ctrl-btn" @click="stepForward" :disabled="currentMoveIndex >= parsedMoves.length || isAnimating">›</button>
        <button class="ctrl-btn" :class="{ active: state.hint }" @click="state.hint = !state.hint" :title="state.hint ? 'Hide hint facelets' : 'Show hint facelets'" aria-label="Toggle hint facelets">
          <svg v-if="state.hint" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
            <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
            <line x1="2" y1="2" x2="22" y2="22" />
          </svg>
        </button>
      </div>
      <a class="embed-edit-btn" :href="editorUrl" target="_blank" rel="noopener" title="Open in editor">
        Edit ↗
      </a>
    </div>
  </div>
</template>
