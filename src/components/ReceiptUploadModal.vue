<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { computeShares } from '../lib/split'
import type { Expense, Member } from '../lib/split'
import { parseReceipt, recognizeReceipt } from '../lib/ocr'
import { rupiah, toInt, uid } from '../lib/format'

const props = defineProps<{ members: Member[] }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'import', list: Expense[]): void
}>()

interface Row {
  id: string
  name: string
  qty: number
  subtotal: string
}

const step = ref<'pick' | 'scan' | 'review'>('pick')
const previewUrl = ref('')
const progress = ref(0)
const error = ref('')
const dragging = ref(false)
const rows = ref<Row[]>([])
const adjKind = ref<'plus' | 'minus'>('plus')
const adjStr = ref('')
const ocrTotal = ref<number | null>(null)
const paidBy = ref(props.members[0]?.id ?? '')
const among = ref(props.members.map((m) => m.id))

const adj = computed(() => toInt(adjStr.value) * (adjKind.value === 'minus' ? -1 : 1))
const itemsTotal = computed(() => rows.value.reduce((s, r) => s + toInt(r.subtotal), 0))
const grandTotal = computed(() => itemsTotal.value + adj.value)
const mismatch = computed(() => ocrTotal.value !== null && ocrTotal.value !== grandTotal.value)

async function handleFile(file: File | null | undefined) {
  if (!file) return
  if (!file.type.startsWith('image/')) {
    error.value = 'File harus berupa gambar (JPG, PNG, atau WebP).'
    return
  }
  error.value = ''
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = URL.createObjectURL(file)
  step.value = 'scan'
  progress.value = 0
  try {
    const text = await recognizeReceipt(file, (p) => (progress.value = p))
    const parsed = parseReceipt(text)
    rows.value = parsed.items.map((i) => ({
      id: uid(),
      name: i.name,
      qty: i.qty,
      subtotal: String(i.subtotal),
    }))
    adjKind.value = parsed.adjustment < 0 ? 'minus' : 'plus'
    adjStr.value = parsed.adjustment ? String(Math.abs(parsed.adjustment)) : ''
    // Peringatan selisih hanya jika total struk benar-benar terbaca oleh OCR.
    ocrTotal.value = parsed.total
    if (!rows.value.length) {
      error.value =
        'Tidak ada item yang terbaca. Tambahkan item secara manual atau coba foto yang lebih jelas.'
    }
    step.value = 'review'
  } catch {
    error.value =
      'Gagal membaca struk. Pastikan koneksi internet aktif (data bahasa OCR diunduh saat pertama kali dipakai), lalu coba lagi.'
    step.value = 'pick'
  }
}

function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  handleFile(input.files?.[0])
  input.value = ''
}
function onDrop(e: DragEvent) {
  dragging.value = false
  handleFile(e.dataTransfer?.files?.[0])
}

function addRow() {
  rows.value.push({ id: uid(), name: '', qty: 1, subtotal: '' })
}
function removeRow(id: string) {
  rows.value = rows.value.filter((r) => r.id !== id)
}
function toggleAmong(id: string) {
  among.value = among.value.includes(id)
    ? among.value.filter((x) => x !== id)
    : [...among.value, id]
}
function restart() {
  step.value = 'pick'
  error.value = ''
  rows.value = []
}

function doImport() {
  const valid = rows.value.filter((r) => toInt(r.subtotal) > 0)
  if (!valid.length) {
    error.value = 'Tambahkan minimal satu item dengan nominal.'
    return
  }
  if (!among.value.length) {
    error.value = 'Pilih minimal satu orang yang ikut membagi.'
    return
  }
  const list: Expense[] = valid.map((r, i) => ({
    id: uid(),
    title: (r.name.trim() || 'Item') + (r.qty > 1 ? ` ×${r.qty}` : ''),
    amount: toInt(r.subtotal),
    tax: i === valid.length - 1 ? adj.value : 0,
    paidBy: paidBy.value,
    split: { type: 'equal', among: [...among.value] },
  }))
  try {
    list.forEach(computeShares)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    return
  }
  emit('import', list)
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => {
  document.body.style.overflow = 'hidden'
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.body.style.overflow = ''
  window.removeEventListener('keydown', onKey)
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
})
</script>

