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
  speed: 450,
  size: DEFAULT_SIZE,
  mask: {},
})

const isPlaying = ref(false)
const isAnimating = ref(false)
const currentMoveIndex = ref(0)

useUrlSync(state, { writeBack: false })

const parsedMoves = computed(() => parseAlgorithm(state.alg))
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
  if (renderer) renderer.buildCube()
  nextTick(() => play())
})

watch(() => state.size, n => {
  pause()
  currentMoveIndex.value = 0
  if (renderer) renderer.setSize(n)
  nextTick(() => play())
})

watch(() => state.mask, m => {
  if (renderer) {
    renderer.disabledStickers = m
    renderer.applyDisabledMask()
  }
}, { deep: true })

onMounted(() => {
  renderer = new CubeRenderer(canvas.value, state.size)
  renderer.disabledStickers = state.mask
  renderer.init()
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
      renderer.buildCube()
      await sleep(50)
      continue
    }
    const move = parsedMoves.value[currentMoveIndex.value]
    isAnimating.value = true
    await renderer.performMove(move, state.speed)
    isAnimating.value = false
    if (myToken !== playbackToken) return
    currentMoveIndex.value++
  }
}
function pause() { isPlaying.value = false; playbackToken++ }
function replay() {
  pause()
  currentMoveIndex.value = 0
  renderer?.buildCube()
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
  await renderer.performMove(move, state.speed)
  isAnimating.value = false
  currentMoveIndex.value++
}
async function stepBack() {
  if (!renderer || currentMoveIndex.value <= 0 || isAnimating.value) return
  pause()
  currentMoveIndex.value--
  const inv = invertMove(parsedMoves.value[currentMoveIndex.value])
  isAnimating.value = true
  await renderer.performMove(inv, state.speed)
  isAnimating.value = false
}
</script>

<template>
  <div class="embed-stage">
    <div v-if="parsedMoves.length" class="embed-formula">
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
      <div class="embed-controls">
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
      </div>
      <a class="embed-edit-btn" :href="editorUrl" target="_blank" rel="noopener" title="Open in editor">
        Edit ↗
      </a>
    </div>
  </div>
</template>
