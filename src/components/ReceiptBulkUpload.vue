<script setup lang="ts">
import { computed, ref } from 'vue'
import { CircleAlert, CircleCheck, ImagePlus, KeyRound, LoaderCircle, ScanLine } from 'lucide-vue-next'
import { GeminiError, loadApiKey, saveApiKey, scanReceipt } from '../lib/gemini'
import { uid } from '../lib/format'
import type { Expense, Member } from '../lib/split'

const props = defineProps<{ members: Member[]; compact: boolean; sourceOffset: number }>()
const emit = defineEmits<{ (e: 'import', list: Expense[], receipts: number): void }>()

interface Job {
  name: string
  status: 'waiting' | 'reading' | 'done' | 'error'
  progress: number
  count: number
}

const jobs = ref<Job[]>([])
const busy = ref(false)
const dragging = ref(false)
const error = ref('')
const apiKey = ref(loadApiKey())
const keyDraft = ref('')
const editingKey = ref(!apiKey.value)

function submitKey() {
  const k = keyDraft.value.trim()
  if (!k) return
  apiKey.value = k
  saveApiKey(k)
  keyDraft.value = ''
  editingKey.value = false
  error.value = ''
}
function removeKey() {
  apiKey.value = ''
  saveApiKey('')
  editingKey.value = true
}

const finished = computed(() => jobs.value.filter((j) => j.status === 'done' || j.status === 'error').length)
const overall = computed(() => {
  if (!jobs.value.length) return 0
  const sum = jobs.value.reduce((s, j) => s + (j.status === 'done' || j.status === 'error' ? 1 : j.progress), 0)
  return sum / jobs.value.length
})

async function processFiles(list: FileList | File[] | null | undefined) {
  if (!list || busy.value || !apiKey.value) return
  const files = Array.from(list).filter((f) => f.type.startsWith('image/'))
  if (!files.length) {
    error.value = 'File harus berupa gambar (JPG, PNG, atau WebP).'
    return
  }
  error.value = ''
  busy.value = true
  jobs.value = files.map((f) => ({ name: f.name, status: 'waiting', progress: 0, count: 0 }))
  const imported: Expense[] = []
  const payer = props.members[0]?.id ?? ''
  const all = props.members.map((m) => m.id)
  let receipts = 0

  const handle = (job: Job, parsed: Awaited<ReturnType<typeof scanReceipt>>) => {
    job.count = parsed.items.length
    if (!parsed.items.length) return
    receipts++
    const source = `Struk ${props.sourceOffset + receipts}`
    parsed.items.forEach((it, idx) => {
      imported.push({
        id: uid(),
        title: it.name + (it.qty > 1 ? ` ×${it.qty}` : ''),
        amount: it.subtotal,
        // Pajak / service / diskon ditempelkan pada item terakhir di struk yang sama.
        tax: idx === parsed.items.length - 1 ? parsed.adjustment : 0,
        paidBy: payer,
        split: { type: 'equal', among: [...all] },
        source,
      })
    })
  }

  // Dua struk sekaligus; urutan hasil mengikuti urutan file.
  const results: (Awaited<ReturnType<typeof scanReceipt>> | null)[] = files.map(() => null)
  let next = 0
  let fatal = false
  async function worker() {
    while (!fatal && next < files.length) {
      const i = next++
      const job = jobs.value[i]
      job.status = 'reading'
      job.progress = 0.5
      try {
        results[i] = await scanReceipt(files[i], apiKey.value)
        job.status = 'done'
      } catch (e) {
        job.status = 'error'
        const msg = e instanceof GeminiError ? e.message : 'Gagal memproses struk'
        error.value = msg
        if (e instanceof GeminiError && e.fatal) {
          fatal = true
          editingKey.value = true
        }
      }
      job.progress = 1
    }
  }
  await Promise.all([worker(), worker()])
  results.forEach((r, i) => r && handle(jobs.value[i], r))

  busy.value = false
  if (imported.length) emit('import', imported, receipts)
  else if (!error.value) error.value = 'Tidak ada item yang terbaca. Coba foto yang lebih jelas atau tambahkan item manual.'
}

