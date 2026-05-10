<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import BrandWordmark from './BrandWordmark.vue'
import { CubeRenderer, COLORS, FACES, SUPPORTED_SIZES, DEFAULT_SIZE, parseAlgorithm, invertMove } from './cube.js'
import { PRESETS, expandDisabled } from './presets.js'
import {
  buildEmbedSnippet,
  buildShareUrl,
  encode,
  useUrlSync,
} from './url.js'

const canvas = ref(null)
let renderer = null
let playbackToken = 0

const state = reactive({
  alg: "R U R' U R U2 R'",
  speed: 450,
  size: DEFAULT_SIZE,
  mask: { U: [], D: [0,1,2,3,4,5,6,7,8], F: [3,4,5,6,7,8], B: [3,4,5,6,7,8], L: [3,4,5,6,7,8], R: [3,4,5,6,7,8] },
  orientation: null,
})

const stickerCount = computed(() => state.size * state.size)
const allStickers = computed(() => Array.from({ length: stickerCount.value }, (_, i) => i))
const visiblePresets = computed(() => PRESETS.filter(p => (p.size || DEFAULT_SIZE) === state.size))

const isPlaying = ref(false)
const isAnimating = ref(false)
const currentMoveIndex = ref(0)
const activeFace = ref('U')
const sheetOpen = ref(false)
const tab = ref('algo')
const currentPresetName = ref('Sune')
const shareOpen = ref(false)
const shareCopied = ref(false)
const snippetCopied = ref(false)

const parsedMoves = computed(() => parseAlgorithm(state.alg))
const showPlayer = computed(() => parsedMoves.value.length > 0)
const finished = computed(() =>
  parsedMoves.value.length > 0 && currentMoveIndex.value >= parsedMoves.value.length
)

const sharePayload = computed(() => encode(state))
const shareUrl = computed(() => sharePayload.value ? buildShareUrl(sharePayload.value) : window.location.href)
const embedSnippet = computed(() => sharePayload.value ? buildEmbedSnippet(sharePayload.value) : '')

useUrlSync(state)

watch(() => state.alg, (next, prev) => {
  pause()
  currentMoveIndex.value = 0
  currentPresetName.value = ''
  if (renderer) renderer.buildCube()
  if (next && !prev) state.orientation = null
})

watch(() => state.size, n => {
  pause()
  currentMoveIndex.value = 0
  currentPresetName.value = ''
  const max = n * n
  const clamp = arr => (arr || []).filter(i => i < max)
  state.mask = {
    U: clamp(state.mask.U), D: clamp(state.mask.D),
    F: clamp(state.mask.F), B: clamp(state.mask.B),
    L: clamp(state.mask.L), R: clamp(state.mask.R),
  }
  if (renderer) renderer.setSize(n)
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
  if (state.orientation && !state.alg) renderer.setOrientation(state.orientation)
  renderer.onOrientationChange = (o) => {
    if (!state.alg) state.orientation = o
  }
  setTimeout(() => renderer?.resize(), 100)
  setTimeout(() => renderer?.resize(), 500)
})

onUnmounted(() => {
  pause()
  renderer?.dispose()
})

async function play() {
  if (isPlaying.value || !renderer || finished.value) return
  isPlaying.value = true
  const myToken = ++playbackToken
  while (
    isPlaying.value &&
    myToken === playbackToken &&
    currentMoveIndex.value < parsedMoves.value.length
  ) {
    const move = parsedMoves.value[currentMoveIndex.value]
    isAnimating.value = true
    await renderer.performMove(move, state.speed)
    isAnimating.value = false
    if (myToken !== playbackToken) return
    currentMoveIndex.value++
  }
  isPlaying.value = false
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
  const move = parsedMoves.value[currentMoveIndex.value]
  isAnimating.value = true
  await renderer.performMove(move, state.speed)
  isAnimating.value = false
  currentMoveIndex.value++
}
async function stepBack() {
  if (!renderer || currentMoveIndex.value <= 0 || isAnimating.value) return
  currentMoveIndex.value--
  const inv = invertMove(parsedMoves.value[currentMoveIndex.value])
  isAnimating.value = true
  await renderer.performMove(inv, state.speed)
  isAnimating.value = false
}

function resetCube() {
  pause()
  currentMoveIndex.value = 0
  renderer?.buildCube()
}

