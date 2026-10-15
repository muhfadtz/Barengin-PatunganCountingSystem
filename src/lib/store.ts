import { ref, watch } from 'vue'
import type { Expense, Member } from './split'

export const STORAGE_KEY = 'patungan:v1'

interface Persisted {
  members: Member[]
  expenses: Expense[]
}

function load(): Persisted {
  const empty: Persisted = { members: [], expenses: [] }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return empty
    const data = JSON.parse(raw)
    return {
      members: Array.isArray(data?.members) ? data.members : [],
      expenses: Array.isArray(data?.expenses) ? data.expenses : [],
    }
  } catch {
    return empty
  }
}

const initial = load()
const members = ref<Member[]>(initial.members)
const expenses = ref<Expense[]>(initial.expenses)
let started = false

/** State bersama + persistence otomatis ke localStorage. */
export function useStore() {
  if (!started) {
    started = true
    watch(
      [members, expenses],
      () => {
        try {
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ members: members.value, expenses: expenses.value }),
          )
        } catch {
          /* storage penuh / diblokir: abaikan */
        }
      },
      { deep: true },
    )
  }
  return { members, expenses }
}
