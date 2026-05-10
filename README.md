# 🧊 gube

A 3D editor and visualizer for Rubik's cube algorithms. Play a formula, mark which stickers matter, and share the whole thing as a URL.

Supports both **2×2×2** and **3×3×3** cubes.

## ✨ Features

- ▶️ Play, pause and step through any algorithm (UDFBLR notation with `'` and `2`)
- 🎨 Gray out stickers that don't matter for the algorithm, piece by piece
- 📦 Switch between 2×2 and 3×3 with one click without losing your flow
- 🔗 Share the full config via link (state lives in the URL hash)
- 🪟 Embed it in a lean, transparent iframe (`embed.html`)
- 📱 Mobile-first UI (bottom sheet) that turns into a side panel on desktop
- ⚡ Lightweight Three.js rendering, no server required

## 🚀 Getting started

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173/gube/`.

Production build:

```bash
npm run build
npm run preview
```

Deploy to GitHub Pages:

```bash
npm run deploy
```

## 🧠 How it works

The core piece is `CubeRenderer` in `src/cube.js`. It takes a `size` (2 or 3), builds cubies on integer coordinates `0..N-1`, and centers them in world space by subtracting `(N-1)/2`. Each move isolates the right layer, animates the rotation with easing, then re-snaps positions and rotations to avoid floating-point drift.

Disabled stickers are serialized per face in base 36, with width proportional to `N²` bits. A typical URL looks like:

```
#n=2&a=RUR-URU2R-&m=000F00
```

Where `n` is the cube size, `a` is the algorithm (`'` becomes `-` for URL safety) and `m` is the mask.

## 🗂️ Layout

```
src/
  cube.js         Three.js renderer + algorithm parser
  presets.js      ready-made algorithms (Sune, T-Perm, etc.)
  url.js          state encode/decode for the URL hash
  App.vue         full editor
  Embed.vue       minimal version for iframes
  styles.css      dark theme with glow
```

## 🛣️ Roadmap

- 🟦 4×4×4 (needs a parser for wide and slice moves like `Rw`, `2R`)
- 🎬 GIF capture of an algorithm
- 🔁 More presets covering full OLL/PLL
- 🖱️ Drag to turn a layer directly on the cube

## 📜 License

[GNU GPLv3](LICENSE). Copyright (C) 2025 Fernando Guisso.
