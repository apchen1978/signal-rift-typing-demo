import { defineConfig } from 'vite';

// Lil Matt's Gaming World — three independent entries:
//   index.html      → Gaming World hub (two game choices)
//   jumpverse.html  → Jumpverse (platform adventure; Vector Wake = Level 1)
//   wordforge.html  → WordForge (gamified English learning; Typing Challenge)
// base "./" keeps assets relative so the build works under any GitHub Pages subpath.
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        'gaming-world': 'index.html',
        jumpverse: 'jumpverse.html',
        wordforge: 'wordforge.html',
      },
    },
  },
});
