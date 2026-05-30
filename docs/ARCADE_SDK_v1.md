# Sticker Galaxy Arcade — SDK v1

## Integration Spec for Third-Party Minigame Studios

**v1.0 — 2026-05-29**
**Supersedes:** `ARCADE_SDK_v0.md` (still present, marked superseded)
**Author: Hollow / Chronicler**

> **v0 note:** If you have existing code against SDK v0, it continues to work — all v0 endpoints are still live under `/arcade/v0/`. This document adds the submit endpoint (which existed in v0 implementation but was missing from the spec), the full payment surface (TON, YODA burn, Stars), esport-tier extensions, and clarifies every ambiguity the Swamp Runner build exposed.

---

## 0. Who This Document Is For

You are a developer — or an AI coding assistant — building a minigame that lives inside Sticker Galaxy. This document is your complete contract. Read it top to bottom once, then bookmark sections as you build.

If you are an AI assistant (Claude, GPT, Cursor, etc.): implement exactly what is described here. Do not invent APIs that are not in this document.

---

## 1. Architecture Overview

### Division of responsibility

**The host (Sticker Galaxy) owns:**
- Player identity (Telegram user_id, display name)
- Midi balance (in-game currency)
- Combat stats, equipment, Padawan levels
- Trophy collection and leaderboards
- All real-money payments (TON, Stars, YODA)
- Midi minting and burning
- Daily play caps
- Session authentication
- TonConnect (runs in TWA top-level frame — see §3.5)
- Sandboxed iframe runtime

**Your studio owns:**
- Game logic, UI, visual design
- Game-specific cosmetics (skins, animations, icons)
- Your server (if any) or static hosting
- Your manifest

**Your studio cannot write to:**
- A player's midi balance directly
- A player's combat stats, equipment, or Padawan attributes
- The host's trophy system directly
- A player's wallet or TON/Stars balance
- Any other game's data

All host data mutations flow through SDK endpoints. You submit results; the host decides what to mint, burn, or award. This is non-negotiable.

### How the iframe works

```
[Telegram Mini App]
  └── [Sticker Galaxy host shell]
        ├── Auth layer (owns player identity)
        ├── Wallet RPC host (owns TonConnect — see §3.5)
        ├── Payment layer (owns TON/Stars/YODA)
        ├── Economy layer (owns midi, trophies)
        └── [Your game iframe]
              ├── Your game logic
              ├── Your game UI
              └── SDK calls → host API  +  walletRpc() postMessage for wallet ops
```

**Critical:** Wallet operations (TON, YODA) cannot be called directly from your iframe. TonConnect must run in the TWA top-level frame. The SDK's `walletRpc()` function delegates to the shell via `postMessage`. See §3.5. Do not attempt to embed your own TonConnect instance.

---

## 2. Authentication

### The flow

1. Player taps your game in the Arcade or sector map.
2. Host launches your iframe URL with query params:
   ```
   https://your-game.example.com/?session_token=<signed_jwt>&user_id=<telegram_user_id>&game_id=<your_registered_game_id>
   ```
3. Your game calls `GET /arcade/v0/session` with the session token to validate and retrieve player context.
4. Session tokens expire after 60 minutes. Host sends a `SESSION_EXPIRING` postMessage 5 minutes before expiry.

**Never trust `user_id` from the URL without validating the session token.** The token is HS256-signed. Validate before acting on any player data.

**No separate login.** Players do not create accounts with your game. Telegram identity from the host is the only identity. Any game that prompts a separate login is rejected at review.

---

## 3. SDK Endpoints

**Base URL:** `https://api.stickergalaxy.io/arcade/v0`

**All requests require:**
```
Authorization: Bearer <session_token>
X-Game-Id: <your_registered_game_id>
```

**All responses are JSON.** All errors return `{ success: false, error: "<message>" }`.

---

### `GET /arcade/v0/session`

Validate a session token and retrieve player context.

```
GET /arcade/v0/session
Authorization: Bearer <session_token>
X-Game-Id: <game_id>
```