function isDisabled(face, idx) {
  return state.mask[face]?.includes(idx) ?? false
}
function toggleSticker(face, idx) {
  const arr = [...(state.mask[face] || [])]
  const at = arr.indexOf(idx)
  if (at >= 0) arr.splice(at, 1)
  else { arr.push(idx); arr.sort((a, b) => a - b) }
  state.mask = { ...state.mask, [face]: arr }
}
function disabledCountForFace(face) { return state.mask[face]?.length ?? 0 }
function getFaceColor(face, idx) { return isDisabled(face, idx) ? COLORS.X : COLORS[face] }
function disableAllFace() {
  state.mask = { ...state.mask, [activeFace.value]: allStickers.value.slice() }
}
function enableAllFace() {
  state.mask = { ...state.mask, [activeFace.value]: [] }
}
function disableAllCube() {
  const all = allStickers.value.slice()
  state.mask = { U: all.slice(), D: all.slice(), F: all.slice(), B: all.slice(), L: all.slice(), R: all.slice() }
}
function enableAllCube() {
  state.mask = { U: [], D: [], F: [], B: [], L: [], R: [] }
}

function loadPreset(p) {
  pause()
  const presetSize = p.size || DEFAULT_SIZE
  if (presetSize !== state.size) state.size = presetSize
  state.alg = p.algorithm
  currentPresetName.value = p.name
  state.mask = expandDisabled(p.disabled, presetSize)
  currentMoveIndex.value = 0
  renderer?.buildCube()
  closeSheet()
}

function toggleSheet() { sheetOpen.value = !sheetOpen.value }
function closeSheet() { sheetOpen.value = false }

function openShare() { shareOpen.value = true; shareCopied.value = false; snippetCopied.value = false }
function closeShare() { shareOpen.value = false }
async function copyShareUrl() {
  await navigator.clipboard.writeText(shareUrl.value)
  shareCopied.value = true
  setTimeout(() => { shareCopied.value = false }, 1200)
}
async function copySnippet() {
  await navigator.clipboard.writeText(embedSnippet.value)
  snippetCopied.value = true
  setTimeout(() => { snippetCopied.value = false }, 1200)
}

const activeFaceName = computed(() => FACES.find(f => f.code === activeFace.value)?.name || '')
</script>

