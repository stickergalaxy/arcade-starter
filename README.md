# ⭐ Sticker Galaxy Arcade Starter — v2

A forkable scaffold for Sticker Galaxy Arcade minigames. Fork this repo, install, run `npm run dev`, and you have a fully-styled Telegram mini-app with parchment surfaces, fireflies, leaderboard, settings, and result screen — all wired to the live arcade backend. Your job: replace `src/game/` with your actual game.

> **v2 replaces the old "tap-the-sticker" placeholder** (hollowtradr/arcade-starter) with the real `@stickergalaxy/arcade-ui` design system.

---

## What you get in 60 seconds

```bash
# 1. Fork or clone
gh repo clone stickergalaxy/arcade-starter my-game && cd my-game

# 2. Install
npm install

# 3. Run
npm run dev
# → http://localhost:5173/?dev=1
```

Open at `http://localhost:5173/?dev=1`. You'll see:

- **Title screen** with parchment surface, animated fireflies, god-ray shafts, hero slot, player stats strip, and a "Begin Run" CTA
- **Leaderboard overlay** — parchment, podium 2-1-3, medal + glyph + height (a11y-clean rank)
- **Settings modal** — pluggable "Game" section (example: Sound Effects toggle) + built-in "Account" section with wallet delegation
- **Placeholder game** — 5-second tap counter (your replacement target)
- **Result screen** — parchment scroll, score, projected midi, "Submit Score" button that mints midi on tap

`?dev=1` = demo mode. No real session token needed to see the full UI. For real midi rewards, get a dev token from @hollowtradr (see [Dev Token](#dev-token)).

---

## Where your game goes

```
src/game/index.ts   ← THE SLOT
```

Replace the placeholder with your game. The contract is three lines:

```typescript
export interface GameOpts {
  container: HTMLElement                                   // mount your game here
  onEnd: (score: number, outcome: 'win'|'loss'|'draw') => void  // call when done
}

export function startGame(opts: GameOpts): void { /* your game */ }
export function stopGame(opts?: GameOpts): void  { /* cleanup */ }
```

That's it. When `onEnd` fires, `main.ts` takes over: posts the result, shows the result screen, handles submit. You don't touch any of that.

See `src/game/README.md` for engine guidance and the state model.

---

## File map

| File | What it does |
|---|---|
| `src/main.ts` | Entry point. Boots SDK → title screen → game → result screen. |
| `src/sdk.ts` | SDK wrapper. Every arcade API call lives here. Don't modify. |
| `src/tg.ts` | Telegram WebApp helpers (ready, haptics, CloudStorage, buttons). No-ops outside Telegram. |
| `src/style.css` | Imports `@stickergalaxy/arcade-ui/src/all.css` + game overrides. |
| `src/game/index.ts` | **Your game slot.** Replace this. |
| `src/game/state.ts` | Minimal game state. Replace with your model. |
| `src/ui/HUD.ts` | In-game score/balance overlay. Extend as needed. |
| `manifest.json` | Game manifest. Fill before review submission. |
| `public/` | Static assets copied verbatim to build root. |
| `src/assets/` | Sprites/images imported by TypeScript (Vite hashes filenames). |

---

## manifest.json — fields that block submission

Every `[REQUIRED]` field must be filled before the Galactic Council will approve your game.

| Field | What to put there |
|---|---|
| `name` | Display name in the Arcade (≤24 chars) |
| `studio` | Your studio name |
| `studio_ton_wallet` | TON wallet for revenue payouts — you get 70% of purchases |
| `genre` | One of: arcade, puzzle, racing, auto-battler, idle, other |
| `sector` | The SG sector: cantina-district, dagobah, coruscant, etc. |
| `url` | Production HTTPS URL |
| `max_score` | Max a skilled human can score — **not 99999**. Playtest and measure. |
| `play_duration_range_seconds` | `[min, max]` seconds per run |

See the inline comments in `manifest.json` for guidance on every other field.

---

## Dev token

Without a session token the game runs in demo mode (`?dev=1`). For real midi rewards and the full API round-trip, DM **@hollowtradr** on Telegram. He'll generate a dev token. Paste it into `.env` as `VITE_ARCADE_SESSION_TOKEN`.

Tokens expire after 60 minutes. For local dev, `?dev=1` is usually sufficient — you can see every screen without a token.

---

## Deploy & submit

```bash
npm run build    # outputs to dist/

# Vercel (recommended)
npx vercel --prod

# Netlify
netlify deploy --prod --dir=dist
```

Your game needs HTTPS. Any static host works (Vercel, Netlify, Cloudflare Pages, GitHub Pages).

After deploying, fill in `url` in `manifest.json`, then submit to the Galactic Council:

```
/council propose_minigame { ...paste your manifest... }
```

The Council reviews the manifest + does a sandbox test session. Typical turnaround: 24–48h.

---

## Studio bounty

Sticker Galaxy pays studios for shipped games:

| Milestone | Reward |
|---|---|
| Game approved by Council and goes live | **2 TON** |
| Game hits 500 active players in first month | **5 TON** |
| Ongoing | **70% of all in-game purchase revenue** |

See the Arcade Studio Leverage Playbook for the full bounty structure (link coming soon — ask @hollowtradr).

---

## Links

| Resource | URL |
|---|---|
| Full tutorial | `docs/MINIGAME_BUILDER_GUIDE.md` |
| SDK reference | `docs/ARCADE_SDK_v1.md` |
| Design system | [`@stickergalaxy/arcade-ui`](https://github.com/stickergalaxy/arcade-ui) |
| llms.txt (AI context) | Coming soon — YODA-382 |

---

## What changed from v1

v1 was a 1500-line "tap-the-sticker" placeholder with hand-rolled CSS for the leaderboard, result screen, and settings modal. v2 imports `@stickergalaxy/arcade-ui` for all of that — the same design system extracted from Swamp Runner. The placeholder game is now ~70 lines and clearly labeled as the slot to replace. Everything else is wired and working.