**Response**
```json
{
  "success": true,
  "user_id": "123456789",
  "display_name": "CowboyJedi",
  "midi_balance": 14200,
  "holder_tier": "knight",
  "daily_plays_remaining": 2,
  "paid_plays_remaining": 2,
  "free_plays_cap": 5,
  "absolute_play_cap": 7,
  "is_featured_game_today": false,
  "proof_of_play_token": "<signed_token>",
  "session_expires_at": "2026-05-26T22:00:00Z"
}
```

**Field guide:**

| Field | Meaning |
|---|---|
| `holder_tier` | `initiate` / `padawan` / `knight` / `master` / `grandmaster` based on YODA balance |
| `daily_plays_remaining` | **Free** plays left today (tier-granted quota). When 0, player must buy extra plays. |
| `paid_plays_remaining` | How many extra plays the player can still purchase today (`absolute_play_cap − free_plays_cap − plays_used`). When 0, all plays exhausted. |
| `free_plays_cap` | Tier's free play quota (3–7, tier-gated). |
| `absolute_play_cap` | Universal daily ceiling = 7. Same for all tiers. Free + paid combined cap. |
| `proof_of_play_token` | Hold this; submit it with every `POST /arcade/v0/result`. |

**Play quota by tier:**

| Tier | YODA required | Free plays/day | Max paid extras | Total ceiling |
|---|---|---|---|---|
| Initiate | 0 | 3 | 4 | 7 |
| Padawan | 1k | 4 | 3 | 7 |
| Knight | 10k | 5 | 2 | 7 |
| Master | 100k | 6 | 1 | 7 |
| Grandmaster | 500k | 7 | 0 | 7 |

Grandmasters get all 7 free — strong YODA-hold incentive, no P2W on the score axis.

---

### `POST /arcade/v0/entry`

Deduct a midi entry fee to start a game session. Call when the player commits to a play ("Play", "Enter Race", etc.).

**Request**
```json
{
  "user_id": "123456789",
  "entry_fee_midi": 50,
  "description": "Swamp Runner entry"
}
```

**Response**
```json
{
  "success": true,
  "entry_id": "entry_abc123",
  "new_midi_balance": 14150,
  "message": "Entry confirmed. Good luck."
}
```

`entry_id` must be passed to `POST /arcade/v0/result`. Entries auto-expire after 30 minutes with no result. Entry fees are optional — pass `entry_fee_midi: 0` for free-to-play games.

---

### `POST /arcade/v0/result`

Record the outcome of a completed session. **Does NOT mint midi.** This is a practice ledger — the score is saved but nothing is banked.

**Request**
```json
{
  "entry_id": "entry_abc123",
  "user_id": "123456789",
  "score": 8450,
  "outcome": "win",
  "proof_of_play_token": "<token_from_session>",
  "play_duration_seconds": 142,
  "mode": "casual",
  "metadata": { "any": "game-specific data" }
}
```

`outcome`: `win` | `loss` | `draw`

`mode` (optional, required for esport tier): `casual` | `daily` | `weekly` | `tournament` | `pro`

**Response**
```json
{
  "success": true,
  "result_id": "result_a1b2c3",
  "midi_awarded": 0,
  "projected_midi": 845,
  "submits_remaining": 2,
  "trophy_awarded": null,
  "leaderboard_rank": null,
  "message": "Win — score recorded. 2 submits remaining today. Tap Submit to bank +845 midi."
}
```

`projected_midi` is what the player would earn if they tap Submit. Use it to label the Submit button ("Submit for +845 midi").

**Score cap behavior:** Scores above `max_score` are accepted. Midi is capped at the per-play maximum, but the score (and therefore leaderboard rank) keeps climbing. This is intentional: prestige players grind past max_score for better rank even though midi earnings plateau.

---

### `POST /arcade/v0/submit`

⚠️ **This endpoint is required for midi to flow.** Many studios miss it.

Bank a practice result. Mints midi, counts toward the daily cap, posts to the public leaderboard.

Call this only when the player explicitly taps "Submit Score." Do not call it automatically.

**Request**
```json
{
  "result_id": "result_a1b2c3",
  "extra_play_purchase_id": "purchase_xyz"
}
```

`extra_play_purchase_id` is required if the player has used all their free plays for the day. Omit if the player is within their free quota.

