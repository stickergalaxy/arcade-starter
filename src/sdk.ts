/// <reference types="vite/client" />
/**
 * src/sdk.ts — Sticker Galaxy Arcade SDK v0 wrapper
 *
 * Wraps every arcade endpoint with:
 *   - Authorization: Bearer <session_token>  (from URL params)
 *   - X-Game-Id: <game_id>                   (from URL params / env)
 *
 * Every method returns { success: true, data } or { success: false, error }.
 * It NEVER throws to game code.
 *
 * SDK spec: https://docs-site-taupe-pi.vercel.app/sdk/
 */

// ── Config ──────────────────────────────────────────────────────────────────

const API_BASE: string =
  (import.meta.env.VITE_ARCADE_API_URL as string | undefined) ??
  'https://babyyoda-bot.vercel.app'

// ── URL param helpers ────────────────────────────────────────────────────────

function getParam(key: string): string {
  const params = new URLSearchParams(window.location.search)
  return params.get(key) ?? ''
}

// ── Module state ─────────────────────────────────────────────────────────────

let _sessionToken: string = ''
let _userId: string = ''
let _gameId: string = ''
let _proofOfPlayToken: string = ''

// ── Types ────────────────────────────────────────────────────────────────────

export interface SDKResult<T> {
  success: true
  data: T
}
export interface SDKError {
  success: false
  error: string
}
export type SDKResponse<T> = SDKResult<T> | SDKError

export interface SessionData {
  user_id: string
  display_name: string
  midi_balance: number
  daily_plays_remaining: number
  is_featured_game_today: boolean
  proof_of_play_token: string
  session_expires_at: string
}

export interface EntryData {
  entry_id: string
  new_midi_balance: number
  message: string
}

export interface ResultPayload {
  score: number
  outcome: 'win' | 'loss' | 'draw'
  play_duration_seconds: number
  metadata?: Record<string, unknown>
}

export interface ResultData {
  result_id: string
  midi_awarded: number          // always 0 in v2 — mint happens at /submit
  projected_midi: number        // what /submit would mint
  submits_remaining: number     // bankable runs left today
  trophy_awarded: TrophyData | null  // always null in v2 — trophies mint at month-end cron
  leaderboard_rank: number | null    // provisional; label as "tentative until month-end"
  message: string
}

export interface SubmitData {
  result_id: string
  midi_awarded: number
  new_midi_balance: number
  trophy_awarded: TrophyData | null  // null in v2 — trophies mint at month-end cron
  leaderboard_rank: number | null    // updated post-submit
  submits_remaining: number
  message: string
}

export interface TrophyData {
  trophy_id: string
  name: string
  tier: string
  awarded_at: string
  description?: string
}

export interface PurchaseData {
  purchase_id: string
  payment_url: string
  studio_credit_ton: number
  message: string
}

export interface LeaderboardEntry {
  rank: number
  user_id: string
  display_name: string
  score: number
  trophy_tier: string | null
  daily_midi_bonus: number
}

export interface LeaderboardData {
  month: string
  resets_at: string
  entries: LeaderboardEntry[]
}

export interface TrophiesData {
  trophies: TrophyData[]
}

