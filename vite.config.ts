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
          includeAssets: ['icon.svg', 'icon.png'],
          manifest: {
            name: 'Каркас Мастер - Генератор смет',
            short_name: 'КаркасМастер',
            description: 'Генератор строительных смет',
            theme_color: '#1e293b',
            background_color: '#0f172a',
            display: 'standalone',
            icons: [
              { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
            ],
          },
          workbox: {
            globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,ttf}'],
            // User data is persisted by the versioned IndexedDB cache and
            // outbox. Caching Supabase responses here can replay stale rows as
            // if they were a fresh complete server snapshot.
            runtimeCaching: [],
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
