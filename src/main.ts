/**
 * src/main.ts — Entry point
 *
 * Boot sequence:
 *   1. tgReady()           — signal Telegram, expand to full screen
 *   2. initSDK()           — read session_token / game_id from URL params
 *   3. initSession()       — validate token, fetch player context
 *   4. createTitleScreen() — parchment title with fireflies + god-rays
 *   5. startGame()         — your game runs; calls onEnd(score, outcome)
 *   6. postResult()        — get projected_midi + result_id
 *   7. createResultScreen()— show score, reward slot, submit CTA
 *   8. submitResult()      — player taps "Submit" → midi mints
 *
 * To replace the game: edit src/game/index.ts (see README there).
 * Everything else (title, leaderboard, result screen, settings) is wired here.
 */

import './style.css'
import * as sdk from './sdk.js'
import { tgReady, tgBackButton, tgHaptic } from './tg.js'
import { startGame, stopGame } from './game/index.js'
import { initHUD, showHUD, hideHUD, updateHUD } from './ui/index.js'
import {
  createTitleScreen,
  createResultScreen,
  createLeaderboard,
  createSettingsModal,
  mountFireflies,
  mountGodRays,
  mountTapBurst,
} from '@stickergalaxy/arcade-ui'
import type {
  LeaderboardEntry,
  ResultScreenAction,
} from '@stickergalaxy/arcade-ui'
import { onHostMessage, postMessageBridge } from './sdk.js'
import { getGameState } from './game/index.js'

// Import manifest for the game name (Vite resolves JSON imports at build time)
import manifest from '../manifest.json'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SessionData {
  user_id: string
  display_name: string
  midi_balance: number
  daily_plays_remaining: number
  proof_of_play_token: string
  session_expires_at: string
}

// ── Module state ──────────────────────────────────────────────────────────────

let _session: SessionData | null = null
let _midiBalance: number | null = null
let _entryId: string = ''

// ── Boot ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // 1. Signal Telegram + expand
  tgReady()

  // 2. Bootstrap SDK (reads URL params / .env)
  sdk.initSDK()

  // 3. Wire up HUD (invisible until game starts)
  const app = getApp()
  initHUD()

  // 4. Wire up host messages
  onHostMessage('SESSION_EXPIRING', () => {
    console.warn('[arcade] Session expiring in 5 min — save state!')
  })
  onHostMessage('SESSION_KILLED', () => {
    stopGame()
  })
  onHostMessage('PURCHASE_CONFIRMED', (data) => {
    console.log('[arcade] Purchase confirmed:', data)
  })

  // 5. Back button — clean exit
  tgBackButton(() => {
    stopGame()
    postMessageBridge('GAME_COMPLETE', { entry_id: _entryId })
  })

  // 6. Signal host
  postMessageBridge('GAME_READY')

  // 7. Build loading screen inline (removed after session loads)
  const loadingEl = buildLoadingScreen(app)

  // 8. Validate session
  const isDev = new URLSearchParams(window.location.search).get('dev') === '1'
  const sessionResult = await sdk.initSession()

  loadingEl.remove()

  if (!sessionResult.success) {
    if (!isDev) {
      console.warn('[arcade] Session error:', sessionResult.error)
    }
    // Boot in demo mode — full visual experience, no real midi
    showTitle(null)
    return
  }

  _session = sessionResult.data
  _midiBalance = _session.midi_balance
  showTitle(_session)
}

// ── Loading screen ────────────────────────────────────────────────────────────

function buildLoadingScreen(parent: HTMLElement): HTMLElement {
  const el = document.createElement('div')
  el.style.cssText = `
    position:absolute;inset:0;z-index:100;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    gap:16px;background:var(--bg,#1a3320);
  `
  el.innerHTML = `
    <div class="spinner"></div>
    <div style="font-family:'Fraunces',Georgia,serif;font-size:13px;color:var(--text-muted,#d4c89a);">
      Connecting to Sticker Galaxy…
    </div>
  `
  parent.appendChild(el)
  return el
}

// ── Title screen ──────────────────────────────────────────────────────────────