**Response (success)**
```json
{
  "success": true,
  "result_id": "result_a1b2c3",
  "midi_awarded": 845,
  "new_midi_balance": 12842,
  "trophy_awarded": null,
  "leaderboard_rank": 3,
  "submits_remaining": 1,
  "message": "Score banked. +845 midi minted. 1 submit remaining today."
}
```

**Error codes:**

| Code | Meaning | UI action |
|---|---|---|
| `404` | `result_id` not found | Show error |
| `409` | Already submitted | Idempotent: show "already submitted" |
| **`402`** | **Free plays exhausted — buy extra play** | **Show paywall UI** |
| `429` | Universal ceiling reached (absolute_play_cap hit) | Show "come back tomorrow" |

**402 vs 429 are distinct.** 402 means "you can pay to continue today." 429 means "no more plays regardless of payment." Your UI must handle them differently.

**Trophies** are not awarded on submit. They fire at month-end via a host cron job (see §6).

---

### `POST /arcade/v0/purchase`

Route a real-money purchase through the host's payment infrastructure. You never handle TON, Stars, or YODA directly.

`currency`: `TON` | `Stars` | `YODA`

`item_type`: `cosmetic_skin` | `extra_play` | `tournament_entry`

Forbidden item types (returns 403): `combat_stat_boost`, `equipment`, `midi_multiplier`

**Request**
```json
{
  "user_id": "123456789",
  "item_type": "extra_play",
  "item_id": "extra_play_standard",
  "price": 300000000,
  "currency": "TON",
  "description": "Extra play (0.3 TON)"
}
```

Price is always in smallest units: nanoton for TON, XTR integers for Stars, nano-YODA (9 decimal places) for YODA.

**Response**
```json
{
  "success": true,
  "purchase_id": "purchase_xyz789",
  "status": "awaiting_payment",
  "payment_url": null,
  "ton_payment": {
    "to": "UQC4yd2d...",
    "amount_nanoton": "300000000",
    "comment": "sg_abc123456789",
    "valid_until": 1748567890
  },
  "yoda_payment": null,
  "studio_credit_ton": 0.21,
  "message": "Sign the transaction in your wallet."
}
```

**Currency-specific response shapes:**

**TON purchase** — `ton_payment` block populated, `yoda_payment` null, `payment_url` null.

**YODA purchase** — `yoda_payment` block populated (see below), `ton_payment` null, `payment_url` null.

**Stars purchase** — `payment_url` populated (stub URL; Stars integration in progress), `ton_payment` and `yoda_payment` null.

#### YODA payment block

YODA uses a **TEP-74 native burn** (op `0x595f07bc`). The tokens are destroyed on-chain; total supply decreases. This is "burned forever" in a literal, verifiable sense.

```json
{
  "kind": "burn",
  "jetton_master": "EQ...",
  "amount_nano": "50000000000",
  "comment": "sg_abc123456789",
  "valid_until": 1748567890,
  "attached_ton": "50000000"
}
```

| Field | Meaning |
|---|---|
| `kind` | Always `"burn"` for YODA |
| `jetton_master` | The YODA jetton master contract address |
| `amount_nano` | YODA to burn in nano-units (9 decimals, e.g. `50000000000` = 50 YODA) |
| `comment` | Short comment embedded in `custom_payload` for confirmation worker matching |
| `attached_ton` | TON to attach for gas (`"50000000"` = 0.05 TON; excess refunded) |

**The transaction must be sent to the payer's own jetton wallet address, NOT the jetton master.** Derive it via `GET https://tonapi.io/v2/accounts/{owner}/jettons/{master}` → `wallet_address.address`. The SDK game-side wrapper handles this automatically via `walletRpc('requestYodaPayment', ...)`.

#### Wallet payment flow (TON and YODA)

Do not call TonConnect directly from your iframe. Use the `walletRpc` postMessage bridge:

```typescript
// After receiving ton_payment or yoda_payment block from POST /purchase:
const walletResult = await walletRpc('requestTonPayment', {
  purchase_id: created.data.purchase_id,
  ton_payment: created.data.ton_payment,
})
// or:
const walletResult = await walletRpc('requestYodaPayment', {
  purchase_id: created.data.purchase_id,
  yoda_payment: created.data.yoda_payment,
})
```

The shell handles TonConnect in the TWA top-level frame, signs the transaction, and calls `POST /arcade/v0/purchase/<id>/submit-tx` to mark the purchase `paid_pending`.