function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  processFiles(input.files)
  input.value = ''
}
function onDrop(e: DragEvent) {
  dragging.value = false
  processFiles(e.dataTransfer?.files)
}
</script>

<template>
  <div class="stack" style="gap: 12px">
    <form v-if="editingKey" class="panel stack" style="gap: 12px" @submit.prevent="submitKey">
      <div>
        <p class="text-body-md">API key Gemini</p>
        <p class="text-small muted-text" style="margin-top: 2px">
          Dipakai untuk membaca struk. Dapatkan gratis di
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" style="text-decoration: underline">Google AI Studio</a>.
          Key hanya disimpan di memori: tidak ditulis ke browser dan hilang saat halaman di-refresh.
        </p>
      </div>
      <div class="row" style="flex-wrap: nowrap">
        <input v-model="keyDraft" class="input" type="password" placeholder="AIza…" aria-label="API key Gemini" autocomplete="off" />
        <button type="submit" class="btn btn-primary" :disabled="!keyDraft.trim()">Simpan</button>
      </div>
      <button v-if="apiKey" type="button" class="link-btn" style="align-self: flex-start" @click="editingKey = false">Batal</button>
    </form>

    <label v-else
      class="dropzone"
      :class="{ 'dropzone-active': dragging, 'dropzone-compact': compact }"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <template v-if="busy">
        <LoaderCircle :size="compact ? 22 : 36" class="spin" aria-hidden="true" />
        <span class="text-body-md">Memproses {{ finished }}/{{ jobs.length }} struk…</span>
      </template>
      <template v-else-if="compact">
        <ImagePlus :size="22" aria-hidden="true" />
        <span class="text-body-md">Upload struk lagi</span>
      </template>
      <template v-else>
        <ScanLine :size="36" stroke-width="1.8" aria-hidden="true" />
        <span class="text-body-md">Upload atau scan struk — bisa banyak sekaligus</span>
        <span class="text-small muted-text">
          Pilih beberapa foto, atau tarik &amp; lepas. Dibaca oleh Gemini dan langsung jadi daftar item.
        </span>
      </template>
      <input type="file" accept="image/*" multiple :disabled="busy" class="sr-only" @change="onPick" />
    </label>

    <div v-if="!editingKey && !busy" class="row" style="justify-content: flex-end; gap: 4px">
      <button type="button" class="link-btn row" style="gap: 6px; text-decoration: none" @click="editingKey = true">
        <KeyRound :size="14" aria-hidden="true" /> Ganti API key
      </button>
      <span class="muted-text">·</span>
      <button type="button" class="link-btn" style="text-decoration: none" @click="removeKey">Hapus key</button>
    </div>

    <div v-if="busy" class="progress" role="progressbar" :aria-valuenow="Math.round(overall * 100)" aria-valuemin="0" aria-valuemax="100">
      <span :style="{ width: `${Math.max(4, Math.round(overall * 100))}%` }" />
    </div>

    <ul v-if="jobs.length" class="stack" style="gap: 6px; list-style: none; padding: 0; margin: 0">
      <li v-for="(j, i) in jobs" :key="i" class="list-row text-small">
        <span class="row" style="flex-wrap: nowrap; min-width: 0; gap: 8px">
          <CircleCheck v-if="j.status === 'done' && j.count" :size="18" class="pos" aria-hidden="true" />
          <CircleAlert v-else-if="j.status === 'error' || (j.status === 'done' && !j.count)" :size="18" class="neg" aria-hidden="true" />
          <LoaderCircle v-else-if="j.status === 'reading'" :size="18" class="spin" aria-hidden="true" />
          <span v-else style="width: 18px" />
          <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap">{{ j.name }}</span>
        </span>
        <span class="muted-text money">
          <template v-if="j.status === 'done'">{{ j.count ? `${j.count} item` : 'Tidak terbaca' }}</template>
          <template v-else-if="j.status === 'error'">Gagal</template>
          <template v-else-if="j.status === 'reading'">{{ Math.round(j.progress * 100) }}%</template>
          <template v-else>Menunggu</template>
        </span>
      </li>
    </ul>

    <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>
  </div>
</template>
