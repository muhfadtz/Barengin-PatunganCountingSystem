<script setup lang="ts">
import { computed, ref } from 'vue'
import { Archive, ChevronRight, History, Plus, ReceiptText, Trash2, UserPlus, X } from 'lucide-vue-next'
import BarenginLogo from './components/BarenginLogo.vue'
import ExpenseForm from './components/ExpenseForm.vue'
import ExpenseList from './components/ExpenseList.vue'
import ReceiptBulkUpload from './components/ReceiptBulkUpload.vue'
import ResultPanel from './components/ResultPanel.vue'
import SessionStart from './components/SessionStart.vue'
import { useStore } from './lib/store'
import { totalSpent } from './lib/split'
import type { Expense, Member } from './lib/split'
import { rupiah, uid } from './lib/format'
import { sampleData } from './lib/sample'

const { active, history, startSession, closeSession, deleteSession } = useStore()

/* ── UI state ─────────────────────────────────────────── */
const view = ref<'session' | 'history'>('session')
const showExpenseForm = ref(false) // default tersembunyi supaya fokus ke daftar item
const showMemberForm = ref(false)
const openHistoryId = ref('')
const newName = ref('')
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined
function notify(msg: string) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 2600)
}

const members = computed(() => active.value?.members ?? [])
const expenses = computed(() => active.value?.expenses ?? [])
const openHistory = computed(() => history.value.find((s) => s.id === openHistoryId.value) ?? null)
const receiptCount = computed(() => new Set(expenses.value.map((e) => e.source).filter((s) => s?.startsWith('Struk'))).size)

const dateFmt = (t: number) =>
  new Date(t).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })

/* ── Sesi ─────────────────────────────────────────────── */
function onStart(name: string, list: Member[]) {
  startSession(name, list)
  view.value = 'session'
}
function onSample() {
  const d = sampleData()
  startSession('Contoh patungan', d.members, d.expenses)
  view.value = 'session'
}
function onClose() {
  const s = active.value
  if (!s) return
  if (!s.expenses.length) {
    if (!confirm('Sesi masih kosong, jadi akan dihapus (tidak masuk riwayat). Lanjutkan?')) return
    deleteSession(s.id)
    notify('Sesi kosong dihapus')
    return
  }
  if (!confirm(`Tutup sesi "${s.name}"? Sesi akan dipindah ke riwayat dan tidak bisa diubah lagi.`)) return
  closeSession()
  showExpenseForm.value = false
  showMemberForm.value = false
  view.value = 'history'
  openHistoryId.value = s.id
  notify('Sesi ditutup dan disimpan ke riwayat')
}
function onDeleteHistory(id: string, name: string) {
  if (!confirm(`Hapus "${name}" dari riwayat?`)) return
  deleteSession(id)
  if (openHistoryId.value === id) openHistoryId.value = ''
}

/* ── Anggota ──────────────────────────────────────────── */
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
function addMember() {
  const n = newName.value.trim()
  if (!n || !active.value) return
  if (members.value.some((m) => m.name.toLowerCase() === n.toLowerCase())) {
    notify('Nama itu sudah ada')
    return
  }
  active.value.members.push({ id: `m_${uid()}`, name: n })
  newName.value = ''
}
function removeMember(id: string) {
  if (active.value && canRemove(id)) active.value.members = active.value.members.filter((m) => m.id !== id)
}

/* ── Item ─────────────────────────────────────────────── */
function onImport(list: Expense[], receipts: number) {
  active.value?.expenses.push(...list)
  notify(`${list.length} item dari ${receipts} struk ditambahkan`)
}
function addExpense(e: Expense) {
  active.value?.expenses.push(e)
  notify('Pengeluaran ditambahkan')
}
function removeExpense(id: string) {
  if (active.value) active.value.expenses = active.value.expenses.filter((e) => e.id !== id)
}
function setAllPayer(ev: Event) {
  const id = (ev.target as HTMLSelectElement).value
  if (!id) return
  expenses.value.forEach((e) => (e.paidBy = id))
  ;(ev.target as HTMLSelectElement).value = ''
  notify('Semua item diatur dibayar oleh satu orang')
}
</script>

