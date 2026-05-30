/**
 * src/ui/HUD.ts — In-game heads-up display.
 *
 * Minimal: shows live score (and optionally a timer / midi balance).
 * Replace / extend this with whatever your game needs during play.
 *
 * Mount: #hud in index.html (styled in style.css).
 */

import { type GameState } from '../game/state.js'

let _hudEl: HTMLElement | null = null
let _scoreEl: HTMLElement | null = null
let _metaEl: HTMLElement | null = null

export function initHUD(): void {
  const app = document.getElementById('app')!
  if (document.getElementById('hud')) return

  const hud = document.createElement('div')
  hud.id = 'hud'

  const scoreEl = document.createElement('div')
  scoreEl.className = 'hud-score'
  scoreEl.textContent = '0'

  const metaEl = document.createElement('div')
  metaEl.className = 'hud-meta'

  hud.appendChild(scoreEl)
  hud.appendChild(metaEl)
  app.appendChild(hud)

  _hudEl = hud
  _scoreEl = scoreEl
  _metaEl = metaEl
}

export function showHUD(): void {
  _hudEl?.classList.add('visible')
}

export function hideHUD(): void {
  _hudEl?.classList.remove('visible')
}

export function updateHUD(state: GameState, midiBalance: number | null): void {
  if (_scoreEl) _scoreEl.textContent = String(state.score)
  if (_metaEl && midiBalance !== null) {
    _metaEl.textContent = `⚡ ${midiBalance.toLocaleString()}`
  }
}
