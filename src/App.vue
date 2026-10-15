<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import BagiinLogo from './components/BagiinLogo.vue'
import SplitSelector from './components/SplitSelector.vue'
import ReceiptUploadModal from './components/ReceiptUploadModal.vue'
import { useStore } from './lib/store'
import { balances, computeShares, expenseTotal, settle, totalSpent } from './lib/split'
import type { Expense, Split } from './lib/split'
import { rupiah, toInt, uid } from './lib/format'
import { buildWhatsAppMessage } from './lib/whatsapp'
import { DEFAULT_CUSTOM_MEMBERS, DUO_MEMBERS, sampleData } from './lib/sample'

const { members, expenses } = useStore()

/* ── UI state ─────────────────────────────────────────── */
const showOcr = ref(false)
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined
function notify(msg: string) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 2600)
}

const name = (id: string) => members.value.find((m) => m.id === id)?.name ?? '?'

/* ── Anggota & template ───────────────────────────────── */
const newName = ref('')

function sameMembers(a: { id: string }[], b: { id: string }[]) {
  return a.length === b.length && a.every((m, i) => m.id === b[i].id)
}
function applyDuo() {
  if (sameMembers(members.value, DUO_MEMBERS)) return
  if (expenses.value.length && !confirm('Mengganti anggota akan menghapus semua pengeluaran saat ini. Lanjutkan?')) return
  expenses.value = []
  members.value = DUO_MEMBERS.map((m) => ({ ...m }))
}
function applyCustom() {
  if (members.value.length === 0) members.value = DEFAULT_CUSTOM_MEMBERS.map((m) => ({ ...m }))
}
function addMember() {
  const n = newName.value.trim()
  if (!n) return
  if (members.value.some((m) => m.name.toLowerCase() === n.toLowerCase())) {
    notify('Nama itu sudah ada')
    return
  }
  members.value.push({ id: `m_${uid()}`, name: n })
  newName.value = ''
}
function isUsed(id: string) {
  return expenses.value.some((e) => {
    if (e.paidBy === id) return true
    const s = e.split
    if (s.type === 'equal') return s.among.includes(id)
    if (s.type === 'exclusive') return s.owner === id
    return (s.shares[id] ?? 0) > 0
  })
}
const canRemove = (id: string) => members.value.length > 2 && !isUsed(id)
function removeMember(id: string) {
  if (canRemove(id)) members.value = members.value.filter((m) => m.id !== id)
}

/* ── Form pengeluaran ─────────────────────────────────── */
const form = reactive({ title: '', amount: '', tax: '', taxKind: 'plus' as 'plus' | 'minus', paidBy: '' })
const split = ref<Split>({ type: 'equal', among: [] })

watch(
  members,
  (list) => {
    if (!list.some((m) => m.id === form.paidBy)) form.paidBy = list[0]?.id ?? ''
  },
  { immediate: true, deep: true },
)

const amountInt = computed(() => toInt(form.amount))
const taxInt = computed(() => toInt(form.tax) * (form.taxKind === 'minus' ? -1 : 1))

function draft(): Expense {
  return {
    id: 'draft',
    title: form.title,
    amount: amountInt.value,
    tax: taxInt.value,
    paidBy: form.paidBy,
    split: split.value,
  }
}
const draftError = computed(() => {
  if (amountInt.value <= 0) return ''
  try {
    computeShares(draft())
    return ''
  } catch (e) {
    return e instanceof Error ? e.message : 'Input tidak valid'
  }
})
const canAdd = computed(
  () => members.value.length >= 2 && amountInt.value > 0 && !!form.paidBy && !draftError.value,
)
const draftTotal = computed(() => amountInt.value + taxInt.value)

