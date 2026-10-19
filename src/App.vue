<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { ChevronDown, Plus, RotateCcw, UserPlus, X } from 'lucide-vue-next'
import BaseSelect from './components/BaseSelect.vue'
import MemberAvatar from './components/MemberAvatar.vue'
import BarenginLogo from './components/BarenginLogo.vue'
import ExpenseForm from './components/ExpenseForm.vue'
import ExpenseList from './components/ExpenseList.vue'
import ReceiptBulkUpload from './components/ReceiptBulkUpload.vue'
import ResultPanel from './components/ResultPanel.vue'
import SessionStart from './components/SessionStart.vue'
import { useStore } from './lib/store'
import type { Expense, Member } from './lib/split'
import { uid } from './lib/format'
import { sampleData } from './lib/sample'

const { active, startSession, endSession } = useStore()

/* ── UI state ─────────────────────────────────────────── */
const showExpenseForm = ref(false) // default tersembunyi supaya fokus ke daftar item
const showMembers = ref(false) // panel anggota: ringkas (stack avatar) sampai dibuka
const memberInput = ref<HTMLInputElement>()
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
const receiptCount = computed(() => new Set(expenses.value.map((e) => e.source).filter((x) => x?.startsWith('Struk'))).size)

const dateFmt = (t: number) =>
  new Date(t).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })

/* ── Sesi ─────────────────────────────────────────────── */
function onStart(name: string, list: Member[]) {
  startSession(name, list)
}
function onSample() {
  const d = sampleData()
  startSession('Contoh patungan', d.members, d.expenses)
}
function onReset() {
  const s = active.value
  if (!s) return
  if (s.expenses.length && !confirm(`Mulai sesi baru? Semua data "${s.name}" akan dihapus dan tidak bisa dikembalikan.`)) return
  endSession()
  showExpenseForm.value = false
  showMembers.value = false
}
// Data hanya di memori: ingatkan sebelum halaman ditutup / di-refresh.
function warnUnload(e: BeforeUnloadEvent) {
  if (expenses.value.length) e.preventDefault()
}
onMounted(() => window.addEventListener('beforeunload', warnUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', warnUnload))

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
const memberOptions = computed(() => members.value.map((m) => ({ value: m.id, label: m.name })))
function openAddMember() {
  showMembers.value = true
  nextTick(() => memberInput.value?.focus())
}
function setAllPayer(id: string) {
  if (!id) return
  expenses.value.forEach((e) => (e.paidBy = id))
  notify('Semua item diatur dibayar oleh satu orang')
}
</script>

<template>
  <div>
    <header class="app-header">
      <div class="container-app header-inner">
        <BarenginLogo />
      </div>
    </header>

    <main class="container-app page">
      <!-- ═════════ Sesi ═════════ -->
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
                  <p class="text-small muted-text">Sesi berjalan · mulai {{ dateFmt(active.createdAt) }} · data tidak disimpan</p>
                  <h1 class="h2" style="word-break: break-word">{{ active.name }}</h1>
                </div>
                <button type="button" class="btn btn-secondary btn-sm" @click="onReset">
                  <RotateCcw :size="18" aria-hidden="true" />
                  Sesi baru
                </button>
              </div>
            </section>

            <!-- Upload struk (bulk) -->
            <section class="section" aria-labelledby="upload-title">
              <h2 id="upload-title" class="h3">Struk</h2>
              <ReceiptBulkUpload :members="members" :compact="expenses.length > 0" :source-offset="receiptCount" @import="onImport" />
            </section>

            <!-- Anggota (ringkas) & daftar item -->
            <section class="section" style="gap: 12px" aria-labelledby="list-title">
              <div class="member-bar">
                <button
                  type="button"
                  class="member-toggle"
                  :aria-expanded="showMembers"
                  aria-controls="member-panel"
                  @click="showMembers = !showMembers"
                >
                  <span class="avatar-stack">
                    <MemberAvatar v-for="m in members.slice(0, 5)" :key="m.id" :name="m.name" :size="30" />
                    <span v-if="members.length > 5" class="m-avatar m-avatar-more" style="width: 30px; height: 30px">+{{ members.length - 5 }}</span>
                  </span>
                  <span class="text-small" style="font-weight: 600">{{ members.length }} anggota</span>
                  <ChevronDown :size="16" class="select-chev" :class="{ 'select-chev-open': showMembers }" aria-hidden="true" />
                </button>
                <button type="button" class="pill-btn" @click="openAddMember">
                  <UserPlus :size="16" aria-hidden="true" />
                  Anggota
                </button>
              </div>

              <div v-if="showMembers" id="member-panel" class="member-panel">
                <div class="chip-row" style="gap: 6px">
                  <span v-for="m in members" :key="m.id" class="chip chip-static" style="min-height: 34px; padding: 3px 4px 3px 4px; gap: 6px">
                    <MemberAvatar :name="m.name" :size="26" />
                    <span class="text-small" style="font-weight: 500">{{ m.name }}</span>
                    <button
                      type="button"
                      class="icon-btn"
                      style="width: 26px; height: 26px"
                      :disabled="!canRemove(m.id)"
                      :aria-label="`Hapus ${m.name}`"
                      :title="isUsed(m.id) ? 'Sudah dipakai di pengeluaran' : members.length <= 2 ? 'Minimal 2 anggota' : `Hapus ${m.name}`"
                      @click="removeMember(m.id)"
                    >
                      <X :size="14" stroke-width="2.5" aria-hidden="true" />
                    </button>
                  </span>
                </div>
                <form class="row" style="flex-wrap: nowrap; gap: 6px" @submit.prevent="addMember">
                  <input ref="memberInput" v-model="newName" class="input input-sm" placeholder="Nama anggota baru" aria-label="Nama anggota baru" maxlength="24" />
                  <button type="submit" class="pill-btn pill-btn-primary" :disabled="!newName.trim()" aria-label="Tambah anggota">
                    <Plus :size="16" aria-hidden="true" />
                    Tambah
                  </button>
                </form>
              </div>

              <div class="section-head" style="align-items: center; margin-top: 8px">
                <div class="row" style="gap: 8px">
                  <h2 id="list-title" class="h3">Daftar item</h2>
                  <span v-if="expenses.length" class="badge">{{ expenses.length }}</span>
                </div>
                <button type="button" class="pill-btn" :aria-expanded="showExpenseForm" @click="showExpenseForm = !showExpenseForm">
                  <component :is="showExpenseForm ? X : Plus" :size="16" aria-hidden="true" />
                  {{ showExpenseForm ? 'Tutup' : 'Tambah item' }}
                </button>
              </div>

              <ExpenseForm v-if="showExpenseForm" :members="members" @add="addExpense" @close="showExpenseForm = false" />

              <div v-if="!expenses.length" class="empty">Belum ada item. Upload struk di atas, atau tekan “Tambah item”.</div>
              <template v-else>
                <div class="row text-small">
                  <span class="muted-text">Semua dibayar oleh</span>
                  <BaseSelect small model-value="" :options="memberOptions" placeholder="Pilih…" aria-label="Atur pembayar semua item" @update:model-value="setAllPayer" />
                </div>
                <ExpenseList :members="members" :expenses="expenses" @remove="removeExpense" />
              </template>
            </section>
          </div>
        </div>
    </main>

    <div v-if="toast" class="toast" role="status">{{ toast }}</div>
  </div>
</template>