// ── Internal fetch wrapper ───────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<SDKResponse<T>> {
  const url = `${API_BASE}${path}`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${_sessionToken}`,
    'X-Game-Id': _gameId,
    ...(options.headers as Record<string, string> ?? {}),
  }

  try {
    const res = await fetch(url, { ...options, headers })
    const json = (await res.json()) as Record<string, unknown>

    if (!res.ok || json.success === false) {
      return {
        success: false,
        error: (json.error as string) ?? `HTTP ${res.status}`,
      }
    }

    return { success: true, data: json as unknown as T }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: `Network error: ${message}` }
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Bootstrap the SDK from URL params.
 * Call this once before any other SDK method.
 */
export function initSDK(): void {
  _sessionToken =
    getParam('session_token') ||
    (import.meta.env.VITE_ARCADE_SESSION_TOKEN as string | undefined) ||
    ''
  _userId = getParam('user_id') || ''
  _gameId =
    getParam('game_id') ||
    (import.meta.env.VITE_ARCADE_GAME_ID as string | undefined) ||
    'starter_dev'
}

/** Validate session token and fetch player context. Caches proof_of_play_token. */
export async function initSession(): Promise<SDKResponse<SessionData>> {
  if (!_sessionToken) {
    return {
      success: false,
      error: 'No session_token found. Launch this game from @stickergalaxybot or add ?session_token=... for local dev.',
    }
  }

  const result = await apiFetch<SessionData>('/arcade/v0/session')
  if (result.success) {
    _proofOfPlayToken = result.data.proof_of_play_token
    _userId = _userId || result.data.user_id
  }
  return result
}

/**
 * Deduct a midi entry fee to start a play session.
 * Pass entryFeeMidi = 0 for free-to-play games.
 */
export async function postEntry(
  entryFeeMidi: number,
  description?: string,
): Promise<SDKResponse<EntryData>> {
  return apiFetch<EntryData>('/arcade/v0/entry', {
    method: 'POST',
    body: JSON.stringify({
      user_id: _userId,
      entry_fee_midi: entryFeeMidi,
      description: description ?? 'Game entry',
    }),
  })
}

/**
 * Record the outcome of a completed play session.
 *
 * **v2 semantics:** /result is UNLIMITED and does NOT mint midi. It returns
 * a result_id + projected_midi + submits_remaining. To bank a run (mint midi,
 * post to leaderboard), call submitResult(result_id) when the player taps a
 * "Submit Score" button.
 *
 * Must be called with an entry_id from postEntry.
 */
export async function postResult(
  entryId: string,
  payload: ResultPayload,
): Promise<SDKResponse<ResultData>> {
  return apiFetch<ResultData>('/arcade/v0/result', {
    method: 'POST',
    body: JSON.stringify({
      entry_id: entryId,
      user_id: _userId,
      score: payload.score,
      outcome: payload.outcome,
      proof_of_play_token: _proofOfPlayToken,
      play_duration_seconds: payload.play_duration_seconds,
      metadata: payload.metadata ?? {},
    }),
  })
}

/**
 * Bank a practice result (v2). Mints midi, counts toward daily cap, updates
 * leaderboard. Trophies are NOT awarded here — they mint at month-end via
 * the host cron.
 *
 * Call this only when the player explicitly chooses to submit a run (e.g.
 * taps a "Submit Score" button). Idempotent: 409 if already submitted.
 *
 * Errors: 404 unknown result_id, 409 already submitted, 429 daily cap.
 */
export async function submitResult(
  resultId: string,
): Promise<SDKResponse<SubmitData>> {
  return apiFetch<SubmitData>('/arcade/v0/submit', {
    method: 'POST',
    body: JSON.stringify({ result_id: resultId }),
  })
}

/**
 * Route a real-money purchase through the host's payment infrastructure.
 * item_type: 'cosmetic_skin' | 'extra_play' | 'tournament_entry'
 * currency:  'TON' | 'Stars' | 'YODA'
 */
export async function purchase(
  itemType: 'cosmetic_skin' | 'extra_play' | 'tournament_entry',
  itemId: string,
  price: number,
  currency: 'TON' | 'Stars' | 'YODA',
  description: string,
): Promise<SDKResponse<PurchaseData>> {
  return apiFetch<PurchaseData>('/arcade/v0/purchase', {
    method: 'POST',
    body: JSON.stringify({
      user_id: _userId,
      item_type: itemType,
      item_id: itemId,
      price,
      currency,
      description,
    }),
  })
}

/** Fetch the current month's leaderboard for this game. */
export async function getLeaderboard(
  limit = 20,
  offset = 0,
): Promise<SDKResponse<LeaderboardData>> {
  return apiFetch<LeaderboardData>(
    `/arcade/v0/leaderboard?game_id=${encodeURIComponent(_gameId)}&limit=${limit}&offset=${offset}`,
  )
}

/** Fetch the current player's trophy collection for this game. */
export async function getTrophies(): Promise<SDKResponse<TrophiesData>> {
  return apiFetch<TrophiesData>(
    `/arcade/v0/trophies?user_id=${encodeURIComponent(_userId)}&game_id=${encodeURIComponent(_gameId)}`,
  )
}

// ── postMessage bridge ───────────────────────────────────────────────────────

type HostMessageType =
  | 'SESSION_INIT'
  | 'PURCHASE_CONFIRMED'
  | 'PURCHASE_FAILED'
  | 'SESSION_EXPIRING'
  | 'SESSION_KILLED'

type HostMessageHandler = (data: Record<string, unknown>) => void

const _listeners: Partial<Record<HostMessageType, HostMessageHandler>> = {}

/** Register a listener for host→game postMessage events. */
export function onHostMessage(
  type: HostMessageType,
  handler: HostMessageHandler,
): void {
  _listeners[type] = handler
}

/** Send a game→host postMessage. */
export function postMessageBridge(
  type: string,
  extra: Record<string, unknown> = {},
): void {
  window.parent.postMessage({ type, game_id: _gameId, ...extra }, '*')
}

// Bootstrap the message listener once
window.addEventListener('message', (event: MessageEvent) => {
  // In production, restrict to: if (event.origin !== 'https://app.stickergalaxy.io') return
  const data = event.data as Record<string, unknown>
  if (typeof data?.type !== 'string') return
  const handler = _listeners[data.type as HostMessageType]
  handler?.(data)
})

// ── postMessage RPC helper ───────────────────────────────────────────────────
//
// Generic request-reply bridge: sends {type, requestId, ...payload} to the
// parent shell and waits for {type + '_REPLY', requestId, ok, data, error}.
// Used by sdk.shareToStory (SG_SHARE_TO_STORY → SG_SHARE_TO_STORY_REPLY).

function rpcCall<T>(
  type: string,
  payload: Record<string, unknown>,
  timeoutMs: number = 8000,
): Promise<SDKResponse<T>> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || window.parent === window) {
      resolve({ success: false, error: 'shell_required' })
      return
    }
    const requestId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? (crypto as { randomUUID(): string }).randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const replyType = `${type}_REPLY`
    const timer = setTimeout(() => {
      window.removeEventListener('message', onMsg)
      resolve({ success: false, error: `rpc_timeout_${type}` })
    }, timeoutMs)

    function onMsg(e: MessageEvent): void {
      const d = e.data as {
        type?: string
        requestId?: string
        ok?: boolean
        data?: unknown
        error?: string
      } | null
      if (!d || d.type !== replyType || d.requestId !== requestId) return
      clearTimeout(timer)
      window.removeEventListener('message', onMsg)
      if (d.ok) resolve({ success: true, data: d.data as T })
      else resolve({ success: false, error: d.error ?? 'rpc_failed' })
    }
    window.addEventListener('message', onMsg)
    window.parent.postMessage({ type, requestId, ...payload }, '*')
  })
}

// ── YODA-374: scheduleReactivation ───────────────────────────────────────────

export type ReactivationTrigger = 'daily_reset'

export interface ScheduleReactivationOptions {
  trigger: ReactivationTrigger
  /** Optional override. Default copy generated by host if omitted. */
  message?: string
}

export interface ScheduleReactivationData {
  schedule_id: number
  deliver_at: string  // ISO8601 UTC
}

/**
 * Schedule a Telegram DM reactivation for the player.
 *
 * v0 supports only `trigger: 'daily_reset'` — fires when the player's
 * tier-quota plays refresh (currently midnight UTC; player-TZ scheduling
 * coming in a later SDK).
 *
 * Per playbook (TON Foundation April 2026 p27-28): the bot is the retention
 * engine. Tie messages to immediate playable value, not generic announcements.
 *
 * Idempotent within a calendar day per (player, game, trigger).
 */
export async function scheduleReactivation(
  opts: ScheduleReactivationOptions,
): Promise<SDKResponse<ScheduleReactivationData>> {
  return apiFetch<ScheduleReactivationData>('/arcade/v0/reactivation/schedule', {
    method: 'POST',
    body: JSON.stringify(opts),
  })
}

// ── YODA-375: shareToStory ───────────────────────────────────────────────────

export type ShareTemplate = 'high_score' | 'trophy_earned' | 'tournament_result'

export interface ShareToStoryOptions {
  template: ShareTemplate
  /** Template-specific payload fields. */
  templateData: Record<string, unknown>
  /** deeplink URL — host appends ?startapp=<referrer_uuid> automatically. */
  deeplink?: string
  /** Optional text caption for the Story. */
  caption?: string
}

/**
 * Share a branded story card to Telegram Stories.
 *
 * Sends a SG_SHARE_TO_STORY postMessage to the host shell. The shell renders
 * the card template on a Canvas, uploads it to the platform backend, and
 * calls Telegram WebApp shareToStory with the resulting public URL.
 *
 * Only call this from within a Telegram Mini App context (requires shell).
 * Fails gracefully with {success: false, error: 'shell_required'} when
 * running standalone.
 */
export async function shareToStory(
  opts: ShareToStoryOptions,
): Promise<SDKResponse<{ shared: boolean }>> {
  return rpcCall<{ shared: boolean }>('SG_SHARE_TO_STORY', opts as Record<string, unknown>, 8000)
}

// ── YODA-376: getReferral ────────────────────────────────────────────────────

export interface ReferralData {
  code: string
  deeplink: string
  shared_count: number      // friends who opened via this code
  rewarded_count: number    // friends who completed onboarding
  total_midi_earned: number
}

/**
 * Fetch this player's referral code, deeplink, and attribution stats.
 *
 * The referral code is stable per player and is created lazily on first call.
 * Pass the deeplink to friends. When they open the bot via the link, they are
 * attributed and the referrer earns midi on their first session completion.
 */
export async function getReferral(): Promise<SDKResponse<ReferralData>> {
  return apiFetch<ReferralData>('/arcade/v0/referral')
}

// ── Accessors ────────────────────────────────────────────────────────────────

export function getGameId(): string  { return _gameId }
export function getUserId(): string  { return _userId }
export function hasToken(): boolean  { return _sessionToken.length > 0 }
