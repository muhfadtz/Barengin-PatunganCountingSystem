import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import type { ProxyOptions } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  // Variabel tanpa awalan VITE_ hanya terbaca di sini (server), tidak masuk ke bundle browser.
  const env = loadEnv(mode, '.', '')
  const key = (env.GEMINI_API_KEY ?? '').trim()

  // Proxy `/api/gemini/*` → Google AI (Gemini API) dengan API key di sisi server.
  const proxy: Record<string, ProxyOptions> = {
    '/api/gemini': {
      target: (env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').trim().replace(/\/+$/, ''),
      changeOrigin: true,
      secure: true,
      rewrite: (p) => p.replace(/^\/api\/gemini/, ''),
      headers: key ? { 'x-goog-api-key': key } : {},
    },
  }

  return {
    plugins: [vue(), tailwindcss()],
    server: { proxy },
    preview: { proxy },
    test: { environment: 'node', include: ['src/**/*.test.ts', 'api/**/*.test.ts'] },
  }
})