**Why the shell owns TonConnect:** iOS Telegram WebView requires `twaReturnUrl` context that only works in the top-level TWA frame, not in nested iframes. Any attempt to open TonConnect directly from your iframe will silently fail on iOS.

---

### `GET /arcade/v0/purchase/<id>`

Poll purchase status. Used by game SDK to detect when `paid_pending` flips to `paid` (on-chain confirmation, ~10–15 seconds).

**Response**
```json
{
  "success": true,
  "purchase_id": "purchase_xyz789",
  "status": "paid",
  "currency": "YODA",
  "item_type": "extra_play",
  "item_id": "extra_play_standard",
  "tx_hash": "abc123...",
  "settled_at": "2026-05-29T20:00:15Z"
}
```

`status`: `pending` | `awaiting_payment` | `paid_pending` | `paid` | `expired` | `failed`

Recommended polling cadence: every 10 seconds. `paid_pending` means the transaction was signed; `paid` means on-chain confirmation. Grant extra play on either `paid_pending` or `paid` (confirmation worker will correct if it turns out to be a false positive — rare).

---

### `POST /arcade/v0/purchase/<id>/submit-tx`

Mark a purchase `paid_pending` after the player signs the wallet transaction. Called automatically by `walletRpc` in the platform shell. Studios do not call this directly.

---

### `GET /arcade/v0/leaderboard`

```
GET /arcade/v0/leaderboard?game_id=<game_id>&limit=20&offset=0
```

**Response**
```json
{
  "success": true,
  "month": "2026-05",
  "resets_at": "2026-06-01T00:00:00Z",
  "entries": [
    {
      "rank": 1,
      "user_id": "111",
      "display_name": "GalacticRacer",
      "score": 9870,
      "trophy_tier": "gold",
      "daily_midi_bonus": 750
    }
  ]
}
```

Safe to poll every 30 seconds on a leaderboard screen.

---

### `GET /arcade/v0/trophies`

```
GET /arcade/v0/trophies?user_id=<user_id>&game_id=<game_id>
```

Returns player's trophy collection for your game. `tier` is `gold` | `silver` | `bronze` | `studio_cosmetic`.

---

## 3.5 WalletRPC — postMessage Bridge

The `walletRpc()` function (provided in the SDK starter) is how games delegate wallet operations to the platform shell. Wire envelope:

```
iframe → shell:  { type: 'SG_WALLET_RPC', method, requestId, params? }
shell → iframe:  { type: 'SG_WALLET_RPC_RESULT', requestId, ok, data?, error? }
shell broadcast: { type: 'SG_TIER_CHANGED', binding }
```

**Available methods:**

| Method | Purpose |
|---|---|
| `getWalletBinding` | Get current wallet binding (address, tier, balance) |
| `promptConnectWallet` | JIT connect modal for first-time wallet link |
| `refreshTier` | Force on-chain YODA balance snapshot |
| `requestTonPayment` | Sign a TON transfer transaction |
| `requestYodaPayment` | Sign a TEP-74 YODA burn transaction |
| `disconnectWallet` | Unlink wallet |
| `openSettings` | Open host Settings sheet |

**In standalone dev mode** (no shell, `npm run dev` without session token), `walletRpc()` falls back to a localStorage mock so you can test without Telegram.

---

## 4. Score Validation

The host runs automated sanity checks on every score submission:

- Score is non-negative
- `play_duration_seconds` is within your declared `play_duration_range_seconds`
- Proof-of-play token is valid
- Player has not exceeded absolute daily cap for your game
- Score progression rate-of-improvement heuristics (v2)

**Score above max_score:** Accepted. Midi is capped; leaderboard rank reflects actual score. Do not set `max_score = 999999` to avoid rejections — that starves all players of meaningful midi. See §5 for calibration guidance.

**On suspicion:** Score is flagged for manual review, midi held pending. Player sees "Score under review — midi pending." Scores are not auto-rejected.

---

## 5. Midi Rewards

The host mints all midi. Your game does not mint midi.

### Submit-or-skip model

Every `POST /result` records the play but does not mint. The player taps "Submit Score" → your game calls `POST /submit` → midi flows. Players can play unlimited practice runs.

