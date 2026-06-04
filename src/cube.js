import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { resolveMove, parseAlgorithm, invertMove } from './moves.js'

// Re-exported so existing imports from './cube.js' keep working.
export { parseAlgorithm, invertMove }

export const COLORS = {
  U: '#ffe14a', D: '#f8f8f4', F: '#5cd66b', B: '#4a8eff',
  R: '#ff9a3c', L: '#ff4d4d', X: '#3a3a3f', K: '#0f0f12',
}

export const FACES = [
  { code: 'U', name: 'Up' }, { code: 'D', name: 'Down' },
  { code: 'F', name: 'Front' }, { code: 'B', name: 'Back' },
  { code: 'L', name: 'Left' }, { code: 'R', name: 'Right' },
]

export const SUPPORTED_SIZES = [2, 3]
export const DEFAULT_SIZE = 3
export const DEFAULT_ORIENTATION = { az: 38, pol: 58 }

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
    this.hintFacelets = false
    this._frame = null
    this._ro = null
    this._sharedBodyGeom = null
    this._sharedBodyMat = null
    this._sharedStickerGeom = null
    this._sharedHintGeom = null
    this._fading = false
    this.onOrientationChange = null
    this._onWindowResize = () => this.resize()
    this._onOrientation = () => setTimeout(() => this.resize(), 200)
    this._onControlsChange = () => {
      if (this.onOrientationChange) this.onOrientationChange(this.getOrientation())
    }
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
    this.controls.addEventListener('change', this._onControlsChange)

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

  getOrientation() {
    if (!this.controls) return { ...DEFAULT_ORIENTATION }
    const rad = 180 / Math.PI
    return {
      az: Math.round(this.controls.getAzimuthalAngle() * rad),
      pol: Math.round(this.controls.getPolarAngle() * rad),
    }
  }

  setOrientation({ az, pol }) {
    if (!this.camera || !this.controls) return
    const r = this.camera.position.length()
    const polarRad = Math.max(0.01, Math.min(Math.PI - 0.01, pol * Math.PI / 180))
    const azRad = az * Math.PI / 180
    const sph = new THREE.Spherical(r, polarRad, azRad)
    this.camera.position.setFromSpherical(sph)
    this.camera.lookAt(0, 0, 0)
    this.controls.update()
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
    if (this._fading) this._stepFade()
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  buildCube() {
    this.cubies.forEach(c => {
      this.scene.remove(c.group)
      Object.values(c.stickers).forEach(s => s.material.dispose())
      Object.values(c.hints || {}).forEach(h => h.material.dispose())
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

    // Hint facelets float outward along the face normal, beyond the cube body.
    const hintOffset = cubieSize / 2 + 0.9

    if (!this._sharedBodyGeom) {
      this._sharedBodyGeom = new RoundedBoxGeometry(cubieSize, cubieSize, cubieSize, 3, cubieRadius)
      this._sharedBodyMat = new THREE.MeshStandardMaterial({
        color: COLORS.K, roughness: 0.6, metalness: 0.0,
      })
      this._sharedStickerGeom = new RoundedBoxGeometry(stickerSize, stickerSize, 0.02, 3, stickerRadius)
      this._sharedHintGeom = new THREE.PlaneGeometry(stickerSize, stickerSize)
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
          const hints = {}
          const faceConfigs = [
            { face: 'R', cond: xi === last, dir: [ 1, 0, 0], rot: [0,  Math.PI / 2, 0] },
            { face: 'L', cond: xi === 0,    dir: [-1, 0, 0], rot: [0, -Math.PI / 2, 0] },
            { face: 'U', cond: yi === last, dir: [0,  1, 0], rot: [-Math.PI / 2, 0, 0] },
            { face: 'D', cond: yi === 0,    dir: [0, -1, 0], rot: [ Math.PI / 2, 0, 0] },
            { face: 'F', cond: zi === last, dir: [0, 0,  1], rot: [0, 0, 0] },
            { face: 'B', cond: zi === 0,    dir: [0, 0, -1], rot: [0, Math.PI, 0] },
          ]

          faceConfigs.forEach(fc => {
            if (!fc.cond) return
            const stickerMat = new THREE.MeshStandardMaterial({
              color: COLORS[fc.face],
              roughness: 0.32, metalness: 0.0,
            })
            const sticker = new THREE.Mesh(this._sharedStickerGeom, stickerMat)
            sticker.position.set(fc.dir[0] * stickerOffset, fc.dir[1] * stickerOffset, fc.dir[2] * stickerOffset)
            sticker.rotation.set(...fc.rot)
            group.add(sticker)
            stickers[fc.face] = sticker

            // Floating hint facelet (cubing.js technique): coplanar quad pushed
            // further out, rendered BackSide so it's only seen from the far side.
            const hintMat = new THREE.MeshBasicMaterial({
              color: COLORS[fc.face],
              transparent: true, opacity: 0.5,
              side: THREE.BackSide, depthWrite: false,
            })
            const hint = new THREE.Mesh(this._sharedHintGeom, hintMat)
            hint.position.set(fc.dir[0] * hintOffset, fc.dir[1] * hintOffset, fc.dir[2] * hintOffset)
            hint.rotation.set(...fc.rot)
            hint.visible = this.hintFacelets
            group.add(hint)
            hints[fc.face] = hint
          })

          this.scene.add(group)
          this.cubies.push({
            group, stickers, hints,
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

  applyDisabledMask(animate = false) {
    const N = this.size
    const apply = (mat, targetHex) => {
      if (animate) {
        mat.userData.from = mat.color.clone()
        mat.userData.target = new THREE.Color(targetHex)
      } else {
        mat.color.set(targetHex)
        mat.userData.from = null
        mat.userData.target = null
      }
    }
    this.cubies.forEach(c => {
      const { x, y, z } = c.home
      Object.entries(c.stickers).forEach(([face, mesh]) => {
        const idx = stickerIndexFor(face, x, y, z, N)
        const arr = this.disabledStickers[face]
        const isDis = Array.isArray(arr) ? arr.includes(idx) : !!arr?.has?.(idx)
        const target = isDis ? COLORS.X : COLORS[face]
        apply(mesh.material, target)
        const hint = c.hints?.[face]
        if (hint) apply(hint.material, target)
      })
    })
    if (animate) {
      this._fadeStart = performance.now()
      this._fading = true
    }
  }

  // Fade the highlight in from a fully-colored cube to the current mask.
  flashMaskIn() {
    this.cubies.forEach(c => {
      Object.entries(c.stickers).forEach(([face, m]) => m.material.color.set(COLORS[face]))
      Object.entries(c.hints || {}).forEach(([face, h]) => h.material.color.set(COLORS[face]))
    })
    this.applyDisabledMask(true)
  }

  setHintFacelets(on) {
    this.hintFacelets = !!on
    this.cubies.forEach(c => {
      Object.values(c.hints || {}).forEach(h => { h.visible = this.hintFacelets })
    })
  }

  _stepFade() {
    const dur = 280
    const t = Math.min(1, (performance.now() - this._fadeStart) / dur)
    const ease = t * (2 - t)
    const tint = mat => {
      if (!mat.userData.target || !mat.userData.from) return
      mat.color.copy(mat.userData.from).lerp(mat.userData.target, ease)
    }
    this.cubies.forEach(c => {
      Object.values(c.stickers).forEach(s => tint(s.material))
      Object.values(c.hints || {}).forEach(h => tint(h.material))
    })
    if (t >= 1) {
      this._fading = false
      const clear = mat => { mat.userData.from = null }
      this.cubies.forEach(c => {
        Object.values(c.stickers).forEach(s => clear(s.material))
        Object.values(c.hints || {}).forEach(h => clear(h.material))
      })
    }
  }

  performMove(token, durationMs) {
    return new Promise(resolve => {
      const move = resolveMove(token, this.size)
      if (!move) { resolve(); return }
      const layerSet = new Set(move.layers)
      const layerCubies = this.cubies.filter(c => layerSet.has(c.logical[move.axis]))
      this.rotatingGroup = new THREE.Group()
      this.scene.add(this.rotatingGroup)
      layerCubies.forEach(c => this.rotatingGroup.attach(c.group))

      const target = move.angle
      const axisVec = new THREE.Vector3(
        move.axis === 'x' ? 1 : 0,
        move.axis === 'y' ? 1 : 0,
        move.axis === 'z' ? 1 : 0,
      )
      const offset = (this.size - 1) / 2

      const finalize = () => {
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

      if (!durationMs || durationMs <= 0) {
        finalize()
        return
      }

      const start = performance.now()
      const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
      const step = now => {
        const t = Math.min(1, (now - start) / durationMs)
        this.rotatingGroup.setRotationFromAxisAngle(axisVec, target * easeInOut(t))
        if (t < 1) requestAnimationFrame(step)
        else finalize()
      }
      requestAnimationFrame(step)
    })
  }

  dispose() {
    if (this._frame) cancelAnimationFrame(this._frame)
    if (this._ro) this._ro.disconnect()
    window.removeEventListener('resize', this._onWindowResize)
    window.removeEventListener('orientationchange', this._onOrientation)
    this.controls?.removeEventListener('change', this._onControlsChange)
    this.controls?.dispose()
    this.renderer?.dispose()
  }
}
