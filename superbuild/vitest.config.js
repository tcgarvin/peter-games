import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom provides document/canvas for render tests;
    // track.js and sim.js don't use it but the overhead is negligible.
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['track.js', 'sim.js', 'render.js', 'net.js'],
      reporter: ['text', 'lcov'],
    },
  },
});