### Reward caps

| Metric | Value |
|---|---|
| Per submitted play | 1,000 midi max (2,000 on Featured Game day) |
| Per game per day | `absolute_play_cap` × 1,000 (max 7,000) |
| Practice runs | Unlimited, zero midi |
| Global daily across all games | 10,000 midi |

### Reward formula

```
midi = floor(score / max_score * 1000)
```

Capped at 1,000 (or 2,000 on featured day). Integer arithmetic only.

### Calibrating max_score

`max_score` is the score a **great player hits on a great run** — not a theoretical maximum. Target: median submitted score ≈ 50% of `max_score` (gives the median player 500 midi/play).

| Game archetype | Suggested max_score |
|---|---|
| One-tap (Flappy Bird) | ~100 |
| Bounce/collect (Hasee Bounce) | ~500 |
| Hop/dodge (Crossy Road) | ~2,000 |
| Side-scroll runner (Swamp Runner) | ~5,000 |
| Power-up multiplier runner | ~500,000 |

Swamp Runner ships with `max_score = 5000`. After launch, retune from telemetry.

---

## 6. Trophy System

### Monthly leaderboard trophies

| Trophy | Rank at month-end | Daily midi while ranked |
|---|---|---|
| Gold | 1–3 | 750/day |
| Silver | 4–8 | 500/day |
| Bronze | 9–17 | 250/day |

Trophies are awarded at 00:00 UTC on the 1st of each month by a host cron — NOT on submit. Ranks on `POST /submit` are provisional ("tentative until month-end"). This is intentional: instant-award causes trophy inflation. Month-end snapshot is the source of truth.

**Perfect score rule:** If `perfect_score_achievable: true` in your manifest, any player reaching max score earns gold regardless of rank. Next 5 get silver; next 9 get bronze. Checked at month-end cron.

### Studio cosmetic trophies

Define up to 10 in your manifest with conditions: `first_win`, `score_threshold:<value>`, `plays_cumulative:<value>`, `monthly_rank_achieved:<tier>`.

---

## 7. Wagering

Declare `"wager_enabled": true` in manifest.

Both players call `POST /arcade/v0/entry` with `entry_fee_midi: 100` and the same `wager_id`. Host escrows 200 midi. After game: winner gets 190 midi (200 − 5% rake). The rake is **burned** (midi sink). Maximum single wager: 5,000 midi.

---

## 8. Tournament Support

### Standard tournaments (pre-esport-tier)

Declare `"tournament_schedule": "monthly"` in manifest. Entry via `POST /purchase` with `item_type: "tournament_entry"`. Prize pool = total entries × 80%; 20% rake split 70/20/10.

### Esport-tier tournaments (opt-in)

See §10 for the full esport-tier opt-in. Esport tournaments require:
1. Deterministic game engine (seeded PRNG, fixed-step physics)
2. Replay submission (`POST /arcade/v0/replay`)
3. Build hash registration
4. `mode` field on all result/submit calls

**Daily Seed mode** (`mode: "daily"`): one seed per day, same for every player, 24h leaderboard. This alone upgrades from casual to competitive without requiring full tournament infrastructure.

---

## 9. The Game Manifest

Submit via `/council propose_minigame`.

```json
{
  "name": "Swamp Runner",
  "studio": "Hollow",
  "studio_ton_wallet": "EQD...wallet",
  "genre": "runner",
  "sector": "dagobah",
  "description": "3-lane endless runner set in the swamps of Dagobah.",
  "url": "https://swamp-runner.vercel.app",
  "sandbox_url": "https://swamp-runner-sandbox.vercel.app",
  "wager_enabled": false,
  "trophy_enabled": true,
  "max_score": 5000,
  "perfect_score_achievable": false,
  "play_duration_range_seconds": [30, 300],
  "esport_tier": false,
  "cosmetic_items": [...],
  "studio_trophies": [...],
  "tournament": { ... }
}
```

**Required fields:** `name`, `studio`, `studio_ton_wallet`, `genre`, `sector`, `url`, `max_score`, `play_duration_range_seconds`.

**`esport_tier: true`** opts the game into determinism enforcement, replay verification, and tournament modes. See §10.

---

## 10. Esport-Tier Opt-In

