import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

export const COLORS = {
  U: '#f8f8f4', D: '#ffe14a', F: '#5cd66b', B: '#4a8eff',
  R: '#ff4d4d', L: '#ff9a3c', X: '#3a3a3f', K: '#0f0f12',
}

export const FACES = [
  { code: 'U', name: 'Up' }, { code: 'D', name: 'Down' },
  { code: 'F', name: 'Front' }, { code: 'B', name: 'Back' },
  { code: 'L', name: 'Left' }, { code: 'R', name: 'Right' },
]

export const SUPPORTED_SIZES = [2, 3]
export const DEFAULT_SIZE = 3

const MOVE_RE = /[UDFBLR](?:'|2)?/g

export function parseAlgorithm(str) {
  if (!str) return []
  return str.match(MOVE_RE) || []
}

export function invertMove(t) {
  if (t.endsWith("'")) return t.slice(0, -1)
  if (t.endsWith('2')) return t
  return t + "'"
}

function moveDefs(N) {
  const top = N - 1
  return {
    U: { axis: 'y', layer: top, angle: -Math.PI / 2 },
    D: { axis: 'y', layer: 0,   angle:  Math.PI / 2 },
    R: { axis: 'x', layer: top, angle: -Math.PI / 2 },
    L: { axis: 'x', layer: 0,   angle:  Math.PI / 2 },
    F: { axis: 'z', layer: top, angle: -Math.PI / 2 },
    B: { axis: 'z', layer: 0,   angle:  Math.PI / 2 },
  }
}

function parseMoveToken(token, N) {
  const def = moveDefs(N)[token[0].toUpperCase()]
  if (!def) return null
  let angle = def.angle
  if (token.includes("'")) angle = -angle
  if (token.includes('2')) angle *= 2
  return { axis: def.axis, layer: def.layer, angle, label: token }
}

function stickerIndexFor(face, x, y, z, N) {
  const last = N - 1
  let row, col
  switch (face) {
    case 'U': row = z;        col = x;        break
    case 'D': row = last - z; col = x;        break
    case 'F': row = last - y; col = x;        break
    case 'B': row = last - y; col = last - x; break
    case 'L': row = last - y; col = z;        break
    case 'R': row = last - y; col = last - z; break
  }
  return row * N + col
}

function snapRotation(obj3d) {
  const e = new THREE.Euler().setFromQuaternion(obj3d.quaternion, 'XYZ')
  const snap = a => Math.round(a / (Math.PI / 2)) * (Math.PI / 2)
  e.x = snap(e.x); e.y = snap(e.y); e.z = snap(e.z)
  obj3d.quaternion.setFromEuler(e)
}

export class CubeRenderer {
  constructor(canvas, size = DEFAULT_SIZE) {
    this.canvas = canvas
    this.size = size
    this.scene = null
    this.camera = null
    this.renderer = null
    this.controls = null
    this.cubies = []
    this.rotatingGroup = null
    this.disabledStickers = { U: [], D: [], F: [], B: [], L: [], R: [] }
    this._frame = null
    this._ro = null
    this._sharedBodyGeom = null
    this._sharedBodyMat = null
    this._sharedStickerGeom = null
    this._onWindowResize = () => this.resize()
    this._onOrientation = () => setTimeout(() => this.resize(), 200)
  }

  init() {
    const c = this.canvas
    const width = c.clientWidth || 1
    const height = c.clientHeight || 1

    this.scene = new THREE.Scene()
    this.scene.background = null

    this.camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100)
    this._applyCameraForSize()

    this.renderer = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(width, height, false)

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.15))
    const dir = new THREE.DirectionalLight(0xffffff, 0.75)
    dir.position.set(5, 8, 6)
    this.scene.add(dir)
    const dir2 = new THREE.DirectionalLight(0x00ff7f, 0.12)
    dir2.position.set(-4, -2, -3)
    this.scene.add(dir2)

    this.controls = new OrbitControls(this.camera, c)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.enablePan = false
    this.controls.enableZoom = false
    this._applyControlsForSize()

    this.buildCube()
    this._animate()

    if (c.parentElement) {
      this._ro = new ResizeObserver(() => this.resize())
      this._ro.observe(c.parentElement)
    }
    window.addEventListener('resize', this._onWindowResize)
    window.addEventListener('orientationchange', this._onOrientation)
  }

  setSize(size) {
    if (!SUPPORTED_SIZES.includes(size) || size === this.size) return
    this.size = size
    this._applyCameraForSize()
    this._applyControlsForSize()
    this.buildCube()
  }

  _applyCameraForSize() {
    if (!this.camera) return
    const s = this.size / 3
    this.camera.position.set(5.5 * s, 5.5 * s, 7 * s)
    this.camera.lookAt(0, 0, 0)
  }

  _applyControlsForSize() {
    if (!this.controls) return
    const s = this.size / 3
    this.controls.minDistance = 5 * s
    this.controls.maxDistance = 18 * s
  }

  resize() {
    const c = this.canvas
    if (!c || !this.camera || !this.renderer) return
    const width = c.clientWidth
    const height = c.clientHeight
    if (width === 0 || height === 0) return
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
  }

  _animate() {
    this._frame = requestAnimationFrame(() => this._animate())
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  buildCube() {
    this.cubies.forEach(c => {
      this.scene.remove(c.group)
      Object.values(c.stickers).forEach(s => s.material.dispose())
    })
    this.cubies = []

    const N = this.size
    const last = N - 1
    const offset = (N - 1) / 2

    const cubieSize = 0.95
    const cubieRadius = 0.08
    const stickerSize = 0.82
    const stickerRadius = 0.10
    const stickerOffset = cubieSize / 2 + 0.001

    if (!this._sharedBodyGeom) {
      this._sharedBodyGeom = new RoundedBoxGeometry(cubieSize, cubieSize, cubieSize, 3, cubieRadius)
      this._sharedBodyMat = new THREE.MeshStandardMaterial({
        color: COLORS.K, roughness: 0.6, metalness: 0.0,
      })
      this._sharedStickerGeom = new RoundedBoxGeometry(stickerSize, stickerSize, 0.02, 3, stickerRadius)
    }

    for (let xi = 0; xi <= last; xi++) {
      for (let yi = 0; yi <= last; yi++) {
        for (let zi = 0; zi <= last; zi++) {
          const onSurface = xi === 0 || xi === last || yi === 0 || yi === last || zi === 0 || zi === last
          if (!onSurface) continue

          const wx = xi - offset
          const wy = yi - offset
          const wz = zi - offset

          const group = new THREE.Group()
          group.position.set(wx, wy, wz)

          const body = new THREE.Mesh(this._sharedBodyGeom, this._sharedBodyMat)
          group.add(body)

          const stickers = {}
          const faceConfigs = [
            { face: 'R', cond: xi === last, pos: [ stickerOffset, 0, 0], rot: [0,  Math.PI / 2, 0] },
            { face: 'L', cond: xi === 0,    pos: [-stickerOffset, 0, 0], rot: [0, -Math.PI / 2, 0] },
            { face: 'U', cond: yi === last, pos: [0,  stickerOffset, 0], rot: [-Math.PI / 2, 0, 0] },
            { face: 'D', cond: yi === 0,    pos: [0, -stickerOffset, 0], rot: [ Math.PI / 2, 0, 0] },
            { face: 'F', cond: zi === last, pos: [0, 0,  stickerOffset], rot: [0, 0, 0] },
            { face: 'B', cond: zi === 0,    pos: [0, 0, -stickerOffset], rot: [0, Math.PI, 0] },
          ]

          faceConfigs.forEach(fc => {
            if (!fc.cond) return
            const stickerMat = new THREE.MeshStandardMaterial({
              color: COLORS[fc.face],
              roughness: 0.32, metalness: 0.0,
            })
            const sticker = new THREE.Mesh(this._sharedStickerGeom, stickerMat)
            sticker.position.set(...fc.pos)
            sticker.rotation.set(...fc.rot)
            group.add(sticker)
            stickers[fc.face] = sticker
          })

          this.scene.add(group)
          this.cubies.push({
            group, stickers,
            logical: { x: xi, y: yi, z: zi },
            home: { x: xi, y: yi, z: zi },
          })
        }
      }
    }
    this.applyDisabledMask()
  }

  setDisabledStickers(map) {
    this.disabledStickers = map
    this.applyDisabledMask()
  }

  applyDisabledMask() {
    const N = this.size
    this.cubies.forEach(c => {
      const { x, y, z } = c.home
      Object.entries(c.stickers).forEach(([face, mesh]) => {
        const idx = stickerIndexFor(face, x, y, z, N)
        const arr = this.disabledStickers[face]
        const isDis = Array.isArray(arr) ? arr.includes(idx) : !!arr?.has?.(idx)
        mesh.material.color.set(isDis ? COLORS.X : COLORS[face])
      })
    })
  }

  performMove(token, durationMs) {
    return new Promise(resolve => {
      const move = parseMoveToken(token, this.size)
      if (!move) { resolve(); return }
      const layerCubies = this.cubies.filter(c => c.logical[move.axis] === move.layer)
      this.rotatingGroup = new THREE.Group()
      this.scene.add(this.rotatingGroup)
      layerCubies.forEach(c => this.rotatingGroup.attach(c.group))

      const start = performance.now()
      const target = move.angle
      const axisVec = new THREE.Vector3(
        move.axis === 'x' ? 1 : 0,
        move.axis === 'y' ? 1 : 0,
        move.axis === 'z' ? 1 : 0,
      )
      const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
      const offset = (this.size - 1) / 2

      const step = now => {
        const t = Math.min(1, (now - start) / durationMs)
        this.rotatingGroup.setRotationFromAxisAngle(axisVec, target * easeInOut(t))
        if (t < 1) requestAnimationFrame(step)
        else {
          this.rotatingGroup.setRotationFromAxisAngle(axisVec, target)
          layerCubies.forEach(c => {
            this.scene.attach(c.group)
            c.logical.x = Math.round(c.group.position.x + offset)
            c.logical.y = Math.round(c.group.position.y + offset)
            c.logical.z = Math.round(c.group.position.z + offset)
            c.group.position.x = c.logical.x - offset
            c.group.position.y = c.logical.y - offset
            c.group.position.z = c.logical.z - offset
            snapRotation(c.group)
          })
          this.scene.remove(this.rotatingGroup)
          this.rotatingGroup = null
          resolve()
        }
      }
      requestAnimationFrame(step)
    })
  }

  dispose() {
    if (this._frame) cancelAnimationFrame(this._frame)
    if (this._ro) this._ro.disconnect()
    window.removeEventListener('resize', this._onWindowResize)
    window.removeEventListener('orientationchange', this._onOrientation)
    this.controls?.dispose()
    this.renderer?.dispose()
  }
}
