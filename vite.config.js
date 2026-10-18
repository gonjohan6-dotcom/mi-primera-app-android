import { defineConfig } from 'vite';

export default defineConfig({
  root: 'www',
  publicDir: '../public',
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2020'
  }
});