function addExpense() {
  if (!canAdd.value) return
  expenses.value.push({
    id: uid(),
    title: form.title.trim() || 'Pengeluaran',
    amount: amountInt.value,
    tax: taxInt.value,
    paidBy: form.paidBy,
    split: JSON.parse(JSON.stringify(split.value)) as Split,
  })
  form.title = ''
  form.amount = ''
  form.tax = ''
  form.taxKind = 'plus'
  notify('Pengeluaran ditambahkan')
}
function removeExpense(id: string) {
  expenses.value = expenses.value.filter((e) => e.id !== id)
}
function onImport(list: Expense[]) {
  expenses.value.push(...list)
  showOcr.value = false
  notify(`${list.length} item dari struk diimpor`)
}

/* ── Hasil ────────────────────────────────────────────── */
const bal = computed(() => {
  try {
    return balances(members.value, expenses.value)
  } catch {
    return {} as Record<string, number>
  }
})
const transfers = computed(() => settle(bal.value))
const total = computed(() => totalSpent(expenses.value))
const balanceRows = computed(() => members.value.map((m) => ({ m, v: bal.value[m.id] ?? 0 })))

const expenseRows = computed(() =>
  expenses.value.map((e) => {
    let shares: [string, number][] = []
    try {
      shares = Object.entries(computeShares(e)).filter(([, v]) => v > 0)
    } catch {
      /* data rusak: tampilkan tanpa rincian */
    }
    return { e, shares }
  }),
)

function splitLabel(e: Expense) {
  const s = e.split
  if (s.type === 'equal') {
    return s.among.length === members.value.length
      ? 'Dibagi rata'
      : `Rata: ${s.among.map(name).join(', ')}`
  }
  if (s.type === 'exclusive') return `Ditanggung ${name(s.owner)}`
  return 'Custom'
}

/* ── Aksi header ──────────────────────────────────────── */
function loadSample() {
  if ((members.value.length || expenses.value.length) && !confirm('Data saat ini akan diganti dengan contoh. Lanjutkan?')) return
  const d = sampleData()
  members.value = d.members
  expenses.value = d.expenses
}
function resetAll() {
  if (!members.value.length && !expenses.value.length) return
  if (!confirm('Hapus semua anggota dan pengeluaran?')) return
  members.value = []
  expenses.value = []
}

async function copySummary() {
  if (!expenses.value.length) return
  const text = buildWhatsAppMessage(members.value, expenses.value)
  try {
    await navigator.clipboard.writeText(text)
    notify('Ringkasan disalin — tinggal tempel di WhatsApp')
  } catch {
    // Fallback untuk konteks non-HTTPS / izin clipboard ditolak.
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    document.body.removeChild(ta)
    notify(ok ? 'Ringkasan disalin — tinggal tempel di WhatsApp' : 'Browser menolak akses clipboard')
  }
}
</script>

