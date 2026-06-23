import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['favicon.ico'],
          manifest: {
            name: 'Каркас Мастер - Генератор смет',
            short_name: 'КаркасМастер',
            description: 'Генератор строительных смет',
            theme_color: '#1e293b',
            background_color: '#0f172a',
            display: 'standalone',
            icons: [
              { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
              { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
            ],
          },
          workbox: {
            globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
            runtimeCaching: [
              {
                urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
                handler: 'NetworkFirst',
                options: {
                  cacheName: 'supabase-api',
                  expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
                },
              },
            ],
          },
        }),
      ],
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
