import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      // Removed embedding of GEMINI_API_KEY here so secrets are not baked into client bundles.
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        rollupOptions: {
          output: {
            manualChunks: {
              wiki: ['./components/Wiki/index.tsx'],
              vendor: ['react', 'react-dom'],
              charts: ['recharts'],
            },
          },
        },
      },
    };
});