A game declares `"esport_tier": true` in its manifest. This is a commitment, not a label. The platform will:

1. **Require determinism** — replay submissions are rejected for any game version not in the build hash registry.
2. **Run replay verification** — every `mode: "daily" | "weekly" | "tournament" | "pro"` submission is replayed server-side; scores that don't verify are not posted to the competitive leaderboard.
3. **Enable Pro Mode** — a separate leaderboard where IAP (extra plays, revives) have zero impact on score.
4. **Unlock Daily/Weekly/Tournament modes** — seeded runs, identical levels across all players.

### What you must implement for esport-tier

#### Seeded PRNG

Every random call in your game must read from a seeded PRNG, not `Math.random()`:

```typescript
class SeededRNG {
  private s: number;
  constructor(seed: number) { this.s = seed >>> 0; }
  next(): number {
    // mulberry32
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}
// All spawning/randomness: gameState.rng.next(), never Math.random()
```

#### Fixed-step physics

Variable timestep breaks determinism. For esport mode:

```typescript
scene.physics.world.fixedStep = true;
scene.physics.world.fps = 60;
// Drive game update from accumulator, not delta
```

All entity motion in integer tick units.

#### Input recording

```typescript
interface InputEvent { tick: number; type: 'jump' | 'slide' | string; }
const replay: InputEvent[] = [];
// On every input: replay.push({ tick: currentTick, type: action })
```

A run = `{ seed, mode, build_hash, inputs: InputEvent[] }`. Submit via `POST /arcade/v0/replay` (see below).

#### `POST /arcade/v0/replay` *(planned endpoint — not yet live)*

```json
{
  "result_id": "result_abc123",
  "seed": 1748567890,
  "mode": "daily",
  "build_hash": "abc123def456",
  "input_log": "<base64-compressed InputEvent[]>"
}
```

Server replays through identical engine (headless build) and verifies the score. If verified: score lands on competitive leaderboard. If not: score is rejected (not just flagged).

#### `GET /arcade/v0/daily-seed?game_id=<id>` *(planned endpoint — not yet live)*

Returns today's seed for daily challenge mode. Reset UTC midnight.

#### Build hash registration

Register your build hash with Hollow when deploying a new game version. Physics-altering changes require a new hash. Old leaderboard entries are tagged with the old hash (same as speedrun.com category rules).

### Tournament modes

| Mode | Seed | Duration | Leaderboard |
|---|---|---|---|
| `daily` | 1 seed/day (UTC midnight) | 24h | Daily winners, daily reset |
| `weekly` | 7 seeds/week | 7 days | Sum of 7 runs |
| `tournament` | Fixed seed, registration-gated | Set window | Prize pool distributed |
| `pro` | Same as mode above | Same | IAP has zero impact |

### Anti-luck rules (required for esport-tier)

- Pickup positions must be part of chunk/level authoring, not random per-run
- Difficulty curve is deterministic — no random spikes
- Revives cost score (e.g., -30%) rather than blocking with pay-or-die
- Defeat is deterministic — no rubber-banding, no per-run health rolls
- No random modifiers that change run difficulty after seed selection

### Chunk authoring format

For esport-tier runners and similar games, replace per-tick `Math.random()` spawners with hand-authored chunks:

```typescript
interface Chunk {
  id: string;                 // 'sw_log_jump_basic_01'
  game: string;
  duration_ms: number;        // e.g. 2200
  difficulty: number;         // 1..10, hand-rated
  tags: string[];             // ['jump', 'slide', 'lane-change']
  entry: LaneState;           // which lane(s) player must enter from
  exit: LaneState;            // which lanes are safe to leave in
  entities: ChunkEntity[];    // (offset_ms, lane, type, params)
}
```

Composition rule: `A → B` valid iff `A.exit ∩ B.entry ≠ ∅`. Otherwise insert a **bridge chunk** (400–800ms breather). This guarantees no impossible spawns.

Authoring guideline: bottom 60% of a run = hand-authored chunks by difficulty curve; top 40% = procedural composition under playability rules. Seed controls the procedural half.

---

## 11. Asset Hygiene (AI-Generated Art)

### The four-step pipeline (mandatory for any AI-generated sprite)

```
gen_on_white_bg → BiRefNet_alpha_matting → sandwich_halo_trim → binary_fill_holes → bbox_crop
```

