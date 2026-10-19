<script setup lang="ts">
import { computed, ref } from 'vue'
import { CircleAlert, CircleCheck, ImagePlus, LoaderCircle, ScanLine } from 'lucide-vue-next'
import { OcrError, recognizeReceipt } from '../lib/unlimitedocr'
import { groundInText, LlmError, parseWithLlm } from '../lib/llmParser'
import { mergeReceipts } from '../lib/merge'
import { parseReceipt } from '../lib/receiptParser'
import type { ParsedReceipt } from '../lib/receiptParser'
import { uid } from '../lib/format'
import type { Expense, Member } from '../lib/split'

const props = defineProps<{ members: Member[]; compact: boolean; sourceOffset: number }>()
const emit = defineEmits<{ (e: 'import', list: Expense[], receipts: number): void }>()

interface Job {
  name: string
  status: 'waiting' | 'reading' | 'done' | 'error'
  progress: number
  count: number
  via?: 'llm' | 'rules' | 'none'
  text?: string
}

const jobs = ref<Job[]>([])
const busy = ref(false)
const dragging = ref(false)
const openText = ref(-1)
const error = ref('')

const finished = computed(() => jobs.value.filter((j) => j.status === 'done' || j.status === 'error').length)
const overall = computed(() => {
  if (!jobs.value.length) return 0
  const sum = jobs.value.reduce((s, j) => s + (j.status === 'done' || j.status === 'error' ? 1 : j.progress), 0)
  return sum / jobs.value.length
})

async function processFiles(list: FileList | File[] | null | undefined) {
  if (!list || busy.value) return
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

  const handle = (job: Job, parsed: ParsedReceipt) => {
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

  // Satu per satu (kuota/antrian ZeroGPU); tiap struk: Unlimited-OCR → teks → LLM kecil + parser aturan → gabung.
  const results: (ParsedReceipt | null)[] = files.map(() => null)
  let next = 0
  let stop = false
  let llmDown = false
  const errors = new Set<string>()
  async function worker() {
    while (!stop && next < files.length) {
      const i = next++
      const job = jobs.value[i]
      job.status = 'reading'
      job.progress = 0.3
      try {
        const text = await recognizeReceipt(files[i])
        job.text = text
        job.progress = 0.7
        const rules = parseReceipt(text)
        let ai: ParsedReceipt | null = null
        if (!llmDown) {
          try {
            ai = groundInText(await parseWithLlm(text), text)
          } catch (e) {
            // LLM tidak tersedia: lanjut dengan parser aturan saja, jangan menghentikan proses.
            llmDown = e instanceof LlmError && !/JSON|teks|Respons/.test(e.message)
            errors.add(`Parser AI dilewati: ${e instanceof LlmError ? e.message : 'gagal dipanggil'}`)
          }
        }
        const merged = mergeReceipts(ai, rules)
        job.via = merged.source
        results[i] = merged.receipt.items.length ? merged.receipt : null
        job.status = 'done'
      } catch (e) {
        job.status = 'error'
        errors.add(e instanceof OcrError ? e.message : 'Gagal memproses struk')
        // Salah konfigurasi / token: tidak ada gunanya melanjutkan file lain.
        if (e instanceof OcrError && e.fatal) stop = true
      }
      job.progress = 1
    }
  }
  await worker()
  results.forEach((r, i) => r && handle(jobs.value[i], r))
  if (errors.size) error.value = [...errors].join(' ')

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
    <label
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
          Pilih beberapa foto, atau tarik &amp; lepas. Dibaca Unlimited-OCR lalu langsung jadi daftar item.
        </span>
      </template>
      <input type="file" accept="image/*" multiple :disabled="busy" class="sr-only" @change="onPick" />
    </label>

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
          <template v-if="j.status === 'done'">{{ j.count ? `${j.count} item · ${j.via === 'llm' ? 'AI' : 'parser dasar'}` : 'Tidak terbaca' }}</template>
          <template v-else-if="j.status === 'error'">Gagal</template>
          <template v-else-if="j.status === 'reading'">{{ Math.round(j.progress * 100) }}%</template>
          <template v-else>Menunggu</template>
        </span>
        <div v-if="j.status === 'done' && !j.count && j.text !== undefined" style="flex-basis: 100%">
          <button type="button" class="link-btn" @click="openText = openText === i ? -1 : i">
            {{ openText === i ? 'Sembunyikan teks OCR' : 'Lihat teks OCR' }}
          </button>
          <pre v-if="openText === i" class="text-tiny" style="white-space: pre-wrap; word-break: break-word; margin: 6px 0 0; max-height: 160px; overflow: auto">{{ j.text || '(kosong)' }}</pre>
        </div>
      </li>
    </ul>

    <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>
  </div>
</template>
