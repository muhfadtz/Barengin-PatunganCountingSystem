<script setup lang="ts">
import { computed } from 'vue'
import { Copy } from 'lucide-vue-next'
import { balances, settle, totalSpent } from '../lib/split'
import type { Expense, Member } from '../lib/split'
import { rupiah } from '../lib/format'
import { buildWhatsAppMessage } from '../lib/whatsapp'

const props = defineProps<{ title: string; members: Member[]; expenses: Expense[]; sessionName?: string }>()
const emit = defineEmits<{ (e: 'notify', msg: string): void }>()

const name = (id: string) => props.members.find((m) => m.id === id)?.name ?? '?'
const bal = computed(() => {
  try {
    return balances(props.members, props.expenses)
  } catch {
    return {} as Record<string, number>
  }
})
const transfers = computed(() => settle(bal.value))
const total = computed(() => totalSpent(props.expenses))
const rows = computed(() => props.members.map((m) => ({ m, v: bal.value[m.id] ?? 0 })))

async function copySummary() {
  if (!props.expenses.length) return
  const text = buildWhatsAppMessage(props.members, props.expenses, props.sessionName)
  const ok = 'Ringkasan disalin — tinggal tempel di WhatsApp'
  try {
    await navigator.clipboard.writeText(text)
    emit('notify', ok)
  } catch {
    // Fallback untuk konteks non-HTTPS / izin clipboard ditolak.
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    let done = false
    try {
      done = document.execCommand('copy')
    } catch {
      done = false
    }
    document.body.removeChild(ta)
    emit('notify', done ? ok : 'Browser menolak akses clipboard')
  }
}
</script>

<template>
  <div class="panel stack" style="gap: 20px">
    <div>
      <h2 class="h3">{{ title }}</h2>
      <p class="text-small muted-text" style="margin-top: 2px">Total pengeluaran</p>
      <p class="h2 money">{{ rupiah(total) }}</p>
    </div>

    <div v-if="!expenses.length" class="text-small muted-text">
      Belum ada item. Upload struk atau tambah pengeluaran manual.
    </div>

    <template v-else>
      <div class="stack" style="gap: 8px">
        <h3 class="text-body-md">Siapa transfer ke siapa</h3>
        <p v-if="!transfers.length" class="card text-small" style="border: 0">Semua sudah impas 🎉</p>
        <div v-for="(t, i) in transfers" :key="i" class="card list-row" style="border: 0">
          <span class="text-small" style="min-width: 0">
            <strong>{{ name(t.from) }}</strong> bayar ke <strong>{{ name(t.to) }}</strong>
          </span>
          <strong class="money">{{ rupiah(t.amount) }}</strong>
        </div>
      </div>

      <div class="stack" style="gap: 8px">
        <h3 class="text-body-md">Saldo bersih</h3>
        <div v-for="r in rows" :key="r.m.id" class="list-row text-small">
          <span>{{ r.m.name }}</span>
          <span class="money" :class="r.v > 0 ? 'pos' : r.v < 0 ? 'neg' : 'muted-text'">
            <template v-if="r.v > 0">+{{ rupiah(r.v) }} · menerima</template>
            <template v-else-if="r.v < 0">{{ rupiah(r.v) }} · harus bayar</template>
            <template v-else>Impas</template>
          </span>
        </div>
      </div>

      <button type="button" class="btn btn-primary btn-block" @click="copySummary">
        <Copy :size="20" aria-hidden="true" />
        Salin ke WhatsApp
      </button>
    </template>
  </div>
</template>
