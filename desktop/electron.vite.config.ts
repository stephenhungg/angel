import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@angel/shared'] })],
    build: {
      outDir: 'dist-electron/main',
      emptyOutDir: true,
      lib: {
        entry: path.resolve(__dirname, 'electron/main.ts'),
        formats: ['cjs'],
        fileName: () => 'index.js',
      },
      rollupOptions: {
        output: { entryFileNames: 'index.js' },
      },
    },
    resolve: {
      alias: {
        '@angel/shared': path.resolve(__dirname, '../shared/src'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@angel/shared'] })],
    build: {
      outDir: 'dist-electron/preload',
      emptyOutDir: true,
      lib: {
        entry: path.resolve(__dirname, 'electron/preload.ts'),
        formats: ['cjs'],
        fileName: () => 'index.js',
      },
      rollupOptions: {
        output: { entryFileNames: 'index.js' },
      },
    },
    resolve: {
      alias: {
        '@angel/shared': path.resolve(__dirname, '../shared/src'),
      },
    },
  },
  renderer: {
    root: __dirname,
    publicDir: path.resolve(__dirname, 'public'),
    build: {
      outDir: 'dist-electron/renderer',
      rollupOptions: {
        input: path.resolve(__dirname, 'index.html'),
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@angel/shared': path.resolve(__dirname, '../shared/src'),
      },
    },
    server: {
      port: 5173,
    },
  },
});
