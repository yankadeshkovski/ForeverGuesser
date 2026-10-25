import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  server: {
    proxy: {
      // PFAS explanation server (must come first: the first matching entry wins)
      '/api/pfas-explain': 'http://localhost:3001',
      // your existing backend
      '/api': 'http://localhost:8000',
    },
  },
})