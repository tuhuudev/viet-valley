# viet-valley

A cozy, procedural 3D web scene with a Vietnamese theme, built with Three.js. The MVP scene is **Đèo Hải Vân**: a Thống Nhất train runs along a mountainside above the sea, through tunnels and over bridges. Day/night cycle, 3 cameras.

- Plan: `C:\Users\nguye\.claude\plans\shimmying-baking-clarke.md`
- Stack: Vite + TypeScript + three. No other runtime dependencies. Noise and PRNG are hand-written in `src/core`.
- Scripts: `npm run dev` · `npm run typecheck` · `npm test` (vitest, logic only) · `npm run build`
- Dev debug handle: `window.__vv` (DEV only).

## Architecture
- `world/heightfield.ts`: raw terrain (sea at +z, mountain at −z, edges taper into the sea).
- `world/track.ts`: pure. Railway at a fixed altitude along the contour, smoothed, ends pulled into the mountain. Each sample is classified as cut / tunnel / bridge by terrain clearance. Tests are in `tests/track.test.ts`.
- `world/terrain.ts`: carves a ledge along the cut segments, then builds the low-poly mesh with vertex colours.
- `world/railway.ts`: ballast, rails, sleepers (instanced), bridges (red parapet + pillars), tunnel portals.
- `world/train.ts`: locomotive + 5 carriages follow the curve by arc length. Cars that straddle the wrap point are hidden (both ends are inside tunnels).
- `env/sky.ts`: gradient dome + stars, sun/moon, fog, keyframed palette. T cycles through `PRESETS`.
- `cameras.ts`: overview (OrbitControls) / follow / window. Wider FOV on portrait screens.

## Rules
- MVP scope is frozen. Phase 2 (weather, boat, music, post-FX, random map, donate) only starts **after the scene is public and has real feedback**.
- Music must be CC0 or self-made.
- Deploy is a user gate: `npm run build && wrangler pages deploy dist --project-name viet-valley`.
