import { defineConfig } from 'vite';

export default defineConfig({
  base: '/read-think-write/',
  test: { environment: 'jsdom' },
});
