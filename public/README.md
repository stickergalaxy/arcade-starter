# public/

Put your game's static assets here. Vite copies everything in `public/` to the build root as-is.

Typical contents:
- `favicon.ico` — browser tab icon
- `og-image.png` — Open Graph share image
- `assets/` — any file you reference by absolute URL (`/assets/bg.png`)

**Game sprites and images** that are imported by TypeScript (via `import bgUrl from './bg.png'`)
go in `src/assets/` instead — Vite will hash those filenames for cache-busting.

This README is safe to delete once you've added real assets.
