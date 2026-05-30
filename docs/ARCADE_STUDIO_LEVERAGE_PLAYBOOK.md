# Arcade Studio Leverage Playbook

**Goal: every minigame after Swamp Runner ships in 1/5 the time and 1/3 the cost, at the same SOTA quality bar.**

**Written:** 2026-05-30 (after Swamp Runner v1.0 reached production)
**Status:** strategy + execution plan. Linear tickets filed as YODA-378…385.

---

## What this doc is for

Swamp Runner taught us a lot. Most of those lessons currently live in three places:

1. **`docs/MINIGAME_BUILDER_GUIDE.md`** — written tutorial (558 lines, comprehensive on gameplay/art/economy)
2. **`docs/ARCADE_SDK_v1.md`** — SDK spec (905 lines)
3. **The Swamp Runner source itself** — `swamp-runner/src/` (2223 lines of CSS, full UI kit, Phaser scene patterns)

The problem: those three sources don't compose into leverage. A new studio reading the docs still has to re-derive the parchment surface CSS, the Hollow Knight effects pack, the leaderboard a11y pattern, the settings modal structure, the chunk authoring contract, the depth-ordering rules, etc. The current `arcade-starter/` template is a 1500-line "tap-the-sticker" placeholder that gives them none of the design system.

**This playbook is the bridge.** It defines exactly what gets extracted from Swamp Runner into reusable artifacts, what shape those artifacts take, and how a new studio (or future-Grant, or a Cursor/Claude/Codex session) consumes them.

---

## The Leverage Model

There are five distinct "consumers" of arcade IP. Each needs a different shape of the same knowledge:

