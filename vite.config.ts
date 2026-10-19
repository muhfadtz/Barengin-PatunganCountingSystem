import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import type { ProxyOptions } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  // Variabel tanpa awalan VITE_ hanya terbaca di sini (server), tidak masuk ke bundle browser.
  const env = loadEnv(mode, '.', '')
  const target = (env.UNLIMITED_OCR_URL || 'https://baidu-unlimited-ocr.hf.space').trim().replace(/\/+$/, '')

  // Proxy `/api/ocr/*` → Space OCR dengan token HF di sisi server.
  const proxy: Record<string, ProxyOptions> = {
    '/api/ocr': {
      target,
      changeOrigin: true,
      secure: true,
      rewrite: (p) => p.replace(/^\/api\/ocr/, ''),
      headers: env.HF_TOKEN ? { Authorization: `Bearer ${env.HF_TOKEN}` } : {},
    },
  }

  return {
    plugins: [vue(), tailwindcss()],
    server: { proxy },
    preview: { proxy },
    test: { environment: 'node', include: ['src/**/*.test.ts'] },
  }
})
