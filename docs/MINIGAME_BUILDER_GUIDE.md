# Sticker Galaxy Minigame Builder Guide

**For the next studio (or future-Grant) who wants to ship a competitive, monetized, esport-tier game without rediscovering everything we learned building Swamp Runner.**

**Written:** 2026-05-29
**Based on:** Swamp Runner v1–v6, YODA payment flow (TEP-74 burn), and esport architecture research

---

**For AI assistants:** see [`llms.txt`](llms.txt) for the full context bundle.

## Preface: What This Guide Is

This is not a reference document. The SDK spec (`ARCADE_SDK_v1.md`) is the reference. This is the tutorial — opinionated, conversational, and full of "we learned this the hard way" callouts marked with 🔴.

Read this once when starting a new minigame. It will save you days.

---

## Table of Contents

1. [Before You Write Code](#1-before-you-write-code)
2. [The Gameplay Loop You Must Implement](#2-the-gameplay-loop-you-must-implement)
3. [Payments: TON, YODA Burn, Stars](#3-payments-ton-yoda-burn-stars)
4. [The Daily Play Economy](#4-the-daily-play-economy)
5. [Art Direction: Painterly Plates and AI Characters](#5-art-direction-painterly-plates-and-ai-characters)
6. [Character Animation via fal.ai Wan2.2](#6-character-animation-via-falai-wan22)
7. [Building for Esport Tier](#7-building-for-esport-tier)
8. [Score Design: The Most Important Knob](#8-score-design-the-most-important-knob)
9. [Testing Checklist](#9-testing-checklist)
10. [Common Mistakes](#10-common-mistakes)
11. [Ship Order](#11-ship-order)

---

## 1. Before You Write Code

### Pick your sector and character first

Every Sticker Galaxy minigame lives in a sector. Your visual language, your character, your lore voice — all of these flow from the sector. Swamp Runner is in Dagobah: swamps, mist, Baby Yoda wading through moss. Make that decision before you open an IDE.

**Why it matters for art:** If you know your sector, you can generate all your backgrounds in one generation pass with a coherent prompt. If you decide mid-build, you'll generate three different style backgrounds and they won't match.

### Decide whether you're building for esport tier

This is a day-one architectural decision that is nearly impossible to retrofit. If you might want:
- Daily Challenge mode
- Weekly tournaments
- Head-to-head racing
- Pro Mode leaderboards

...then you need determinism from the first line of game logic. See §7. It costs maybe 10% extra upfront effort and saves 3–4x the effort to add later.

If you're building a casual betting game (e.g., Podrace Betting) with no direct player control of randomness, esport tier is not relevant.

### Set up your manifest `max_score` on day one

I can't tell you how many hours I wasted because I set `max_score = 99999` to "avoid false rejections" and then every player earned 1 midi per run. Set it based on the comparable-game anchor table in SDK §5. You can retune after launch, but starting right saves the confusion of "why is nobody earning any midi?"

---

## 2. The Gameplay Loop You Must Implement

The SDK has a specific flow. Get this right or nothing works.

```
initSDK()
  └── initSession()         -- get proof_of_play_token, player context
        └── postEntry(0)    -- create entry row (even for free-to-play)
              └── [GAME PLAYS]
                    └── postResult(entryId, { score, outcome, duration })
                          -- returns projected_midi
                          └── [PLAYER SEES RESULT SCREEN]
                                -- Show "Submit for +845 midi" button
                                └── submitResult(resultId)
                                      -- THIS is when midi mints
```

🔴 **The #1 integration mistake:** calling `postResult` and expecting midi to appear. It won't. Midi only flows from `submitResult`. You must wire the "Submit Score" button explicitly. The result screen is not the end of the flow.

🔴 **The #2 integration mistake:** calling `submitResult` automatically without a player tap. The spec is clear: the player chooses which runs to submit. This is the Neopets pattern — players bank their best run, not every run. It reduces the "I played 10 games but only earned for 3" confusion.

### What the result screen should show

After `postResult` returns:
1. Display score and outcome
2. Big "Submit for +{projected_midi} midi" button
3. Secondary "Play Again" button
4. If `submits_remaining === 0`: replace Submit with "Cap reached — keep practicing"
5. If `daily_plays_remaining === 0` AND `paid_plays_remaining > 0`: show "Buy Extra Play" button

The Submit button is the dopamine moment. `midi_awarded` on `/submit` success should trigger a celebration animation with the number. This is where players feel the reward. Do not underinvest here.

---

## 3. Payments: TON, YODA Burn, Stars

### The architecture in one sentence

Your game never touches money. You call `purchase()` in the SDK → the SDK calls the backend → the backend returns a payment block → your game calls `walletRpc()` to hand it to the shell → the shell runs TonConnect → the shell tells your game when it's done.

### Why `walletRpc()` and not direct TonConnect

🔴 **TonConnect will silently fail on iOS if you run it inside an iframe.** Apple's Telegram WebView requires `twaReturnUrl` context that only exists in the top-level TWA frame. The platform shell runs in that frame. Your game iframe does not. Any attempt to embed TonConnect in your game will work fine on desktop/Android and mysteriously break for half your players on iOS.

The `walletRpc()` postMessage bridge exists to solve this. Use it. It's in the starter SDK.

**Codified in production:** there is exactly one postMessage envelope (`SG_WALLET_RPC`) and one host-side dispatcher. New capabilities (share-to-story, reactivation scheduling) attach as new `method` cases inside that dispatcher — never as parallel listeners. See §12 for the incident that crystallized this rule.

### TON purchases

```typescript
// 1. Create purchase row
const created = await sdk.requestPurchase(
  'extra_play',      // item_type
  'extra_play_std',  // item_id
  300_000_000,       // 0.3 TON in nanoton
  'Extra play',
  'TON'
)
// created.data.ton_payment is the payment block

// 2. Delegate to shell for signing
// (requestPurchase in sdk.ts v0.3 handles this automatically)
```

After signing, the shell calls `POST /purchase/<id>/submit-tx` automatically. Your game polls `GET /arcade/v0/purchase/<id>` until status is `paid_pending` or `paid`. Grant the extra play on `paid_pending` (confirmation is near-certain; the worker will correct failures).

Confirmation typically takes 10–15 seconds after signing.

### YODA purchases — the burn path

YODA uses TEP-74 native burn. This means the tokens are literally destroyed on-chain — `total_supply` decreases. The narrative "burned forever 🔥" is now actually true, not just a label on a treasury wallet.

The YODA payment block from the backend looks like:

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

The critical thing: `amount_nano` is nano-YODA (9 decimals), so `50000000000` = 50 YODA. The transaction goes to the **payer's own jetton wallet** (not the master), and the shell derives that address automatically via tonapi.io.

**Why 50 YODA?** Two reasons: (a) it's ≈0.5% of the Knight threshold, too small to threaten any holder's tier; (b) it promotes the YODA token without creating perverse incentives where spending erodes your in-game status.

🔴 **Do not price YODA purchases high enough to drop a player's tier.** Initiate→Padawan is 1k YODA. If you charge 500 YODA per extra play, a Padawan who buys two extra plays drops to Initiate mid-session. This creates a "spending punishes you" dynamic that kills conversion. 50 YODA is the right order of magnitude — symbolic, not sacrificial.

### Stars purchases

Stars via `tg.openInvoice` is still in progress. The `payment_url` stub is returned but the bot-payments integration isn't wired yet. **Use TON or YODA for production monetization. Don't block on Stars.**

### The confirmation worker pattern

Don't try to confirm payments synchronously. The pattern is:
1. Player signs → `paid_pending`
2. Backend worker polls tonapi.io every ~10s looking for inbound tx matching `comment` (TON) or `JettonBurn` event matching `custom_payload` (YODA)
3. Worker flips to `paid`
4. Game polls `GET /purchase/<id>` at the same ~10s cadence

The worker is running on the server. You don't implement it. Your game just polls.

---

## 4. The Daily Play Economy

Understanding this prevents you from shipping broken UI.

### The two-tier cap

Every player has:
- **Free plays** (3–7 depending on YODA tier): completely free, no payment required
- **Paid plays** (up to 7 total per day, filling the gap between free_plays_cap and 7): costs TON or YODA per play

Session response gives you everything you need:
```json
{
  "daily_plays_remaining": 2,   // free plays left
  "paid_plays_remaining": 2,    // paid plays you can buy today
  "free_plays_cap": 5,          // tier's free quota
  "absolute_play_cap": 7        // universal ceiling (always 7)
}
```

### What `/submit` returns when you hit the caps

| Response | Code | UI action |
|---|---|---|
| `extra_play_purchase_id required` | **402** | **Show "Buy Extra Play" purchase UI** |
| `daily play ceiling reached` | **429** | Show "Come back tomorrow" |

🔴 **402 and 429 are completely different.** 402 = "you can pay to keep going today." 429 = "no more plays regardless of payment." A UI that shows "try again tomorrow" on a 402 buries your revenue.

### Grandmaster perk

Grandmaster holders (500k+ YODA) get all 7 plays free. This is the strongest YODA hold incentive in the Arcade. Make sure your session UI reflects `paid_plays_remaining: 0` correctly for Grandmasters — don't show them a "Buy Extra Play" button they can't use.

---

## 5. Art Direction: Painterly Plates and AI Characters

### The POT rule

**All background plates must be power-of-two sized.** Use 2048×1024.

🔴 **Non-POT textures fail silently in WebGL.** Phaser's TileSprite will render flat color or stitch weirdly without throwing an error. We diagnosed this after hours of debugging. Resize with PIL before putting anything in the repo.

```python
from PIL import Image
img = Image.open("bg_ground.png")
img = img.resize((2048, 1024), Image.LANCZOS)
img.save("bg_ground_pot.png")
```

### Always set tileScaleX and tileScaleY

```typescript
const plate = this.add.tileSprite(0, 0, displayW, displayH, 'bg_ground')
plate.setTileScale(displayW / 2048, displayH / 1024)
```

🔴 **Missing `tileScaleY` causes vertical tiling.** If your source image is supposed to be a single tile filling the screen, the TileSprite will repeat it vertically if you only set tileScaleX. Transparent top halves of plates will repeat down and cover your foreground. This is one of those "obvious in retrospect, invisible while debugging" bugs.

### The Backdrop + Cutout pattern

Don't generate multiple baked paintings as separate backgrounds. Generate:
1. One opaque sky/background (JPG, no alpha needed)
2. N transparent cutout overlays for parallax layers (PNG with alpha)

The backdrop unifies color temperature. The cutouts create depth without color fighting.

Swamp Runner v6 architecture:
```
bg_sky.jpg (depth -1)         — opaque, parallax 0.05x
bg_canopy.png (depth 0)       — 71% transparent, parallax 0.15x
bg_mid_trees.png (depth 0.5)  — 53% transparent, parallax 0.40x
bg_ground.png (depth 1.0)     — 76% transparent, parallax 1.00x
```

### Measure alpha, don't trust the plan

🔴 **Always read PIL alpha histogram before computing placement offsets.** You might design a ground plate as "bottom 40% painted," then measure it and find the moss actually starts at 64.5% from top. Use the measured value. Off-by-4.5% means sky bleeds through just below the walk line and characters look like they're floating.

```python
from PIL import Image
import numpy as np
img = Image.open("bg_ground.png")
alpha = np.array(img)[:, :, 3]
# find first row where alpha > 50
first_painted_row = np.argmax(alpha.max(axis=1) > 50)
fill_ratio = first_painted_row / img.height
print(f"First painted row: {first_painted_row} ({fill_ratio:.1%} from top)")
```

### The earth-fill trick

Ground PNG alpha tapers to 0 at the bottom edge. Without compensation, sky bleeds through below the foreground. Fix: add a solid earth-fill rect (sample color from moss shadow, e.g. `#161e17`) at depth just below the ground plate, spanning `groundSurfaceY → screen bottom`. 3 lines of code, fixes all bleed.

### Hollow Knight occlusion pattern

For runner-style games:
```
earth fill (depth 0.95)     = "ground truth" — hides sky below ground line
moss/grass strip (depth 3.7) = atmospheric wade layer — covers character's ankles/shins
obstacles/pickups (depth 3.9) = above moss, below player — still visible
player (depth 4.0)           = top of visible stack
```

This gives the "wading through swamp" feel. Characters look integrated rather than pasted-on. The key insight: **solid floor truth** (earth fill) decouples ground from atmosphere. The earth fill doesn't need to look pretty because it's mostly covered by the moss strip.

---

## 6. Character Animation via fal.ai Wan2.2

### Why Wan2.2 is the right tool

For US-regulated IP like Yoda or Baby Yoda, gpt-image-2 refuses, Gemini refuses, but Wan2.2 on fal.ai doesn't care about the IP name — you never type it, you just provide a reference image. ~$0.40/run, ~40 seconds. It's the unblocked path.

### The pipeline

1. **Pad source to 1280×720** on a neutral (not white, not chroma) background. Dark background works best because Wan returns dark backgrounds, which makes luminance keying trivial.

2. **Submit to `fal.ai/wan-i2v`** with motion prompt. Prompt the motion type, not the IP. Example: "animated walk cycle, left-to-right movement, arms swinging" rather than "Baby Yoda walking."

3. **Extract frames:** `ffmpeg -i output.mp4 -vf fps=48 frames/frame_%04d.png`

4. **Identify the cycle:** watch the video at 0.5x speed. Identify contact frames (foot fully planted) and pass frames (feet crossing). Reorder into proper gait: right contact → right pass → left contact → left pass.

5. **Luminance threshold keying** (NOT chroma): 
   ```python
   from PIL import Image
   import numpy as np
   img = np.array(Image.open('frame.png').convert('RGBA'))
   luminance = 0.299*img[:,:,0] + 0.587*img[:,:,1] + 0.114*img[:,:,2]
   img[:,:,3] = np.where(luminance < 40, 0, 255)  # threshold at 40
   ```

6. **Normalize fill ratio:** find the maximum character height (bounding box) across all selected frames. Scale up shorter frames to match. **Foot-align, not bbox-bottom-align.** Feet lift during pass position; aligning on bbox-bottom would make the character bounce up and down. Align on the lowest opaque pixel row.

7. **Resize to game canvas** with consistent margin — match the fill ratio of your idle/jump frames or the character will pulse size between animation states.

8. **Vision-QA** all final frames as a set. Look for: consistent scale, foot alignment, no clipping at frame edges, consistent background masking.

### 🔴 Reframing between runs

Wan doesn't guarantee the same crop between runs. If a run clips the character at the top or bottom, just regenerate — don't try to recover the crop. Factor this into budget ($0.40 × 2–3 attempts is normal).

### Walk cycle standard

8 frames @ 12fps = Hollow Knight standard. 6 is acceptable. 4 is jumpy. For 2-frame cycles (if you have `idle` and `idle_b`): swap every 0.18s interval — this reads as a real cycle at Swamp Runner's movement speed.

### The walk-pose jump trick

🔴 **Don't commission a separate jump takeoff frame if you have walk frames.** Reuse a walk frame (the forward-lean contact frame) for single-jump takeoff. The body lean reads as launch posture. It's invisible to players and saves an entire Wan run.

Swamp Runner uses `yoda_idle` for the walk cycle's neutral position and `yoda_walk_1` (forward-lean contact frame) as `yoda_jump_takeoff`. Zero visual discontinuity.

---

## 7. Building for Esport Tier

Read `ESPORT_ARCHITECTURE.md` for the full spec. This section is the practical "how to apply it" version.

### Is your game esport-eligible?

Your game is esport-eligible if players directly control outcomes through skill. Runners, precision platformers, rhythm games, dodge games = yes. Betting games, idle games, RNG-heavy = no.

### The three required components

**1. Seeded PRNG everywhere**

```typescript
// Replace ALL Math.random() calls with:
gameState.rng.next()

// Initialize at game start:
const seed = sessionSeed ?? Date.now()  // from daily-seed endpoint in tournament mode
gameState.rng = new SeededRNG(seed)
```

Do a codebase-wide search for `Math.random` before shipping. Any remaining call breaks replay verification.

**2. Fixed-step physics**

```typescript
// In your Phaser scene create():
this.physics.world.fixedStep = true;
this.physics.world.fps = 60;
```

Variable timestep means two players with different device framerates get different physics outcomes from the same inputs. Fixed step = determinism.

**3. Input recording**

```typescript
const replayInputs: Array<{ tick: number; type: string }> = []

// In your input handler:
function onJump() {
  replayInputs.push({ tick: gameState.tick, type: 'jump' })
  // ... normal jump logic
}
```

`gameState.tick` is an integer counter that increments each fixed-step update. Not a timestamp — timestamps break determinism.

### Daily Seed mode is the minimum viable esport feature

You don't need head-to-head racing, replay verification infrastructure, or chunk authoring to ship something meaningfully competitive. Daily Seed alone — one seed per day, same level for every player, 24h leaderboard — transforms casual into competitive.

Daily Seed implementation:
1. Poll `GET /arcade/v0/daily-seed` on game load (endpoint coming — currently mock with `Date.now()` rounded to midnight UTC)
2. Use that seed to initialize your PRNG
3. Pass `mode: 'daily'` in `postResult` and `postSubmit`
4. Show a "Daily Challenge" entry point next to the normal "Play" button

### Chunk authoring vs per-tick random spawning

Per-tick random spawning (`Math.random() < spawnRate`) means every player gets a different level. Someone who rolls easy spawns for 90 seconds can beat a better player who got unlucky. This is anti-competitive.

Chunk authoring is the fix. A chunk is a designed unit of gameplay: specific entities, specific timing, specific entry and exit conditions. The PRNG picks *which* chunks play in which order, not random independent events every frame.

For Swamp Runner, this means:
- `sw_log_jump_basic_01`: a log at tick 200, followed by a gap, followed by another log at tick 600
- `sw_slime_slide_01`: two slimes requiring a slide-through with 400ms window
- etc.

Every player who gets `sw_log_jump_basic_01` gets the same challenge. Skill matters. Luck (in the per-spawn sense) is gone.

Build your chunk authoring format in JSON on day one. If you author chunks in code, you'll regret it at chunk #30 when you need to visualize and edit them.

### Skill ceiling design

Determinism means the same level. But "competitive" requires the game to reward mastery. You need at least two of these five skill layers:

| Layer | Example | Mastery window |
|---|---|---|
| Precision input windows | Frame-perfect jump timing, 16ms window | ~200 hours |
| Movement tech | Non-obvious optimal line through a chunk | ~200 hours |
| Risk/reward | Optional hard pickups that multiply score | ~200 hours |
| Combo/multiplier | Chain consecutive pickups; miss = reset | ~200 hours |
| Read-ahead skill | Plan 2-3 chunks ahead | ~200 hours |

Each layer extends the skill ceiling by ~200 hours. Two layers = real competitive game. Five layers = potential esport.

### Anti-luck rules

If your game declares `esport_tier: true`, the following are required:
- Pickup positions must be part of chunk authoring (not random per-run)
- No random spikes in difficulty curve
- Revives cost score percentage (e.g. -30%), not "pay-or-die" paywalls
- Defeat is deterministic — no rubber-banding, no per-run health rolls

---

## 8. Score Design: The Most Important Knob

I already covered this in SDK §5 but it bears repeating here because it burned me hard.

🔴 **Setting max_score = 99999 gave Swamp Runner players 1 midi per 100 paces. Nobody noticed for three versions because the UI showed the score but not the midi calculation.**

Correct approach:
1. Start with the comparable-game anchor table (SDK §5)
2. Play-test yourself: what score do you hit on a decent run? That's your max_score
3. After launch, pull telemetry: if median submitted score < 40% of max_score, halve max_score; if > 70%, double it

The goal is median player earning 400–600 midi per run. That feels rewarding. Above 800 and you may be inflating (check your leaderboard distribution). Below 200 and players feel like they're grinding for nothing.

---

## 9. Testing Checklist

Before declaring your game ready for review:

**Auth flow:**
- [ ] Game loads from `?session_token=` URL param
- [ ] `initSession()` returns valid player context
- [ ] Game shows error (not blank screen) if session token invalid

**Core game loop:**
- [ ] `postEntry(0)` called before game starts
- [ ] `postResult()` called when game ends (win, loss, and draw cases)
- [ ] Result screen shows `projected_midi`
- [ ] "Submit Score" button calls `submitResult()`
- [ ] `midi_awarded` shown with celebration animation on submit success

**Paywall:**
- [ ] When `daily_plays_remaining === 0` and `paid_plays_remaining > 0`: Buy Extra Play button shows
- [ ] When `paid_plays_remaining === 0`: "Come back tomorrow" shows
- [ ] Submit returning 402 shows paywall (not "try again tomorrow")
- [ ] Submit returning 429 shows "come back tomorrow" (not paywall)
- [ ] After successful purchase, extra play granted and play proceeds

**TON payment:**
- [ ] `requestPurchase('extra_play', ..., 'TON')` creates purchase row
- [ ] `walletRpc('requestTonPayment', ...)` opens Tonkeeper
- [ ] After signing, game polls until `paid_pending` or `paid`
- [ ] Extra play granted on `paid_pending` (don't wait for `paid`)

**Leaderboard:**
- [ ] `/leaderboard` shows your submitted score after `submitResult`
- [ ] Rank displays correctly
- [ ] Scores above `max_score` appear on leaderboard (not rejected)

**Session expiry:**
- [ ] `SESSION_EXPIRING` postMessage handled (save state, show warning)
- [ ] `SESSION_KILLED` handled (clean teardown)

**Responsive:**
- [ ] Game works at 390px viewport width
- [ ] `tg.ready()` called on load
- [ ] `tg.expand()` called to fill screen

---

## 10. Common Mistakes

In rough order of frequency:

| Mistake | Symptom | Fix |
|---|---|---|
| `postResult` instead of `submitResult` | Midi never appears | Wire Submit button to `submitResult()` |
| Non-POT background plates | Silent flat-color TileSprite | Resize to 2048×1024 with PIL |
| Missing `tileScaleY` | Vertical tiling of plate | Set both `tileScaleX` and `tileScaleY` |
| `max_score` too high | Players earn 1–10 midi/run | Use comparable-game anchor table |
| 402 treated as 429 | Paywall not shown | Handle 402 and 429 with different UI |
| TonConnect in iframe | Works on Android, silently fails iOS | Use `walletRpc()` bridge only |
| `Math.random()` in game loop | Replays don't verify | Seeded PRNG everywhere, search and replace before ship |
| Character with no contact shadow | Looks "pasted on" | 3-line contact shadow ellipse under player |
| Pickup positions random | Competitive feel impossible | Chunk authoring for esport tier |
| Old `yoda_payment` block shape | YODA purchase fails | Use `kind: 'burn'` shape; `attached_ton` not `forward_ton_amount` |

---

## 11. Ship Order

If I were building Swamp Runner again from scratch, here is the order I'd ship:

**Day 1–2: Core loop + backend wired**
1. Stub game (placeholder graphics, basic movement)
2. Auth handshake + `initSession`
3. `postEntry` + `postResult` + `submitResult` wired
4. Result screen with Submit button
5. Midi award animation
6. Deploy to Vercel, test full loop end-to-end

**Day 3–4: Art pass**
1. Generate background plates (POT, backdrop + cutout pattern)
2. Generate character idle frame
3. BiRefNet alpha matting pipeline
4. Depth ordering + earth fill + moss strip
5. Character integration (rim light + contact shadow + tint)

**Day 5–6: Monetization**
1. Wire TON extra-play purchase
2. 402 paywall UI
3. YODA extra-play purchase (if target audience has YODA wallets)
4. Tier-aware play cap display

**Day 7–9: Polish**
1. Character walk cycle via Wan2.2
2. Haptic feedback
3. Share card on win
4. Leaderboard display

**Day 10–12: Esport tier (if applicable)**
1. Seeded PRNG replacing all Math.random()
2. Fixed-step physics
3. Input recording
4. Daily Seed mode UI
5. Test replay determinism locally

**Day 13: Submit manifest**
1. Fill manifest with final values (including real max_score from playtesting)
2. Sandbox end-to-end test
3. Post to Galactic Council

---

## Appendix: What Swamp Runner Cost vs Earned

For reference when scoping your next project:

| Phase | Time (estimated) | Notes |
|---|---|---|
| Core loop + backend | ~2 days | SDK was being built simultaneously — pure game would be faster |
| Art pass (v1–v6) | ~3 days | Iterations: v1 placeholder → v2 flat colors → v3 painted → v4 character → v5 POT → v6 backdrop+cutout |
| Character integration | ~1 day | Rim light + contact shadow + walk cycle |
| YODA payment flow | ~2 days | Including native burn refactor |
| Score fixes + test suite | ~1 day | |
| **Total (rough)** | **~9 days** | Could be done in 5–6 with this guide |

The art iterations were the main cost driver. The backdrop+cutout approach at v6 is clearly the right architecture — generate it that way first, don't discover it at v6.

---

*Good luck. The swamp is already built. Build something harder.*

---

## 12. Operational Lessons (live additions)

Hard-won learnings from production. These are the things that bit us between the v0 SDK ship and Swamp Runner v1 — added here so the next studio doesn't rediscover them.

### Wallet stays shell-owned. Always.

🔴 **The game iframe never owns TonConnect.** The host frame (the Sticker Galaxy mini-app) owns the wallet. Your game delegates via `sdk.openSettings('wallet')` and `walletRpc(...)`. Three reasons:

1. **Trust** — the user already trusted the shell. Re-prompting wallet connect inside an iframe trains them to approve random crypto popups.
2. **Persistence** — wallet binding survives game-to-game navigation.
3. **Audit** — there is exactly one place where TonConnect lives, exactly one address that ever gets bound.

If you find yourself importing `@tonconnect/ui-react` in your game source, you've drifted. Stop and check the SDK pattern.

### One RPC envelope. One dispatcher. No parallel listeners.

🔴 The shell exposes exactly one `postMessage` envelope: `SG_WALLET_RPC`. Inside it, methods dispatch: `getHolderTier`, `openSettings`, `SG_SHARE_TO_STORY_RPC`, etc. When we shipped shareToStory we accidentally added a second listener for raw `type === 'SG_SHARE_TO_STORY'` — the SDK was wrapping the call through `walletRpc()` so it never reached the parallel listener. **One envelope, one switch, no spawning new postMessage types.** If you need a new capability, add a `case` to the wallet RPC dispatcher.

### `MINIAPP_URL` must be scheme + host only

🔴 The host config that points a Telegram bot at the Mini App (`MINIAPP_URL` on Fly) must be scheme + host only — no path, no query string. We had two incidents in one afternoon:

- Cache-buster query (`?v=12345`) at the end produced `https://x.com/?v=12345/arcade/play/swamp_runner` when the bot appended a route — the `?` swallowed everything after it, browser landed at `/`, DeepLinkRouter fell through to the district map. **The "buttons take me home" bug.**
- Stale path component (`/miniapp`) produced `https://x.com/miniapp/arcade/play/swamp_runner` which is a real Next.js 404. **The "page could not be found" bug.**

Defensive code in `app/commands/games.py`, `padawan.py`, `miniapp.py` now strips both. If you're building your own host integration, parse the URL with `urlsplit`, keep `scheme + netloc` only, throw away the rest.

### `prefers-reduced-motion` is non-negotiable

Every animated effect — fireflies, god-rays, sigil flourish, hero breath, whisper-in, tap-burst, bloom — must check `@media (prefers-reduced-motion: reduce)` and collapse to either static-with-opacity or no-op. Telegram's accessibility settings forward to the WebView; respect them. If your effects pack reads "feels alive" with motion enabled and "feels dignified" without, you got it right.

### Contrast tokens: the silver trap

🔴 The original Swamp Runner palette used `--silver: #b8b8a8` and `--text-muted: #90a878` for secondary text on green backgrounds. Both failed WCAG 4.5:1 contrast — readable on desktop preview, illegible on phone. The fix was a single token change to `--text-muted: #d4c89a` (warm parchment-tinted). Same token replaced everywhere; contrast cleared globally.

If you need secondary or muted text on a chromatic background, **measure it.** Don't trust the preview screen.

### Rank readability never relies on color alone

🔴 The first Swamp Runner leaderboard used color-only for trophy tiers (red/yellow/green) and rank-by-row-color for podium. Two things broke:

1. ~8% of male users have red-green color vision deficiency — the rank signal vanishes for them.
2. Telegram's dark/light theme variants drift the perceived hue, so what scored 4.5:1 in design didn't survive runtime.

The rebuild uses **medals + glyphs + height** redundantly with color: gold/silver/bronze medals on the podium, `★`/`◆`/`●` glyphs for tier chips, taller podium for 1st place. Color is now a reinforcement, not the signal. Always.

### Testing checklist — additions from the live bugs

In addition to the existing §9 list:

- [ ] **Force-dismiss Telegram WebView between iterations.** Swipe down all the way; don't minimize. Telegram caches WebApp button URLs aggressively and your code change may not be live in the cached state.
- [ ] **Long-press a `WebAppInfo` button → copy URL.** Verify it matches what you constructed in code. The fastest way to catch host-env misconfig is to inspect the actual button URL.
- [ ] **Test cold-load on a real iPhone over 5G**, not desktop emulation. Cold-load over 7 seconds is the playbook cliff — players bounce.
- [ ] **Verify your buttons survive a long-press in a group chat.** Direct Link Mini App URLs (`t.me/<bot>/play?startapp=...`) only work if the bot has a matching short name in BotFather.

### Vercel doesn't auto-deploy. Fly does.

🔴 The bot side of the Sticker Galaxy stack auto-deploys to Fly on every master push (GH Actions). The mini-app side does **not**. Vercel is connected to GitHub but the production deploy is manual: `cd mini-app && vercel --prod --yes`. If you ship a `mini-app/` change and only see the old behavior in production, that's why. Add it to your deploy runbook.

### Pre-existing CI red ≠ your PR is broken

🔴 If GitHub PR status shows `UNSTABLE` (failing required checks) but the failures look unrelated to your change, diff the failing test names against `master`. If master is already red on the same tests, your PR is fine. Admin-merge if needed; file a separate ticket to fix the baseline. The alternative — blocking on a red baseline — means nothing ever ships.

We had 24 baseline failures sitting on master through this entire session. Two PRs admin-merged through `UNSTABLE` shipped cleanly; arcade-v0 tests stayed 89/89 green throughout.

### Git stash-pop across multi-edit branches drops edits silently

🔴 If you `git stash`, switch branches, and `git stash pop` mid-edit, edits that came AFTER the first conflict marker may not be re-applied. Always `git diff origin/master -- <files-you-touched>` after stash-pop to verify. This bit us once with a missing `import` line that silently disabled `/games` until CI flagged it.

---

These lessons came out of a ~6-hour production session on 2026-05-30. If you find yourself debugging something painful and the cause turns out to be in the platform contract rather than your game code, add it here. The next studio will thank you.
