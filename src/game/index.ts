/**
 * src/game/index.ts — placeholder game ("Tap to Score")
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  THIS IS THE SLOT. Replace the body of startGame() with your game.  │
 * │  Contract: call opts.onEnd(score, outcome) when your run is done.   │
 * └──────────────────────────────────────────────────────────────────────┘
 */
import { createInitialState, type GameState } from './state.js'

export interface GameOpts {
  container: HTMLElement
  onEnd: (score: number, outcome: 'win' | 'loss' | 'draw') => void
}

let _state: GameState = createInitialState()
let _timer: ReturnType<typeof setInterval> | null = null
let _el: HTMLElement | null = null
let _opts: GameOpts | null = null

export const getGameState = (): GameState => _state

// ── TODO: replace everything below with your real game ───────────────────────

export function startGame(opts: GameOpts): void {
  _opts = opts
  _state = { ...createInitialState(), phase: 'playing' }

  const el = document.createElement('div')
  el.style.cssText = 'position:absolute;inset:0;background:#111;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;font-family:Fraunces,Georgia,serif;'

  const countdown = document.createElement('div')
  countdown.style.cssText = 'font-size:48px;color:#d4a820;font-weight:700;'
  countdown.textContent = '5'

  const scoreEl = document.createElement('div')
  scoreEl.style.cssText = 'font-size:22px;color:#f5ecd6;'
  scoreEl.textContent = 'Score: 0'

  const btn = document.createElement('button')
  btn.style.cssText = 'font-family:Fraunces,serif;font-size:18px;padding:16px 40px;background:rgba(212,168,32,.2);border:2px solid #d4a820;border-radius:12px;color:#d4a820;cursor:pointer;'
  btn.textContent = '✦ Tap to score!'
  btn.addEventListener('click', () => {
    _state.score += 100
    scoreEl.textContent = `Score: ${_state.score}`
  })

  el.append(countdown, scoreEl, btn)
  opts.container.appendChild(el)
  _el = el

  let s = 5
  _timer = setInterval(() => {
    countdown.textContent = String(--s)
    if (s <= 0) stopGame()
  }, 1000)
}

export function stopGame(): void {
  if (_timer) { clearInterval(_timer); _timer = null }
  _el?.remove(); _el = null
  if (_state.phase === 'playing') {
    _state.phase = 'ended'
    _opts?.onEnd(_state.score, _state.score > 0 ? 'win' : 'loss')
  }
}