function showTitle(session: SessionData | null): void {
  const app = getApp()
  const isDemo = session === null
  const gameName = (manifest as { name?: string }).name ?? 'Arcade Game'

  // Hero slot — replace this div with your character art / logo
  const heroSlot = document.createElement('div')
  heroSlot.style.cssText = `
    width:120px;height:120px;border-radius:12px;
    border:2px dashed rgba(212,168,32,0.4);
    display:flex;align-items:center;justify-content:center;
    font-size:13px;color:rgba(212,168,32,0.7);text-align:center;
    font-family:'Fraunces',serif;line-height:1.4;padding:8px;
  `
  heroSlot.textContent = 'Your game art here'

  const titleEl = createTitleScreen({
    eyebrow: 'Sticker Galaxy Arcade',
    gameName,
    tagline: 'A Sticker Galaxy arcade game',
    heroSlot,
    metaStrip: isDemo
      ? null
      : {
          displayName: session!.display_name,
          balance: `⚡ ${session!.midi_balance.toLocaleString()}`,
          playsLeft: `${session!.daily_plays_remaining} run${session!.daily_plays_remaining !== 1 ? 's' : ''} left`,
        },
    ctaLabel: 'Begin Run',
    onCta: () => {
      titleEl.remove()
      beginGame()
    },
    iconButtons: [
      {
        glyph: '🏆',
        label: 'Leaderboard',
        ariaLabel: 'Open leaderboard',
        onClick: () => openLeaderboard(app),
      },
      {
        glyph: '⚙️',
        label: 'Settings',
        ariaLabel: 'Open settings',
        onClick: () => openSettings(app),
      },
    ],
    effects: true,
    onMount: (el) => {
      // Wire tap-burst to title CTA area
      mountTapBurst(el)
    },
  })

  // Mount fireflies and god-rays into the title screen
  mountFireflies(titleEl)
  mountGodRays(titleEl)

  app.appendChild(titleEl)
}

// ── Game flow ─────────────────────────────────────────────────────────────────

async function beginGame(): Promise<void> {
  const app = getApp()

  // Register the play (0 = free-to-play)
  const entryResult = await sdk.postEntry(0, `${manifest.name ?? 'Game'} round`)
  if (entryResult.success) {
    _entryId = entryResult.data.entry_id
    _midiBalance = entryResult.data.new_midi_balance
  } else {
    console.warn('[arcade] postEntry failed (demo mode):', entryResult.error)
  }

  const startTime = performance.now()
  showHUD()
  tgHaptic('impact_light')

  // HUD update loop
  const hudInterval = setInterval(() => {
    const state = getGameState()
    updateHUD(state, _midiBalance)
    if (state.phase === 'ended') clearInterval(hudInterval)
  }, 100)

  // Start the game. Replace src/game/index.ts with your real game.
  startGame({
    container: app,
    onEnd: async (score, outcome) => {
      clearInterval(hudInterval)
      hideHUD()
      tgHaptic(outcome === 'win' ? 'success' : 'warning')

      const durationSeconds = Math.round((performance.now() - startTime) / 1000)
      await showResult(app, score, outcome, durationSeconds)
    },
  })
}

// ── Result screen ─────────────────────────────────────────────────────────────

async function showResult(
  parent: HTMLElement,
  score: number,
  outcome: 'win' | 'loss' | 'draw',
  durationSeconds: number,
): Promise<void> {
  // Post result to get projected midi
  const resultResp = await sdk.postResult(_entryId, {
    score,
    outcome,
    play_duration_seconds: durationSeconds,
  })

  const projectedMidi = resultResp.success ? resultResp.data.projected_midi : 0
  const resultId = resultResp.success ? resultResp.data.result_id : ''
  const submitsRemaining = resultResp.success ? resultResp.data.submits_remaining : 0

  // Build reward slot
  const rewardSlot = buildRewardSlot(projectedMidi, submitsRemaining, resultId)

  // Build actions
  const actions: ResultScreenAction[] = [
    {
      label: '▶ Play Again',
      variant: 'primary',
      onClick: () => {
        resultEl.remove()
        showTitle(_session)
      },
    },
    {
      label: '🏆 Leaderboard',
      variant: 'ghost',
      onClick: () => openLeaderboard(parent),
    },
  ]

  const resultEl = createResultScreen({
    outcome,
    score,
    scoreLabel: 'Score',
    rewardSlot,
    actions,
  })
  void score // used in rewardSlot above

  parent.appendChild(resultEl)
}

