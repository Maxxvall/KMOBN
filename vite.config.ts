import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  const isElectron = mode.startsWith('electron');
  
  return {
    base: isElectron ? './' : '/',
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      ...(isElectron ? [] : [
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
            globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,ttf}'],
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
      ]),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    build: {
      outDir: 'dist',
      rollupOptions: {
        output: {
          manualChunks: {
            ...(isElectron ? {} : { wiki: ['./components/Wiki/index.tsx'] }),
            charts: ['recharts'],
          },
        },
      },
    },
  };
});