<template>
  <div>
    <!-- Header -->
    <header class="app-header">
      <div class="container-app header-inner">
        <BagiinLogo />
        <div class="row" style="gap: 4px; flex-wrap: nowrap">
          <button type="button" class="btn btn-secondary btn-sm" @click="loadSample">Contoh</button>
          <button type="button" class="btn btn-ghost btn-sm" @click="resetAll">Reset</button>
        </div>
      </div>
    </header>

    <main class="container-app page">
      <section class="hero">
        <h1 class="h1">Bagi tagihan, tanpa ribut.</h1>
        <p class="muted-text" style="margin-top: 12px">
          Catat pengeluaran bareng, scan struk, dan lihat siapa harus transfer ke siapa.
          Semua tersimpan di browser kamu.
        </p>
      </section>

      <div class="layout">
        <!-- Ringkasan (di mobile tampil paling atas, di desktop sticky di kanan) -->
        <aside class="col-side" aria-labelledby="summary-title">
          <div class="panel stack" style="gap: 20px">
            <div>
              <h2 id="summary-title" class="h3">Hasil akhir</h2>
              <p class="text-small muted-text" style="margin-top: 2px">Total pengeluaran</p>
              <p class="h2 money">{{ rupiah(total) }}</p>
            </div>

            <div v-if="!expenses.length" class="text-small muted-text">
              Belum ada pengeluaran. Tambahkan lewat form atau scan struk.
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
                <div v-for="r in balanceRows" :key="r.m.id" class="list-row text-small">
                  <span>{{ r.m.name }}</span>
                  <span class="money" :class="r.v > 0 ? 'pos' : r.v < 0 ? 'neg' : 'muted-text'">
                    <template v-if="r.v > 0">+{{ rupiah(r.v) }} · menerima</template>
                    <template v-else-if="r.v < 0">{{ rupiah(r.v) }} · harus bayar</template>
                    <template v-else>Impas</template>
                  </span>
                </div>
              </div>

              <button type="button" class="btn btn-primary btn-block" @click="copySummary">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect x="9" y="9" width="12" height="12" rx="2" />
                  <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                </svg>
                Salin ke WhatsApp
              </button>
            </template>
          </div>
        </aside>

        <div class="col-main stack" style="gap: var(--section-gap)">
          <!-- Anggota -->
          <section class="section" aria-labelledby="members-title">
            <div class="section-head">
              <h2 id="members-title" class="h2">Anggota</h2>
              <button
                v-if="members.length && !(members.length === 2 && members[0].id === 'gue' && members[1].id === 'dia')"
                type="button"
                class="link-btn"
                @click="applyDuo"
              >
                Pakai template Gue &amp; Dia
              </button>
            </div>

            <div v-if="!members.length" class="template-grid">
              <button type="button" class="template-card" @click="applyDuo">
                <span class="h3">Gue &amp; Dia</span>
                <span class="text-small muted-text">Template cepat untuk berdua.</span>
              </button>
              <button type="button" class="template-card" @click="applyCustom">
                <span class="h3">Buat sendiri</span>
                <span class="text-small muted-text">Jumlah anggota bebas, mulai dari Andi, Budi, Citra.</span>
              </button>
            </div>

            <template v-else>
              <div class="chip-row">
                <span v-for="m in members" :key="m.id" class="chip chip-static" style="padding-right: 4px">
                  <span class="avatar" aria-hidden="true">{{ m.name.charAt(0).toUpperCase() }}</span>
                  {{ m.name }}
                  <button
                    type="button"
                    class="icon-btn"
                    style="width: 28px; height: 28px"
                    :disabled="!canRemove(m.id)"
                    :aria-label="`Hapus ${m.name}`"
                    :title="isUsed(m.id) ? 'Sudah dipakai di pengeluaran' : members.length <= 2 ? 'Minimal 2 anggota' : `Hapus ${m.name}`"
                    @click="removeMember(m.id)"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              </div>
              <form class="row" style="flex-wrap: nowrap" @submit.prevent="addMember">
                <input v-model="newName" class="input" placeholder="Tambah anggota" aria-label="Nama anggota baru" maxlength="24" />
                <button type="submit" class="btn btn-secondary" :disabled="!newName.trim()">Tambah</button>
              </form>
            </template>
          </section>

          <!-- Tambah pengeluaran -->
          <section class="section" aria-labelledby="add-title">
            <h2 id="add-title" class="h2">Tambah pengeluaran</h2>

            <div v-if="members.length < 2" class="empty">
              Pilih template atau tambah minimal 2 anggota dulu.
            </div>

            <form v-else class="stack" style="gap: 20px" @submit.prevent="addExpense">
              <div>
                <label class="label" for="f-title">Judul</label>
                <input id="f-title" v-model="form.title" class="input" placeholder="Mis. Makan malam" maxlength="60" autocomplete="off" />
              </div>

              <div class="grid-2">
                <div>
                  <label class="label" for="f-amount">Nominal</label>
                  <input id="f-amount" v-model="form.amount" class="input" inputmode="numeric" placeholder="Rp 35.000" autocomplete="off" />
                </div>
                <div>
                  <label class="label" for="f-paid">Dibayar oleh</label>
                  <select id="f-paid" v-model="form.paidBy" class="input">
                    <option v-for="m in members" :key="m.id" :value="m.id">{{ m.name }}</option>
                  </select>
                </div>
              </div>

              <div>
                <span class="label">Pajak / service / diskon (opsional)</span>
                <div class="row" style="flex-wrap: nowrap">
                  <div class="chip-row" style="flex-wrap: nowrap">
                    <button type="button" class="chip" :class="{ 'chip-active': form.taxKind === 'plus' }" :aria-pressed="form.taxKind === 'plus'" @click="form.taxKind = 'plus'">+ Pajak</button>
                    <button type="button" class="chip" :class="{ 'chip-active': form.taxKind === 'minus' }" :aria-pressed="form.taxKind === 'minus'" @click="form.taxKind = 'minus'">− Diskon</button>
                  </div>
                  <input v-model="form.tax" class="input" inputmode="numeric" placeholder="0" aria-label="Nominal pajak atau diskon" autocomplete="off" />
                </div>
                <p v-if="amountInt > 0" class="hint">
                  Total: {{ rupiah(amountInt) }} {{ taxInt < 0 ? '−' : '+' }} {{ rupiah(Math.abs(taxInt)) }} =
                  <strong>{{ rupiah(draftTotal) }}</strong>
                </p>
              </div>

              <SplitSelector :members="members" :amount="amountInt" @change="split = $event" />

              <p v-if="draftError" class="field-error" role="alert">{{ draftError }}</p>

              <div class="row" style="gap: 12px">
                <button type="submit" class="btn btn-primary" :disabled="!canAdd">Tambah pengeluaran</button>
                <button type="button" class="btn btn-secondary" @click="showOcr = true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M14.5 4h-5L8 6H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3z" />
                    <circle cx="12" cy="13" r="3.5" />
                  </svg>
                  Scan struk
                </button>
              </div>
            </form>
          </section>

          <!-- Daftar pengeluaran -->
          <section class="section" aria-labelledby="list-title">
            <div class="section-head">
              <h2 id="list-title" class="h2">Daftar pengeluaran</h2>
              <span v-if="expenses.length" class="badge">{{ expenses.length }} transaksi</span>
            </div>

            <div v-if="!expenses.length" class="empty">Belum ada pengeluaran.</div>

            <ul v-else class="stack" style="gap: 12px; list-style: none; padding: 0; margin: 0">
              <li v-for="r in expenseRows" :key="r.e.id" class="card">
                <div class="list-row" style="align-items: flex-start">
                  <div style="min-width: 0">
                    <p class="h3" style="word-break: break-word">{{ r.e.title }}</p>
                    <p class="text-small muted-text" style="margin-top: 2px">
                      Dibayar {{ name(r.e.paidBy) }} · {{ splitLabel(r.e) }}
                    </p>
                  </div>
                  <div style="text-align: right">
                    <p class="text-body-md money">{{ rupiah(expenseTotal(r.e)) }}</p>
                    <p v-if="r.e.tax !== 0" class="text-tiny muted-text money">
                      {{ rupiah(r.e.amount) }} {{ r.e.tax < 0 ? '−' : '+' }} {{ rupiah(Math.abs(r.e.tax)) }}
                    </p>
                  </div>
                </div>

                <div class="list-row" style="margin-top: 12px; align-items: flex-end">
                  <div class="chip-row" style="gap: 6px">
                    <span v-for="[id, v] in r.shares" :key="id" class="chip chip-static text-small">
                      {{ name(id) }} · <span class="money">{{ rupiah(v) }}</span>
                    </span>
                  </div>
                  <button type="button" class="icon-btn" :aria-label="`Hapus ${r.e.title}`" @click="removeExpense(r.e.id)">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                    </svg>
                  </button>
                </div>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </main>

    <ReceiptUploadModal v-if="showOcr" :members="members" @close="showOcr = false" @import="onImport" />

    <div v-if="toast" class="toast" role="status">{{ toast }}</div>
  </div>
</template>
