/**
 * src/ui/index.ts — re-exports for all local UI helpers.
 *
 * Arcade-ui components (TitleScreen, Leaderboard, ResultScreen, SettingsModal)
 * are imported directly from '@stickergalaxy/arcade-ui' in main.ts.
 *
 * This file only exports the game-specific UI helpers that live in src/ui/.
 */

export { initHUD, showHUD, hideHUD, updateHUD } from './HUD.js'