function buildRewardSlot(
  projectedMidi: number,
  submitsRemaining: number,
  resultId: string,
): HTMLElement {
  const slot = document.createElement('div')
  slot.style.cssText = `display:flex;flex-direction:column;align-items:center;gap:10px;width:100%;`

  if (submitsRemaining === 0) {
    const cap = document.createElement('div')
    cap.style.cssText = `font-family:'Fraunces',serif;font-size:13px;color:var(--text-muted,#d4c89a);text-align:center;`
    cap.textContent = 'Daily cap reached — come back tomorrow'
    slot.appendChild(cap)
    return slot
  }

  const midiBlock = document.createElement('div')
  midiBlock.style.cssText = `
    background:rgba(0,0,0,0.15);border:1px solid rgba(160,120,60,0.4);
    border-radius:8px;padding:10px 24px;text-align:center;width:100%;
  `
  midiBlock.innerHTML = `
    <div style="font-family:'Fraunces',serif;font-size:11px;text-transform:uppercase;
      letter-spacing:0.1em;color:rgba(212,168,32,0.7);margin-bottom:4px;">Midi Earned</div>
    <div id="midi-amount" style="font-family:'Cinzel Decorative',serif;font-size:28px;
      font-weight:900;color:var(--gold-ink,#d4a820);">+${projectedMidi}</div>
    <div style="font-size:11px;color:var(--text-muted,#d4c89a);margin-top:4px;">
      ${submitsRemaining} submit${submitsRemaining !== 1 ? 's' : ''} remaining today
    </div>
  `
  slot.appendChild(midiBlock)

  const submitBtn = document.createElement('button')
  submitBtn.style.cssText = `
    font-family:'Fraunces',serif;font-size:15px;padding:12px 28px;
    background:rgba(212,168,32,0.25);border:2px solid var(--gold-ink,#d4a820);
    border-radius:12px;color:var(--gold-ink,#d4a820);cursor:pointer;
    width:100%;transition:opacity 0.2s;
  `
  submitBtn.textContent = `✦ Submit for +${projectedMidi} midi`
  submitBtn.addEventListener('click', async () => {
    submitBtn.disabled = true
    submitBtn.style.opacity = '0.5'
    submitBtn.textContent = 'Submitting…'
    tgHaptic('impact_medium')

    const submitResp = await sdk.submitResult(resultId)
    if (submitResp.success) {
      _midiBalance = submitResp.data.new_midi_balance
      const awarded = submitResp.data.midi_awarded
      const rankLabel = submitResp.data.leaderboard_rank
        ? ` · Rank #${submitResp.data.leaderboard_rank}`
        : ''
      submitBtn.textContent = `✓ +${awarded} midi${rankLabel}`
      submitBtn.style.background = 'rgba(74,122,16,0.3)'
      submitBtn.style.borderColor = '#4a7a10'
      submitBtn.style.color = '#6aad1a'
      tgHaptic('success')

      // Schedule reactivation (DM when daily plays reset)
      sdk.scheduleReactivation({ trigger: 'daily_reset' }).catch(() => {/* non-critical */})
    } else {
      submitBtn.textContent = `Error: ${submitResp.error}`
      submitBtn.style.borderColor = '#ef4444'
      submitBtn.style.color = '#ef4444'
      submitBtn.disabled = false
      submitBtn.style.opacity = '1'
    }
  })
  slot.appendChild(submitBtn)

  return slot
}

// ── Leaderboard overlay ───────────────────────────────────────────────────────

async function openLeaderboard(parent: HTMLElement): Promise<void> {
  // Remove any existing leaderboard
  parent.querySelector('.arcade-ui-leaderboard')?.remove()

  const lbEl = createLeaderboard({
    entries: [],
    loading: true,
    currentUserId: sdk.getUserId(),
    onClose: () => lbEl.remove(),
  })
  parent.appendChild(lbEl)

  const resp = await sdk.getLeaderboard(20, 0)
  if (resp.success) {
    const entries: LeaderboardEntry[] = resp.data.entries.map((e) => ({
      user_id: e.user_id,
      display_name: e.display_name,
      score: e.score,
      rank: e.rank,
      trophy_tier: (e.trophy_tier as 'gold' | 'silver' | 'bronze' | null) ?? undefined,
      daily_midi_bonus: e.daily_midi_bonus ?? undefined,
    }))
    lbEl.remove()
    const filled = createLeaderboard({
      entries,
      currentUserId: sdk.getUserId(),
      month: resp.data.month,
      onClose: () => filled.remove(),
    })
    parent.appendChild(filled)
  } else {
    lbEl.remove()
    const err = createLeaderboard({
      entries: [],
      error: resp.error,
      currentUserId: sdk.getUserId(),
      onClose: () => err.remove(),
    })
    parent.appendChild(err)
  }
}

// ── Settings modal ────────────────────────────────────────────────────────────

function openSettings(parent: HTMLElement): void {
  parent.querySelector('.arcade-ui-settings-modal')?.remove()

  const modal = createSettingsModal({
    sections: [
      {
        id: 'game',
        label: 'Game',
        rows: [
          {
            // Example toggle — shows studios the pluggable pattern.
            // Replace with your game's own options.
            kind: 'toggle',
            title: 'Sound Effects',
            sub: 'Toggle in-game sound.',
            defaultChecked: localStorage.getItem('arcade_sfx') !== 'false',
            onChange: (v) => {
              localStorage.setItem('arcade_sfx', v ? 'true' : 'false')
              console.log('[arcade] SFX:', v)
            },
          },
        ],
      },
    ],
    accountRows: [
      {
        kind: 'button',
        title: 'Wallet & connections',
        sub: 'Connect, disconnect, or switch wallets.',
        onClick: () => {
          // Delegate to the shell — wallet is shell-owned (see MINIGAME_BUILDER_GUIDE §3)
          sdk.postMessageBridge('SG_WALLET_RPC', { method: 'openSettings', tab: 'wallet' })
        },
      },
    ],
    onClose: () => modal.remove(),
  })

  parent.appendChild(modal)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getApp(): HTMLElement {
  const el = document.getElementById('app')
  if (!el) throw new Error('#app element missing from index.html')
  return el
}

// ── Boot ──────────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error('[arcade] Fatal boot error:', err)
})