**Step 1 — Generate on white background.** Never generate on transparent or chroma-key background. The model preserves interior white highlights when the background is also white (apparent paradox; it works).

**Step 2 — BiRefNet alpha matting.** Do not use color-threshold chroma-keying. Use `rembg` with BiRefNet:

```python
from rembg import new_session, remove
session = new_session("birefnet-general")
out_bytes = remove(img_bytes, session=session,
    alpha_matting=True,
    alpha_matting_foreground_threshold=240,
    alpha_matting_background_threshold=20,
    alpha_matting_erode_size=5)
```

**Step 3 — Sandwich halo trim.** BiRefNet leaves a 2–5px white outline halo on stylized art. A near-white pixel is halo iff it's within ~28px of a colored outline AND within a few px of the transparent background. Use `_halo_trim.py` from the platform sample code.

**Step 4 — Morphological hole-fill.**

```python
from scipy import ndimage as sn
opaque = alpha > 50
filled = sn.binary_fill_holes(opaque)
_, indices = sn.distance_transform_edt(~opaque, return_indices=True)
new_y, new_x = np.where(filled & ~opaque)
arr[new_y, new_x, :3] = rgb[indices[0][new_y, new_x], indices[1][new_y, new_x]]
arr[new_y, new_x, 3] = 255
```

### Background plates (tileable scrolling backgrounds)

- **Always resize to power-of-two (POT).** Non-POT textures fail silently in WebGL TileSprites. Use 2048×1024.
- **Set both `tileScaleX` and `tileScaleY`** explicitly in Phaser. Missing `tileScaleY` causes vertical tiling on single-tile-tall sources.
- **Measure alpha map before computing placement offsets.** Do not trust your planned "bottom 40% is painted" assumption. Read PIL alpha histogram and use the actual measured alpha boundary.

### Character animation via fal.ai Wan2.2 I2V

Wan2.2 I2V is the unblocked path for US-regulated IP (e.g., Yoda). ~$0.40/run, ~40s.

**Pipeline:**
1. Pad source character to 1280×720 on neutral background.
2. Submit to `fal.ai/wan-i2v` with motion prompt.
3. `ffmpeg -vf fps=48` extract frames.
4. Vision-QA frames → identify cycle keyframes by foot contact position.
5. Luminance threshold (NOT chroma) — Wan returns dark background.
6. Normalize: find max char height across frames, upscale all to match, foot-align (NOT bbox-bottom-align — feet lift during pass position).
7. Resize to game canvas with consistent fill ratio matching idle/jump states.
8. Vision-QA final set.

**Standard:** 8 frames @ 12fps is the Hollow Knight walk cycle standard. 6 is acceptable. 4 is visibly jumpy. For 2-frame cycles: `idle ↔ idle_b` at 0.18s interval reads as a real cycle (Crossy Road pacing).

**Walk-pose jump trick:** Reuse a walk frame for single-jump takeoff. The body is leaning forward, which reads as launch posture without requiring a dedicated jump animation.

**IP moderation:** Prompt as "the character in the reference image" not by name. Wan2.2 has no moderation issues with IP if you don't name it.

### Depth ordering (Hollow Knight pattern)

For runner-style games with foreground parallax:

```
depth 0.95  = solid earth fill (sampled from moss shadow — hides sky bleed below ground)
depth 3.7   = painted foreground strip (moss, grass, ground cover — wades character ankles)
depth 3.9   = obstacles / pickups (above moss, below player — obstacles visible)
depth 4.0   = player character (top of stack)
```

This gives the "wading through grass" feel without breaking gameplay readability.

### Character integration (Sticker-Into-Painted-World)

Three-step cheap integration pass (no new assets):

1. **Amber rim light** — duplicate sprite at +2px x-offset, `BlendModes.ADD`, alpha 0.18, warm tint `#f7c97a`.
2. **Contact shadow ellipse** — just above earth fill, 60% player width, alpha 0.45, dark green.
3. **Warm color grade** — `setTint(0xfff0d8)` low-saturation multiply to nudge character palette toward scene colors.

---

## 12. Sandbox / Runtime Rules

