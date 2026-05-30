# src/game/ — Your Game Goes Here

This directory contains the placeholder game ("Tap to Score").
**Delete everything in here and replace it with your game.**

## The contract

`startGame(opts)` is the only entry point `main.ts` calls.

```typescript
export interface GameOpts {
  container: HTMLElement   // mount your game into this element
  onEnd: (score: number, outcome: 'win' | 'loss' | 'draw') => void
}

export function startGame(opts: GameOpts): void {
  // your game logic here
  // when the run ends:
  opts.onEnd(finalScore, 'win')   // or 'loss' / 'draw'
}
```

That's the whole contract. Three things:

1. **Render** into `opts.container`
2. **Call** `opts.onEnd(score, outcome)` when the run ends
3. **Export** `stopGame()` so `main.ts` can clean up if the player exits early

## What happens after onEnd

`main.ts` takes over:
1. Calls `sdk.postResult()` → gets `projected_midi` and `submits_remaining`
2. Shows the Result Screen (from `@stickergalaxy/arcade-ui`)
3. If player taps "Submit Score", calls `sdk.submitResult()` → mints midi
4. Shows "Play Again" → loops back to the title screen

You don't need to think about any of that. Just call `onEnd`.

## Score design

Set `max_score` in `manifest.json` to what a skilled human can achieve in
a decent run. The starter placeholder can score up to ~500 taps × 100 = 50,000
in 5 seconds (unrealistic). Set your `max_score` based on real playtesting.

See `docs/MINIGAME_BUILDER_GUIDE.md §8` for the score calibration guide.

## State

`state.ts` exports a minimal `GameState` type. Replace it with whatever
your game needs. Just keep `phase: 'idle' | 'playing' | 'ended'` —
`main.ts` uses it to check if the game has ended.

## Engine choice

No engine is prescribed. Use Phaser, Pixi, Three.js, raw Canvas 2D, WebGL,
or anything else. Vite will bundle it. Keep the `@stickergalaxy/arcade-ui`
import for the UI layer — don't re-implement parchment, leaderboards, or
result screens.
