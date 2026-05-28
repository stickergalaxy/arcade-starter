/**
 * src/ui/ResultScreen.ts — post-game results UI
 *
 * Shown after the game ends. Calls postResult, displays midi awarded,
 * triggers trophy modal if one was earned.
 */

import * as sdk from '../sdk.js'
import { tgHaptic, tgMainButton } from '../tg.js'

let _el: HTMLElement | null = null
let _entryId = ''
let _startTime = 0  // ms (performance.now())

export function initResultScreen(): void {
  _el = document.getElementById('result-screen')!
}

export function setEntryContext(entryId: string, startTimeMs: number): void {
  _entryId = entryId
  _startTime = startTimeMs
}

export function showResultScreen(
  score: number,
  outcome: 'win' | 'loss' | 'draw',
  onPlayAgain: () => void,
): void {
  if (!_el) return
  _el.classList.remove('hidden')

  _el.innerHTML = `
    <div class="result-title">${outcome === 'win' ? '🎉 Win!' : '💀 Game Over'}</div>
    <div class="result-score">Score: <span>${score}</span></div>
    <div class="result-midi" id="result-midi-box">
      <div class="result-midi-label">Midi Earned</div>
      <div class="result-midi-value" id="result-midi-value">…</div>
    </div>
    <div class="result-trophy hidden" id="result-trophy"></div>
    <div class="result-rank" id="result-rank"></div>
    <button class="btn btn-primary" id="result-play-again">Play Again</button>
    <button class="btn btn-ghost" id="result-leaderboard">🏆 Leaderboard</button>
  `

  document.getElementById('result-play-again')?.addEventListener('click', () => {
    hideResultScreen()
    onPlayAgain()
  })

  document.getElementById('result-leaderboard')?.addEventListener('click', () => {
    // Leaderboard.ts exports showLeaderboard() — imported lazily to avoid circular deps
    import('./Leaderboard.js').then(({ showLeaderboard }) => showLeaderboard())
  })

  tgMainButton('Play Again', () => {
    hideResultScreen()
    onPlayAgain()
  })

  // Post result in the background
  postGameResult(score, outcome).catch(console.error)
}

export function hideResultScreen(): void {
  _el?.classList.add('hidden')
}

// ── Internal ─────────────────────────────────────────────────────────────────

async function postGameResult(
  score: number,
  outcome: 'win' | 'loss' | 'draw',
): Promise<void> {
  const durationSecs = Math.round((performance.now() - _startTime) / 1000)

  const result = await sdk.postResult(_entryId, {
    score,
    outcome,
    play_duration_seconds: Math.max(1, durationSecs),
    metadata: {
      game: 'tap_the_sticker',
      placeholder: true,
    },
  })

  renderResultData(result)
}

function renderResultData(result: sdk.SDKResponse<sdk.ResultData>): void {
  const midiEl  = document.getElementById('result-midi-value')
  const rankEl  = document.getElementById('result-rank')
  const trophyEl = document.getElementById('result-trophy')

  if (!result.success) {
    if (midiEl) {
      midiEl.textContent = '—'
      midiEl.title = result.error
    }
    if (rankEl) {
      rankEl.textContent = result.error.includes('session_token')
        ? 'Connect via the host bot for real midi rewards'
        : `Result: ${result.error}`
    }
    return
  }

  const data = result.data

  // v2 pattern: /result records but doesn't mint. Show Submit button.
  if (data.submits_remaining > 0 && data.projected_midi > 0) {
    if (midiEl) {
      midiEl.innerHTML = `
        Bank for <strong>+${data.projected_midi}</strong> midi
        <button id="result-submit-btn" style="margin-left:12px;padding:6px 14px;cursor:pointer;">
          Submit (${data.submits_remaining} left today)
        </button>
      `
      document.getElementById('result-submit-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('result-submit-btn') as HTMLButtonElement | null
        if (btn) { btn.disabled = true; btn.textContent = 'Banking…' }
        const submitResp = await sdk.submitResult(data.result_id)
        renderSubmittedState(submitResp)
      })
    }
  } else if (data.submits_remaining <= 0) {
    if (midiEl) midiEl.textContent = 'Daily cap reached — keep practicing!'
  } else {
    if (midiEl) midiEl.textContent = 'No midi (score: 0)'
  }

  if (rankEl && data.leaderboard_rank) {
    rankEl.textContent = `Tentative rank: #${data.leaderboard_rank} this month`
  }

  tgHaptic('selection')
  void trophyEl  // trophy mints at month-end cron, not on /result
}

function renderSubmittedState(resp: sdk.SDKResponse<sdk.SubmitData>): void {
  const midiEl   = document.getElementById('result-midi-value')
  const rankEl   = document.getElementById('result-rank')
  const trophyEl = document.getElementById('result-trophy')

  if (!resp.success) {
    if (midiEl) midiEl.textContent = `Submit failed: ${resp.error}`
    tgHaptic('warning')
    return
  }
  const data = resp.data
  if (midiEl) {
    midiEl.textContent = `+${data.midi_awarded} midi`
    midiEl.classList.add('animating')
    setTimeout(() => midiEl.classList.remove('animating'), 500)
  }
  if (rankEl && data.leaderboard_rank) {
    rankEl.textContent = `Rank: #${data.leaderboard_rank} (tentative until month-end)`
  }
  // Trophies mint at month-end cron, not here. Leave trophy slot empty.
  void trophyEl
  tgHaptic('success')
}
