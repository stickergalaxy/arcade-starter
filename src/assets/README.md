# src/assets/

Put your sprites, images, and other game assets here.

Files in `src/assets/` are imported by TypeScript and get hashed filenames at build time:

```typescript
import heroPng from './assets/hero.png'
// heroPng is a URL string like '/assets/hero-a1b2c3d4.png'
```

Vite handles the hashing automatically — no manual cache-busting needed.

**Background plates:** must be power-of-two sized (2048×1024) for WebGL renderers.
See `docs/MINIGAME_BUILDER_GUIDE.md §5` for the full art direction guide.

This README is safe to delete once you've added real assets.