<template>
  <div class="editor-app">
    <div class="stage">
      <div class="top-bar">
        <a class="brand-link" href="./" @click.prevent="resetCube" title="Reset">
          <BrandWordmark label="gube" :width="92" />
        </a>
        <div class="top-bar-spacer"></div>
        <button class="header-btn" @click="openShare" title="Share" aria-label="Share">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
        </button>
        <button class="header-btn menu-btn" :class="{ active: sheetOpen }" @click="toggleSheet" title="Editor">≡</button>
      </div>

      <div v-if="showPlayer" class="formula-display">
        <div class="formula-text">
          <span
            v-for="(m, i) in parsedMoves"
            :key="i"
            class="move"
            :class="{ done: i < currentMoveIndex, current: i === currentMoveIndex }"
          >{{ m }}</span>
        </div>
      </div>

      <div class="canvas-wrap">
        <canvas id="cube-canvas" ref="canvas"></canvas>
      </div>

      <div v-if="showPlayer" class="bottom-bar">
        <div class="controls-row">
          <button class="ctrl-btn" @click="stepBack" :disabled="currentMoveIndex <= 0 || isAnimating">‹</button>
          <button class="ctrl-btn play" @click="togglePlay" :title="isPlaying ? 'Pause' : finished ? 'Replay' : 'Play'">
            <span v-if="isPlaying">❚❚</span>
            <svg v-else-if="finished" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 3-6.7" />
              <path d="M3 4v5h5" />
            </svg>
            <span v-else>▶</span>
          </button>
          <button class="ctrl-btn" @click="stepForward" :disabled="currentMoveIndex >= parsedMoves.length || isAnimating">›</button>
        </div>
      </div>
    </div>

    <div class="sheet-backdrop" :class="{ open: sheetOpen }" @click="closeSheet"></div>

    <div class="sheet" :class="{ open: sheetOpen }">
      <div class="sheet-handle-area" @click="closeSheet">
        <div class="sheet-handle"></div>
      </div>

      <div class="sheet-tabs">
        <button class="sheet-tab" :class="{ active: tab === 'algo' }" @click="tab = 'algo'">Algorithm</button>
        <button class="sheet-tab" :class="{ active: tab === 'face' }" @click="tab = 'face'">Stickers</button>
        <button class="sheet-tab" :class="{ active: tab === 'presets' }" @click="tab = 'presets'">Presets</button>
      </div>

      <div class="sheet-content">
        <div v-show="tab === 'algo'">
          <div class="field">
            <div class="field-label">cube size<span class="hint">{{ state.size }}×{{ state.size }}×{{ state.size }}</span></div>
            <div class="size-toggle">
              <button
                v-for="n in SUPPORTED_SIZES" :key="n"
                class="size-btn"
                :class="{ active: state.size === n }"
                @click="state.size = n"
              >{{ n }}×{{ n }}</button>
            </div>
          </div>

          <div class="field">
            <div class="field-label">algorithm<span class="hint">RUR'U' or R U R' U'</span></div>
            <textarea
              class="textarea" v-model="state.alg"
              placeholder="e.g. RUR'URU2R'"
              autocapitalize="characters" autocomplete="off" autocorrect="off" spellcheck="false"
            ></textarea>
          </div>

          <div class="field">
            <div class="field-label">speed<span class="hint">{{ state.speed }}ms / move</span></div>
            <input class="input" type="range" v-model.number="state.speed" min="150" max="1500" step="50">
          </div>
        </div>

        <div v-show="tab === 'face'">
          <div class="section-title">Disabled Stickers</div>
          <p class="section-desc">
            Tap on stickers to mark pieces that <em>don't matter</em> for this algorithm. They'll appear gray on the 3D cube.
          </p>

          <div class="face-tabs">
            <button v-for="f in FACES" :key="f.code" class="face-tab-btn" :class="{ active: activeFace === f.code }" @click="activeFace = f.code">
              {{ f.code }}
            </button>
          </div>

          <div class="face-grid" :style="{ gridTemplateColumns: `repeat(${state.size}, 1fr)` }">
            <div
              v-for="i in stickerCount" :key="i"
              class="face-cell"
              :class="{ disabled: isDisabled(activeFace, i-1) }"
              :style="{ background: getFaceColor(activeFace, i-1) }"
              @click="toggleSticker(activeFace, i-1)"
            ></div>
          </div>
          <div class="face-help">
            Face <b>{{ activeFaceName }}</b> · {{ disabledCountForFace(activeFace) }}/{{ stickerCount }} disabled
          </div>

          <div class="btn-row" style="margin-top: 16px;">
            <button class="btn" @click="disableAllFace">Disable all</button>
            <button class="btn" @click="enableAllFace">Enable all</button>
          </div>

          <div class="divider"></div>

          <div class="btn-row">
            <button class="btn" @click="disableAllCube">Gray everything</button>
            <button class="btn" @click="enableAllCube">Color everything</button>
          </div>
        </div>

        <div v-show="tab === 'presets'">
          <div class="section-title">Presets</div>
          <div class="preset-list">
            <div
              v-for="(p, i) in visiblePresets" :key="i"
              class="preset-item"
              :class="{ active: currentPresetName === p.name }"
              @click="loadPreset(p)"
            >
              <div class="preset-name">{{ p.name }}</div>
              <div class="preset-moves">{{ p.algorithm }}</div>
            </div>
            <div v-if="!visiblePresets.length" class="preset-empty">No presets for this size yet.</div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="shareOpen" class="share-dialog" @click.self="closeShare">
      <div class="share-card">
        <h3>Share</h3>
        <div>
          <div class="field-label" style="margin-bottom: 6px">URL</div>
          <div class="share-row">
            <input class="input" :value="shareUrl" readonly @focus="$event.target.select()">
            <button class="copy-btn" :class="{ done: shareCopied }" @click="copyShareUrl">
              {{ shareCopied ? '✓' : 'Copy' }}
            </button>
          </div>
        </div>
        <div>
          <div class="field-label" style="margin-bottom: 6px">Embed</div>
          <div class="share-row">
            <textarea class="share-snippet" :value="embedSnippet" readonly @focus="$event.target.select()"></textarea>
            <button class="copy-btn" :class="{ done: snippetCopied }" @click="copySnippet">
              {{ snippetCopied ? '✓' : 'Copy' }}
            </button>
          </div>
        </div>
        <div class="btn-row">
          <button class="btn" @click="closeShare">Close</button>
        </div>
      </div>
    </div>
  </div>
</template>
