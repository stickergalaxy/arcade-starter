# DECISIONS.md — v2 Rewrite Notes (YODA-379)

Decisions made during the v2 rewrite that go beyond the spec.

---

## `@stickergalaxy/arcade-ui` is published; no local path needed

The spec said to verify whether the package exists on npm before importing it.
Verified: `npm view @stickergalaxy/arcade-ui` returns 0.1.0 published publicly.
`package.json` pins `^0.1.0` directly from the registry. No local path override.

## `src/ui/ResultScreen.ts` and `src/ui/Leaderboard.ts` deleted

These v1 files hand-rolled what arcade-ui now provides. They were replaced by
`createResultScreen()` and `createLeaderboard()` from `@stickergalaxy/arcade-ui`.
No logic was lost — both are now richer (podium a11y, parchment surface, etc.).

## `src/game/render.ts` deleted

v1 placeholder had a separate render module. The v2 placeholder is
self-contained in `src/game/index.ts` (< 80 lines). No reason to split it.

## `startGame()` now takes an `opts` object, not a bare callback

v1 called `startGame(onGameEnd)`. v2 calls `startGame({ container, onEnd })`.
Added `container` so the game has a DOM element to mount into, which is
necessary for engine-agnostic usage (Phaser Scene, Pixi Application, Canvas,
etc. all need a DOM target).

## Loading screen is inline, not a static #loading-screen div

v1 relied on a static `#loading-screen` div in index.html that was hidden with
`.hidden`. v2 builds the loading screen dynamically and removes it after the
session call resolves. This keeps `index.html` minimal and avoids a flash of
the loading screen after hot-reload.

## `?dev=1` URL param activates demo mode

The spec mentioned `?dev=1` as the fallback. Implemented: when `?dev=1` is in
the URL and session fails, the game boots in demo mode with null session.
The title screen shows a demo meta strip (null → shows demo banner).

## `sdk.postMessageBridge` exported and used in main.ts

`postMessageBridge` was already a public export in sdk.ts. Used directly in
main.ts for `GAME_READY`, `GAME_COMPLETE`, and the wallet settings delegation.
No wrapper needed.

## Settings modal includes one example game toggle

Per spec: studios should see the pluggable pattern. Added a "Sound Effects"
toggle that persists to `localStorage`. No audio is actually implemented —
it's purely illustrative of the `onChange` pattern.

## `scheduleReactivation` called after successful submit

Called non-critically (errors swallowed) after a successful `submitResult` so
the player gets a DM when their plays reset. This is the recommended pattern
from ARCADE_STUDIO_LEVERAGE_PLAYBOOK.md and is already in sdk.ts.

## `noUnusedLocals` and `noUnusedParameters` enabled in tsconfig.json

v1 had no strict options beyond `strict: true`. Added these to catch dead code
early. Studios may need to disable temporarily while building out their game.

## Manifest JSON imported via Vite JSON import

`import manifest from '../manifest.json'` — Vite resolves this at build time
and tree-shakes unused fields. Used only for `manifest.name` in the title
screen so the game name stays in one place. Studios update `manifest.json`
and the title screen updates automatically.

---

*Written 2026-05-30 during YODA-379 execution.*