<template>
  <div>
    <header class="app-header">
      <div class="container-app header-inner">
        <BarenginLogo />
        <nav class="row" style="gap: 4px; flex-wrap: nowrap" aria-label="Navigasi">
          <button type="button" class="btn btn-sm" :class="view === 'session' ? 'btn-secondary' : 'btn-ghost'" :aria-current="view === 'session'" @click="view = 'session'">
            <ReceiptText :size="18" aria-hidden="true" />
            Sesi
          </button>
          <button type="button" class="btn btn-sm" :class="view === 'history' ? 'btn-secondary' : 'btn-ghost'" :aria-current="view === 'history'" @click="view = 'history'">
            <History :size="18" aria-hidden="true" />
            Riwayat
            <span v-if="history.length" class="badge">{{ history.length }}</span>
          </button>
        </nav>
      </div>
    </header>

    <main class="container-app page">
      <!-- ═════════ Sesi ═════════ -->
      <template v-if="view === 'session'">
        <SessionStart v-if="!active" @start="onStart" @sample="onSample" @notify="notify" />

        <div v-else class="layout">
          <aside class="col-side" aria-label="Hasil">
            <ResultPanel title="Hasil sementara" :members="members" :expenses="expenses" :session-name="active.name" @notify="notify" />
          </aside>

          <div class="col-main stack" style="gap: var(--section-gap)">
            <!-- Kepala sesi -->
            <section class="section">
              <div class="section-head">
                <div style="min-width: 0">
                  <p class="text-small muted-text">Sesi aktif · mulai {{ dateFmt(active.createdAt) }}</p>
                  <h1 class="h2" style="word-break: break-word">{{ active.name }}</h1>
                </div>
                <button type="button" class="btn btn-secondary btn-sm" @click="onClose">
                  <Archive :size="18" aria-hidden="true" />
                  Tutup sesi
                </button>
              </div>
            </section>

            <!-- 1. Upload bulk -->
            <section class="section" aria-labelledby="upload-title">
              <h2 id="upload-title" class="h3">Struk</h2>
              <ReceiptBulkUpload :members="members" :compact="expenses.length > 0" :source-offset="receiptCount" @import="onImport" />
            </section>

            <!-- 2. Anggota -->
            <section class="section" aria-labelledby="members-title">
              <div class="section-head" style="align-items: center">
                <h2 id="members-title" class="h3">Anggota</h2>
                <button
                  type="button"
                  class="btn btn-ghost btn-sm"
                  :aria-expanded="showMemberForm"
                  @click="showMemberForm = !showMemberForm"
                >
                  <component :is="showMemberForm ? X : UserPlus" :size="18" aria-hidden="true" />
                  {{ showMemberForm ? 'Tutup' : 'Tambah anggota' }}
                </button>
              </div>
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
                    <X :size="14" stroke-width="2.5" aria-hidden="true" />
                  </button>
                </span>
              </div>
              <form v-if="showMemberForm" class="row" style="flex-wrap: nowrap" @submit.prevent="addMember">
                <input v-model="newName" class="input" placeholder="Nama anggota baru" aria-label="Nama anggota baru" maxlength="24" autofocus />
                <button type="submit" class="btn btn-primary" :disabled="!newName.trim()" aria-label="Tambah anggota" title="Tambah">
                  <Plus :size="20" aria-hidden="true" />
                </button>
              </form>
            </section>

            <!-- 3. Daftar item -->
            <section class="section" aria-labelledby="list-title">
              <div class="section-head" style="align-items: center">
                <div class="row">
                  <h2 id="list-title" class="h3">Daftar item</h2>
                  <span v-if="expenses.length" class="badge">{{ expenses.length }} item</span>
                </div>
                <button
                  type="button"
                  class="btn btn-ghost btn-sm"
                  :aria-expanded="showExpenseForm"
                  @click="showExpenseForm = !showExpenseForm"
                >
                  <component :is="showExpenseForm ? X : Plus" :size="18" aria-hidden="true" />
                  {{ showExpenseForm ? 'Tutup' : 'Tambah manual' }}
                </button>
              </div>

              <ExpenseForm v-if="showExpenseForm" :members="members" @add="addExpense" @close="showExpenseForm = false" />

              <div v-if="!expenses.length" class="empty">Belum ada item. Upload struk di atas, atau tambah manual.</div>
              <template v-else>
                <div class="row text-small">
                  <label for="all-payer" class="muted-text">Semua dibayar oleh</label>
                  <select id="all-payer" class="input" style="width: auto; min-height: 40px" @change="setAllPayer">
                    <option value="">Pilih…</option>
                    <option v-for="m in members" :key="m.id" :value="m.id">{{ m.name }}</option>
                  </select>
                </div>
                <ExpenseList :members="members" :expenses="expenses" @remove="removeExpense" />
              </template>
            </section>
          </div>
        </div>
      </template>

      <!-- ═════════ Riwayat ═════════ -->
      <template v-else>
        <section class="section" style="max-width: 720px; margin-inline: auto" aria-labelledby="hist-title">
          <h1 id="hist-title" class="h2">Riwayat sesi</h1>
          <div v-if="!history.length" class="empty">Belum ada sesi yang ditutup.</div>

          <ul v-else class="stack" style="gap: 12px; list-style: none; padding: 0; margin: 0">
            <li v-for="s in history" :key="s.id" class="card">
              <div class="list-row">
                <button
                  type="button"
                  class="link-btn"
                  style="text-decoration: none; text-align: left; flex: 1; min-width: 0"
                  :aria-expanded="openHistoryId === s.id"
                  @click="openHistoryId = openHistoryId === s.id ? '' : s.id"
                >
                  <span class="row" style="flex-wrap: nowrap; gap: 8px">
                    <ChevronRight :size="20" class="chev" :class="{ 'chev-open': openHistoryId === s.id }" aria-hidden="true" />
                    <span style="min-width: 0">
                      <span class="h3" style="display: block; word-break: break-word">{{ s.name }}</span>
                      <span class="text-small muted-text" style="display: block; font-weight: 400">
                        {{ dateFmt(s.closedAt!) }} · {{ s.members.map((m) => m.name).join(', ') }} · {{ s.expenses.length }} item
                      </span>
                    </span>
                  </span>
                </button>
                <strong class="money">{{ rupiah(totalSpent(s.expenses)) }}</strong>
                <button type="button" class="icon-btn" :aria-label="`Hapus ${s.name}`" title="Hapus dari riwayat" @click="onDeleteHistory(s.id, s.name)">
                  <Trash2 :size="20" aria-hidden="true" />
                </button>
              </div>

              <div v-if="openHistory && openHistory.id === s.id" class="stack" style="gap: 16px; margin-top: 16px">
                <ResultPanel title="Hasil akhir" :members="s.members" :expenses="s.expenses" :session-name="s.name" @notify="notify" />
                <ExpenseList :members="s.members" :expenses="s.expenses" readonly />
              </div>
            </li>
          </ul>
        </section>
      </template>
    </main>

    <div v-if="toast" class="toast" role="status">{{ toast }}</div>
  </div>
</template>
