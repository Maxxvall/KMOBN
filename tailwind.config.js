export default {
  content: [
    './index.html',
    './App.tsx',
    './index.tsx',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './services/**/*.ts',
    './api/**/*.ts',
  ],
  theme: {
    extend: {
      colors: {
        background: '#111827',
        surface: '#1F2937',
        primary: '#DC2626',
        'primary-hover': '#B91C1C',
        'text-primary': '#F9FAFB',
        'text-secondary': '#9CA3AF',
        border: '#374151',
      },
      // '8xl' — единая ширина контента и шапки (1500px, как в Cutting/HouseCalculator).
      maxWidth: {
        '8xl': '93.75rem',
      },
      screens: {
        // Плоская зона 1536–2560px: правила раскладки для 1920px+.
        '3xl': '1920px',
      },
    },
  },
  plugins: [],
};