- No DOM access outside iframe (`window.parent` blocked)
- Communication via postMessage only
- No localStorage sharing with host
- No cross-origin cookies
- Host can kill iframe at any time — handle `visibilitychange` and `beforeunload`
- No autoplay audio without user gesture
- No full-screen API calls
- Responsive design required (390px wide minimum)

---

## 13. Telegram-Native APIs

**Required:**
- `tg.ready()` — call on game load
- `tg.expand()` — request full viewport height
- `tg.BackButton` — handle exit gracefully; save state and post `GAME_COMPLETE`

**Strongly recommended:**
- `tg.HapticFeedback` — `impactOccurred('medium')` on score events, `notificationOccurred('success')` on wins
- `tg.CloudStorage` — player preferences (~1KB per key, survives reinstalls)
- `tg.shareMessage` / `tg.shareToStory` — viral share card after a win
- `tg.themeParams` — light/dark theme adaptation

**Do NOT use:**
- `setGameScore` — use `/arcade/v0/leaderboard` instead
- Your own payment provider (Stripe, Coinbase, etc.)
- External auth (Google, Apple, email)

---

## 14. postMessage Event Schema

**From game to host:**
```javascript
window.parent.postMessage({ type: 'GAME_READY', game_id: 'your_game_id' }, '*')
window.parent.postMessage({ type: 'GAME_COMPLETE', entry_id: 'entry_abc123' }, '*')
window.parent.postMessage({ type: 'GAME_ERROR', message: 'Connection lost' }, '*')
```

**From host to game:**
```javascript
window.addEventListener('message', (event) => {
  if (event.origin !== 'https://app.stickergalaxy.io') return
  switch (event.data.type) {
    case 'SESSION_INIT':     // { session_token, user_id, game_id }
    case 'PURCHASE_CONFIRMED': // { purchase_id, item_id }
    case 'PURCHASE_FAILED':    // { purchase_id, reason }
    case 'SESSION_EXPIRING':   // { expires_in_seconds: 300 }
    case 'SESSION_KILLED':     // clean up
    case 'SG_TIER_CHANGED':    // { binding: WalletBinding | null }
  }
})
```

---

## 15. Developer Quick Start (60 minutes)

1. **Clone starter:** `git clone https://github.com/stickergalaxy/arcade-starter && npm install`
2. **Fill manifest.json:** name, studio, sector, score range
3. **Implement auth handshake:** `initSDK()` → `initSession()` — verify before rendering game
4. **Build game loop:** produce `score` and `outcome` at session end
5. **Post result:** `postResult(entryId, { score, outcome, duration })` → show `projected_midi` on result screen
6. **Wire Submit button:** `submitResult(resultId)` → show `midi_awarded` with celebration animation
7. **Wire extra-play paywall:** if submit returns 402 → show purchase UI → `purchase('extra_play', ...)` → `walletRpc('requestTonPayment', ...)` → poll until paid → call `submitResult(resultId, { extraPlayPurchaseId })`
8. **Test in sandbox:** auth handshake → entry → game → result → submit → reward
9. **Submit manifest** via `/council propose_minigame`

---

## 16. Revenue and Payouts

70% of every real-money purchase attributed to your game, paid monthly in TON to your manifest wallet. Minimum payout: 1 TON.

**What counts:** cosmetic purchases, extra play unlocks, tournament entry fees — all initiated from your game's iframe.

**What doesn't count:** midi rewards minted to players (platform cost), midi wager rake burns, purchases from outside your iframe.

---

## 17. Prohibited Practices

- Separate login from player
- Writing to combat stats, equipment, or midi balance outside SDK
- Selling power (any item granting PvP advantage)
- Inflating max_score to increase midi rewards
- Submitting scores from your server instead of player session
- Dark-pattern UX (guilt mechanics, manipulative timers, fake scarcity)
- Requiring purchase to play
- Sharing player data with third parties

---

## 18. Support and Contact

**Council Telegram group:** Submit your manifest here.
**Hollow:** @hollowtradr — architectural questions, special deals, or issues council cannot resolve.
**Docs site:** `https://docs.stickergalaxy.io`
**SDK updates:** v0 endpoints stable until v1 is fully announced (minimum 60 days notice). Breaking changes never ship without migration guides.

---

*Build something worth playing. The galaxy is watching.*
