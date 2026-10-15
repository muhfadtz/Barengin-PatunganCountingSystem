<script setup lang="ts">
import { computed } from 'vue'
import { Trash2 } from 'lucide-vue-next'
import { computeShares, expenseTotal } from '../lib/split'
import type { Expense, Member } from '../lib/split'
import { rupiah, toInt } from '../lib/format'

const props = defineProps<{ members: Member[]; expenses: Expense[]; readonly?: boolean }>()
const emit = defineEmits<{ (e: 'remove', id: string): void }>()

const name = (id: string) => props.members.find((m) => m.id === id)?.name ?? '?'

const rows = computed(() =>
  props.expenses.map((e) => {
    let shares: [string, number][] = []
    try {
      shares = Object.entries(computeShares(e)).filter(([, v]) => v > 0)
    } catch {
      /* data rusak: tampilkan tanpa rincian */
    }
    return { e, shares }
  }),
)

/** Item hasil scan / pembagian rata bisa diatur langsung dari daftar. */
const isEqual = (e: Expense) => e.split.type === 'equal'
const amongOf = (e: Expense) => (e.split.type === 'equal' ? e.split.among : [])

function toggle(e: Expense, id: string) {
  if (props.readonly || e.split.type !== 'equal') return
  const has = e.split.among.includes(id)
  // Minimal satu orang harus ikut membagi.
  if (has && e.split.among.length === 1) return
  e.split.among = has ? e.split.among.filter((x) => x !== id) : [...e.split.among, id]
}
function shareAll(e: Expense) {
  if (e.split.type === 'equal') e.split.among = props.members.map((m) => m.id)
}
function setAmount(e: Expense, ev: Event) {
  const input = ev.target as HTMLInputElement
  const v = toInt(input.value)
  if (v > 0) e.amount = v
  input.value = String(e.amount)
}
function setTitle(e: Expense, ev: Event) {
  e.title = (ev.target as HTMLInputElement).value.trim() || e.title
}
function splitLabel(e: Expense) {
  const s = e.split
  if (s.type === 'exclusive') return `Ditanggung ${name(s.owner)}`
  return 'Pembagian custom'
}
</script>

<template>
  <ul class="stack" style="gap: 12px; list-style: none; padding: 0; margin: 0">
    <li v-for="r in rows" :key="r.e.id" class="card">
      <!-- Mode lihat saja (riwayat) -->
      <template v-if="readonly">
        <div class="list-row" style="align-items: flex-start">
          <div style="min-width: 0">
            <p class="h3" style="word-break: break-word">{{ r.e.title }}</p>
            <p class="text-small muted-text" style="margin-top: 2px">
              Dibayar {{ name(r.e.paidBy) }}<template v-if="r.e.source"> · {{ r.e.source }}</template>
            </p>
          </div>
          <p class="text-body-md money">{{ rupiah(expenseTotal(r.e)) }}</p>
        </div>
        <div class="chip-row" style="gap: 6px; margin-top: 12px">
          <span v-for="[id, v] in r.shares" :key="id" class="chip chip-static text-small">
            {{ name(id) }} · <span class="money">{{ rupiah(v) }}</span>
          </span>
        </div>
      </template>

      <!-- Mode edit -->
      <template v-else>
        <div class="row" style="flex-wrap: nowrap; align-items: flex-start">
          <div class="stack" style="gap: 8px; flex: 1; min-width: 0">
            <input
              :value="r.e.title"
              class="input"
              maxlength="60"
              aria-label="Nama item"
              @change="setTitle(r.e, $event)"
            />
            <div class="row" style="flex-wrap: nowrap">
              <input
                :value="r.e.amount"
                class="input"
                inputmode="numeric"
                aria-label="Nominal item"
                :disabled="!isEqual(r.e) && r.e.split.type !== 'exclusive'"
                @change="setAmount(r.e, $event)"
              />
              <select v-model="r.e.paidBy" class="input" aria-label="Dibayar oleh" style="min-width: 0">
                <option v-for="m in members" :key="m.id" :value="m.id">Bayar: {{ m.name }}</option>
              </select>
            </div>
          </div>
          <button type="button" class="icon-btn" :aria-label="`Hapus ${r.e.title}`" title="Hapus item" @click="emit('remove', r.e.id)">
            <Trash2 :size="20" aria-hidden="true" />
          </button>
        </div>

        <div style="margin-top: 12px">
          <template v-if="isEqual(r.e)">
            <div class="list-row" style="margin-bottom: 6px">
              <span class="text-small muted-text">Dibagi ke</span>
              <button
                v-if="amongOf(r.e).length < members.length"
                type="button"
                class="link-btn"
                @click="shareAll(r.e)"
              >
                Semua
              </button>
            </div>
            <div class="chip-row">
              <button
                v-for="m in members"
                :key="m.id"
                type="button"
                class="chip"
                :class="{ 'chip-active': amongOf(r.e).includes(m.id) }"
                :aria-pressed="amongOf(r.e).includes(m.id)"
                @click="toggle(r.e, m.id)"
              >
                {{ m.name }}
              </button>
            </div>
          </template>
          <p v-else class="text-small muted-text">{{ splitLabel(r.e) }}</p>
        </div>

        <div class="list-row text-small" style="margin-top: 10px">
          <span class="muted-text">
            <template v-if="r.e.source">{{ r.e.source }}</template>
            <template v-if="r.e.tax !== 0">
              {{ r.e.source ? ' · ' : '' }}{{ r.e.tax < 0 ? 'diskon' : 'pajak/service' }} {{ rupiah(Math.abs(r.e.tax)) }}
            </template>
          </span>
          <strong class="money">{{ rupiah(expenseTotal(r.e)) }}</strong>
        </div>
      </template>
    </li>
  </ul>
</template>
