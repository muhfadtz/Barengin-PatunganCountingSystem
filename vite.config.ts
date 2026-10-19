import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import type { ProxyOptions } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  // Variabel tanpa awalan VITE_ hanya terbaca di sini (server), tidak masuk ke bundle browser.
  const env = loadEnv(mode, '.', '')
  const llmTarget = (env.LLM_BASE_URL || 'https://router.huggingface.co').trim().replace(/\/+$/, '')
  const auth = env.HF_TOKEN ? { Authorization: `Bearer ${env.HF_TOKEN}` } : {}

  const proxy: Record<string, ProxyOptions> = {
    // LLM kecil untuk parsing teks OCR (Hugging Face Inference Providers, API OpenAI-compatible).
    '/api/llm': {
      target: llmTarget,
      changeOrigin: true,
      secure: true,
      rewrite: (p) => p.replace(/^\/api\/llm/, ''),
      headers: auth,
    },
  }

  return {
    plugins: [vue(), tailwindcss()],
    server: { proxy },
    preview: { proxy },
    test: { environment: 'node', include: ['src/**/*.test.ts'] },
  }
})
