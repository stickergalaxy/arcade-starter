// src/game/state.ts — Replace with your own model. Keep `phase`.
export interface GameState {
  score: number
  phase: 'idle' | 'playing' | 'ended'
}
export const createInitialState = (): GameState => ({ score: 0, phase: 'idle' })