<template>
  <div class="modal-backdrop" @mousedown.self="emit('close')">
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="ocr-title">
      <div class="sheet-head">
        <h2 id="ocr-title" class="h3">Scan struk</h2>
        <button class="icon-btn" type="button" aria-label="Tutup" @click="emit('close')">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="sheet-body">
        <!-- 1. Pilih foto -->
        <div v-if="step === 'pick'" class="stack">
          <label
            class="dropzone"
            :class="{ 'dropzone-active': dragging }"
            @dragover.prevent="dragging = true"
            @dragleave.prevent="dragging = false"
            @drop.prevent="onDrop"
          >
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M14.5 4h-5L8 6H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
            <span class="text-body-md">Ambil foto atau pilih gambar struk</span>
            <span class="text-small muted-text">Tarik &amp; lepas juga bisa. Pastikan teks terbaca jelas dan struk tidak miring.</span>
            <input type="file" accept="image/*" class="sr-only" @change="onPick" />
          </label>
          <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>
        </div>

        <!-- 2. Membaca -->
        <div v-else-if="step === 'scan'" class="stack" aria-live="polite">
          <img
            v-if="previewUrl"
            :src="previewUrl"
            alt="Pratinjau struk"
            class="mx-auto max-h-64 w-auto rounded-lg border border-border object-contain"
          />
          <div>
            <div class="list-row text-small" style="margin-bottom: 8px">
              <span class="text-body-md">Membaca struk…</span>
              <span class="money muted-text">{{ Math.round(progress * 100) }}%</span>
            </div>
            <div class="progress" role="progressbar" :aria-valuenow="Math.round(progress * 100)" aria-valuemin="0" aria-valuemax="100">
              <span :style="{ width: `${Math.max(4, Math.round(progress * 100))}%` }" />
            </div>
          </div>
        </div>

        <!-- 3. Review -->
        <div v-else class="stack">
          <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>
          <p v-if="mismatch" class="notice" role="status">
            Total terbaca di struk ({{ rupiah(ocrTotal ?? 0) }}) berbeda dari total item
            ({{ rupiah(grandTotal) }}). Periksa lagi angkanya sebelum diimpor.
          </p>

          <div class="stack" style="gap: 10px">
            <div class="list-row">
              <span class="label" style="margin: 0">Item</span>
              <button type="button" class="link-btn" @click="restart">Foto ulang</button>
            </div>
            <div v-for="r in rows" :key="r.id" class="card" style="padding: 12px">
              <div class="row" style="flex-wrap: nowrap; align-items: stretch">
                <div class="stack" style="gap: 8px; flex: 1; min-width: 0">
                  <input v-model="r.name" class="input" placeholder="Nama item" aria-label="Nama item" />
                  <input v-model="r.subtotal" class="input" inputmode="numeric" placeholder="Nominal" aria-label="Nominal item" />
                </div>
                <button type="button" class="icon-btn" aria-label="Hapus item" @click="removeRow(r.id)">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                  </svg>
                </button>
              </div>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" style="align-self: flex-start" @click="addRow">
              + Tambah item
            </button>
          </div>

          <div>
            <span class="label">Pajak / service / diskon</span>
            <div class="row" style="flex-wrap: nowrap">
              <div class="chip-row" style="flex-wrap: nowrap">
                <button type="button" class="chip" :class="{ 'chip-active': adjKind === 'plus' }" @click="adjKind = 'plus'">+</button>
                <button type="button" class="chip" :class="{ 'chip-active': adjKind === 'minus' }" @click="adjKind = 'minus'">−</button>
              </div>
              <input v-model="adjStr" class="input" inputmode="numeric" placeholder="0" aria-label="Nominal penyesuaian" />
            </div>
            <p class="hint">Tanda + untuk pajak/service, − untuk diskon. Ditempelkan pada item terakhir.</p>
          </div>

          <div class="grid-2">
            <div>
              <label class="label" for="ocr-paid">Siapa yang bayar?</label>
              <select id="ocr-paid" v-model="paidBy" class="input">
                <option v-for="m in members" :key="m.id" :value="m.id">{{ m.name }}</option>
              </select>
            </div>
            <div>
              <span class="label">Dibagi rata ke</span>
              <div class="chip-row">
                <button
                  v-for="m in members"
                  :key="m.id"
                  type="button"
                  class="chip"
                  :class="{ 'chip-active': among.includes(m.id) }"
                  :aria-pressed="among.includes(m.id)"
                  @click="toggleAmong(m.id)"
                >
                  {{ m.name }}
                </button>
              </div>
            </div>
          </div>

          <div class="list-row" style="padding-top: 4px">
            <span class="text-body-md">Total</span>
            <span class="h3 money">{{ rupiah(grandTotal) }}</span>
          </div>
        </div>
      </div>

      <div v-if="step === 'review'" class="sheet-foot">
        <button type="button" class="btn btn-secondary" @click="emit('close')">Batal</button>
        <button type="button" class="btn btn-primary" @click="doImport">Impor pengeluaran</button>
      </div>
    </div>
  </div>
</template>
