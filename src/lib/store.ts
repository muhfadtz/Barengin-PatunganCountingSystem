import { computed, ref, watch } from 'vue'
import type { Expense, Member } from './split'
import { uid } from './format'

export const STORAGE_KEY = 'barengin:v2'
const LEGACY_KEY = 'patungan:v1'

/** Satu sesi patungan. Sesi aktif punya `closedAt === null`; yang sudah ditutup masuk riwayat. */
export interface Session {
  id: string
  name: string
  createdAt: number
  closedAt: number | null
  members: Member[]
  expenses: Expense[]
}

function isSession(s: unknown): s is Session {
  const x = s as Session
  return !!x && typeof x.id === 'string' && Array.isArray(x.members) && Array.isArray(x.expenses)
}

function load(): Session[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      const list: Session[] = Array.isArray(data?.sessions) ? data.sessions.filter(isSession) : []
      // Jaga invarian: hanya boleh ada satu sesi aktif.
      let seenActive = false
      for (const s of list) {
        if (s.closedAt === null) {
          if (seenActive) s.closedAt = s.createdAt
          seenActive = true
        }
      }
      return list
    }
    // Migrasi data versi lama (satu daftar anggota + pengeluaran) menjadi satu sesi aktif.
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy) {
      const d = JSON.parse(legacy)
      if (Array.isArray(d?.members) && d.members.length >= 2) {
        return [
          {
            id: uid(),
            name: 'Sesi sebelumnya',
            createdAt: Date.now(),
            closedAt: null,
            members: d.members,
            expenses: Array.isArray(d.expenses) ? d.expenses : [],
          },
        ]
      }
    }
  } catch {
    /* data rusak: mulai kosong */
  }
  return []
}

const sessions = ref<Session[]>(load())
const active = computed(() => sessions.value.find((s) => s.closedAt === null) ?? null)
const history = computed(() =>
  sessions.value.filter((s) => s.closedAt !== null).sort((a, b) => b.closedAt! - a.closedAt!),
)
let started = false

function startSession(name: string, members: Member[], expenses: Expense[] = []): Session {
  const now = new Date()
  const session: Session = {
    id: uid(),
    name: name.trim() || `Sesi ${now.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}`,
    createdAt: now.getTime(),
    closedAt: null,
    members: members.map((m) => ({ ...m })),
    expenses,
  }
  sessions.value.push(session)
  return session
}
function closeSession() {
  if (active.value) active.value.closedAt = Date.now()
}
function deleteSession(id: string) {
  sessions.value = sessions.value.filter((s) => s.id !== id)
}

/** State bersama + persistence otomatis ke localStorage. */
export function useStore() {
  if (!started) {
    started = true
    watch(
      sessions,
      () => {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessions: sessions.value }))
        } catch {
          /* storage penuh / diblokir: abaikan */
        }
      },
      { deep: true },
    )
  }
  return { sessions, active, history, startSession, closeSession, deleteSession }
}
