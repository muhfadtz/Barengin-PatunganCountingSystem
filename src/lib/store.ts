import { computed, ref } from 'vue'
import type { Expense, Member } from './split'
import { uid } from './format'
import type { OcrLang } from './localocr'

/**
 * Satu sesi patungan, hanya di memori. Tidak ada localStorage / sessionStorage / cookie:
 * data hilang saat halaman di-refresh atau ditutup.
 */
export interface Session {
  id: string
  name: string
  createdAt: number
  members: Member[]
  expenses: Expense[]
  /** Bahasa OCR struk, dipilih saat sesi dimulai. */
  ocrLang: OcrLang
}

// Hapus data yang pernah ditulis versi sebelumnya (sesi, riwayat, API key).
try {
  for (const k of ['barengin:v2', 'patungan:v1', 'barengin:gemini-key']) localStorage.removeItem(k)
} catch {
  /* storage diblokir: tidak ada yang perlu dibersihkan */
}

const session = ref<Session | null>(null)
const active = computed(() => session.value)

function startSession(name: string, members: Member[], expenses: Expense[] = [], ocrLang: OcrLang = 'ind+eng'): Session {
  const now = new Date()
  session.value = {
    id: uid(),
    name: name.trim() || `Sesi ${now.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}`,
    createdAt: now.getTime(),
    members: members.map((m) => ({ ...m })),
    expenses,
    ocrLang,
  }
  return session.value
}
function endSession() {
  session.value = null
}

export function useStore() {
  return { active, startSession, endSession }
}
