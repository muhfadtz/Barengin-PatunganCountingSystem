import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import type { ProxyOptions } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  // Variabel tanpa awalan VITE_ hanya terbaca di sini (server), tidak masuk ke bundle browser.
  const env = loadEnv(mode, '.', '')
  const endpoint = (env.PADDLEOCR_ENDPOINT ?? '').trim().replace(/\/+$/, '')

  const proxy: Record<string, ProxyOptions> = {}
  if (endpoint) {
    proxy['/api/ocr'] = {
      target: endpoint,
      changeOrigin: true,
      secure: true,
      rewrite: (p) => p.replace(/^\/api\/ocr/, ''),
      headers: { Authorization: `Bearer ${env.HF_TOKEN ?? ''}` },
    }
  }

  return {
    plugins: [vue(), tailwindcss()],
    server: { proxy },
    preview: { proxy },
    test: { environment: 'node', include: ['src/**/*.test.ts'] },
  }
})