| Consumer | What they need | Shape |
|---|---|---|
| **A. New studio** (human, building game #2) | Working scaffold + clear contract | Forkable repo + manifest schema |
| **B. AI coding assistant** (Cursor/Claude/Codex working on a new game) | Concise, copy-pasteable, AST-friendly | `llms.txt` bundle + tagged code blocks |
| **C. Sticker Galaxy core team** (us, shipping game #3, #4 internally) | Don't re-derive, don't re-paste | npm package + design tokens |
| **D. Galactic Council reviewer** (gates publication) | Checklist + automated lint | Manifest schema + review CI |
| **E. Player** (downstream) | Visual consistency across games | Branded UI kit |

The leverage stack:

```
                    ┌──────────────────────────┐
                    │ @stickergalaxy/arcade-ui │  ← consumed by A, B, C
                    │ (npm package, UI + tokens)│     visible to E
                    └──────────┬───────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
        ▼                      ▼                      ▼
┌────────────────┐  ┌────────────────────┐  ┌─────────────────┐
│ arcade-starter │  │ MINIGAME_BUILDER   │  │ manifest.schema │
│  (forkable)    │  │   _GUIDE.md (tut)  │  │   .json (lint)  │
│  ← consumers A │  │  ARCADE_SDK_v1.md  │  │  ← consumers D  │
└────────────────┘  │  llms.txt (bundle) │  └─────────────────┘
                    │  ← consumers A, B  │
                    └────────────────────┘
```

---

## What gets extracted from Swamp Runner

### Tier 1 — design system (highest leverage)
These are the things every Sticker Galaxy game must look/behave consistently. Extract first.

| Pattern | From | To |
|---|---|---|
| **Parchment surface** (CSS canonical container for "things you read") | `swamp-runner/src/style.css` (~150 lines) | `@stickergalaxy/arcade-ui/styles/parchment.css` |
| **Hollow Knight effects pack** (fireflies, god-rays, sigils, whisper-in, tap-burst, bloom, hero breath, ember-ring) | `swamp-runner/src/style.css` + `src/main.ts` | `@stickergalaxy/arcade-ui/styles/effects.css` + `arcade-ui/effects.ts` |
| **Design tokens** (`--text` warm cream, `--text-muted` #d4c89a parchment-tinted, `--gold-ink`, swamp green palette) | `swamp-runner/src/style.css` | `arcade-ui/tokens.css` |
| **Title screen layout** (compact top pill → hero → tagline → single primary CTA → de-emphasized icon row) | `swamp-runner/src/main.ts` + `src/ui/TitlePerksCard.ts` | `<TitleScreen>` component (Vanilla TS export) |
| **Leaderboard component** (parchment, podium 2-1-3, medals + glyphs ★/◆/●, daily-midi pills, your-standing pinned row, backdrop dismiss) | `swamp-runner/src/ui/Leaderboard.ts` (full rewrite this session) | `<Leaderboard>` component |
| **Settings modal** (parchment, Game section + Account section, iOS-style toggles) | `swamp-runner/src/ui/SettingsModal.ts` | `<SettingsModal>` component with pluggable sections |
| **Result screen** (parchment scroll, rank reveal, share-to-story button, run-again CTA) | `swamp-runner/src/ui/ResultScreen.ts` | `<ResultScreen>` component |
| **Onboarding modal** (parchment + gold-ring decoration) | `swamp-runner/src/ui/Onboarding.ts` | `<Onboarding>` component |

### Tier 2 — SDK + protocol (already in good shape)
These exist as `@stickergalaxy/sdk-core` (already vendored into swamp-runner). Promote to public npm.

| Pattern | Status |
|---|---|
| `getSession()`, `getMidiBalance()`, `getReferral()`, `scheduleReactivation()` | Already SDK |
| `walletRpc()` envelope + host-side dispatcher pattern | Already SDK |
| `shareToStory()` (routes through `walletRpc('SG_SHARE_TO_STORY_RPC', opts)`) | Already SDK after PR #602 |
| `openSettings('wallet')` shell delegation pattern | Already SDK |
| Result screen `this_run_rank` / `would_improve_best` / `current_best_score` fields | Already in SDK types |

### Tier 3 — game architecture patterns
Codify as docs + example code in starter, not as a library (too game-specific to abstract).

| Pattern | Where it lives |
|---|---|
| **Chunk authoring system** (sw_chunk_*.json with `_design`/`comment` fields, stable IDs in filenames) | Builder guide §X + starter `src/chunks/` example |
| **Depth ordering** (sky -1.0 → mid-trees 0.3 → canopy 0.7 → earth 0.95 → obstacles 1.5-2.2 → player 4.0) | Builder guide §5 |
| **POT texture rule, tileScaleX/Y, Backdrop+Cutout layering** | Builder guide §5 (exists) |
| **Daily-seed mode for esport eligibility** | Builder guide §7 (exists) |
| **Score design** — single number, monotonic with skill, capped at `max_score` | Builder guide §8 (exists) |

### Tier 4 — operational learnings (this session)
These are the "we learned the hard way" lessons from May 30 that aren't in any doc yet.

| Lesson | Where to file |
|---|---|
| **Wallet stays shell-owned** — game iframe never owns TonConnect, always delegates via `walletRpc()` | Builder guide §3 (add) |
| **RPC envelope dispatch must be unified** — one wallet RPC host, switch on inner `method`, never spawn parallel `type=...` listeners | Builder guide §3 (add) |
| **`MINIAPP_URL` must be scheme+host only** — host must strip path/query/fragment before appending routes (see PR #604, #605) | SDK host integration guide (add) |
| **`prefers-reduced-motion` is non-negotiable** — every animated effect must check it | Builder guide §5 (add) |
| **Contrast tokens** — `--text-muted` must clear 4.5:1 against game bg; `--silver` legacy value (#90a878) failed everywhere | Builder guide §5 (add) |
| **Rank readability never relies on color alone** — medals + glyphs + height carry the same signal | Builder guide §7 (add) |
| **Stash-pop on multi-edit branches drops earlier edits silently** — always `git diff origin/master -- <files>` after rebase | TOOLS.md (workspace) |
| **`UNSTABLE` ≠ broken when baseline is red** — diff against master before blocking | TOOLS.md |
| **Telegram WebView caches WebApp button URLs aggressively** — full swipe-dismiss, not minimize, refetches | Builder guide §9 testing checklist |
| **Vercel mini-app needs manual `vercel --prod`** — Fly auto-deploys, Vercel does not | Deployment runbook |

### Tier 5 — growth primitives (already shipped)
- `scheduleReactivation()` (PR #602) → daily DM cron
- `shareToStory()` (PR #602) → viral loop
- Referral attribution (PR #602) → trackable invites
- `arcade_<game_id>` deeplink convention → `t.me/<bot>/play?startapp=arcade_<id>` group launches

These are SDK-level. Once a new game integrates the SDK, it gets these for free.

---

## Execution plan — what to ship

Five concrete artifacts. Each is a Linear ticket. Sequenced for maximum leverage:

### YODA-378 — Extract `@stickergalaxy/arcade-ui` design system [HIGH leverage]
- Pull parchment surface + Hollow Knight effects pack + design tokens into a standalone CSS-first package
- Single import: `import '@stickergalaxy/arcade-ui/styles/all.css'` gives you the visual language
- Optional: vanilla TS components (`createParchmentSurface`, `createLeaderboard`, `createTitleScreen`) for non-React games
- Publish to private npm registry first; public after second studio onboards
- **Effort:** MED (~3 days). Mostly extraction, some renaming.
- **Output:** new repo `hollowtradr/arcade-ui` + npm package

### YODA-379 — Rebuild `arcade-starter/` as the real v2 starter [HIGH leverage]
- Replace the 1500-line "tap-the-sticker" placeholder
- New starter ships with: full SDK + UI package wired up + manifest scaffold + parchment title screen + leaderboard + result screen + settings modal + working share-to-story + reactivation hook + chunk-loading pattern (even if game doesn't use chunks, show the seam)
- README walks through "60 minutes to running game" using the real surfaces, not a placeholder
- Replace the gameplay slot with a clearly-marked `// TODO: your game here` block
- **Effort:** MED (~3 days)
- **Output:** rewritten `arcade-starter/` + updated docs

### YODA-380 — Append session learnings to `MINIGAME_BUILDER_GUIDE.md` [LOW effort, HIGH value]
- Add the Tier 4 learnings above as a new "§12. Operational Lessons (live)" section
- Update §3 Payments with wallet-shell delegation and RPC envelope discipline
- Update §5 Art with contrast tokens + prefers-reduced-motion rule
- Update §7 Esport with a11y rank-readability rule
- Update §9 Testing with cache-busting + URL diagnostic checklist
- **Effort:** SMALL (~half day)

### YODA-381 — `manifest.schema.json` + studio review CI [MED leverage]
- Convert the manifest.json comments into a real JSON Schema
- Adds `npm run validate` in starter that lints against the schema
- Galactic Council reviewer runs the same validator before approving — kills back-and-forth on "you forgot `max_score`"
- Optional CI workflow: `actions/checkout` + `npx ajv-cli validate -s schema.json -d manifest.json`
- **Effort:** SMALL (~1 day)

### YODA-382 — `llms.txt` bundle for AI assistants [HIGH leverage for B]
- Single URL that returns:
  - SDK reference (compressed)
  - Manifest schema
  - Builder guide (compressed)
  - Starter file tree summary
- Cursor/Claude/Codex ingests it as project context
- Already partially exists at docs-site; expand it to include the full operational learnings + UI package API
- **Effort:** SMALL (~1 day, mostly content assembly)

### YODA-383 — `arcade-ui` Storybook + visual reference site [MED]
- Static site rendering each component variant at 390×844 (Telegram viewport)
- Visual regression baseline (Playwright screenshot)
- Lives at `arcade-ui.stickergalaxy.io` or under existing docs site
- **Effort:** MED (~2 days, can be deferred until 3rd studio joins)

### YODA-384 — Studio onboarding video (90s loom or screencast) [HIGH leverage]
- Show fork → install → npm run dev → loaded title screen with parchment + fireflies → replace gameplay slot → deploy → submit manifest → review approval
- Lower the perceived complexity by an order of magnitude
- **Effort:** SMALL (~half day once YODA-379 done)

### YODA-385 — Studio bounty program (optional, decide later) [unblocks supply]
- Define what we'll pay for a third-party-submitted minigame that ships and gets approved (e.g. 0.5 TON for shipping + revenue share)
- Without this, studios are doing free work — limits supply
- **Effort:** policy decision, not engineering

---

## Sequencing recommendation

Ship in this order for maximum leverage per day spent:

1. **YODA-380** (half day) — write down session learnings before they decay
2. **YODA-378** (3 days) — extract `arcade-ui`; this is the leverage spine
3. **YODA-379** (3 days) — rebuild starter on top of `arcade-ui`
4. **YODA-381** (1 day) — manifest schema; small win, kills review friction
5. **YODA-382** (1 day) — llms.txt bundle; AI-assistant onboarding
6. **YODA-384** (half day) — onboarding video; reduces perceived complexity
7. **YODA-383** (2 days, optional) — Storybook; defer until second studio onboards
8. **YODA-385** (policy) — bounty; decide before approaching specific studios

**Total: ~10 working days** to lift the next game's build cost from "~3-4 weeks like Swamp Runner" to "~5-7 days for a studio fluent with the platform."

ROI threshold: if we ship two more games after this work, it's net positive. If we ship five, it's a 10x.

---

## What we deliberately are NOT building

- **A game engine.** Studios pick Phaser, Pixi, three.js, raw canvas, whatever. We don't dictate.
- **A scoring service.** The arcade backend handles `/submit`; games just call it.
- **A full React framework wrapper.** UI package ships vanilla TS + CSS so any framework consumes it.
- **A renderer SDK.** Background plates, character sprites, Phaser scenes are studio-owned. We provide tutorial patterns, not abstractions.
- **A bidirectional save state.** Anti-cheat sims demand single-shot score submission. We don't checkpoint mid-run.
- **Server-authoritative gameplay.** Trust model is client + proof-of-play token; if studios want PvP, they build their own anti-cheat.

---

## Locked-in decisions

- **`@stickergalaxy/arcade-ui` is CSS-first, vanilla-TS second, framework-agnostic.** No React peer-dep.
- **The starter is forkable, not a yarn-install template.** Studios should be able to read every line.
- **The builder guide is the canonical narrative.** The SDK spec is the canonical reference. The starter is the canonical example. Three artifacts, three roles, no overlap.
- **Wallet always shell-owned, RPC always wallet-envelope.** Codified in PR #602 and the builder guide §3.
- **Manifest schema is the contract with the Council.** If your manifest validates, the Council can approve it in one pass.

---

## Open questions

1. Do we open-source `@stickergalaxy/arcade-ui` from day 1, or keep it private until 3rd studio joins?
2. Storybook or Playwright + visual regression? (recommend Playwright for parity with the actual Telegram viewport)
3. Should the starter ship Phaser by default, or be engine-agnostic with a "pick your renderer" prompt?
4. Bounty pricing — 0.5 TON for ship-and-approved? More? Tied to live revenue?

---

## Cross-references

- `docs/MINIGAME_BUILDER_GUIDE.md` — tutorial, will absorb Tier 4 learnings
- `docs/ARCADE_SDK_v1.md` — SDK reference, mostly stable
- `arcade-starter/` — template, slated for v2 rewrite
- `swamp-runner/` — source of truth for extraction
- `mini-app/lib/walletRpc.ts` + `mini-app/lib/shareRpc.ts` — host-side RPC dispatcher (extraction pattern reference)
- `docs/marketing/TELEGRAM_APPS_CENTER_APPLICATION.md` — Apps Center prereqs
- Linear: YODA-378 through YODA-385
