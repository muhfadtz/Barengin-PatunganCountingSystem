<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { allocate } from '../lib/split'
import type { Member, Split } from '../lib/split'
import { rupiah, toInt } from '../lib/format'

const props = defineProps<{ members: Member[]; amount: number }>()
const emit = defineEmits<{ (e: 'change', v: Split): void }>()

type Mode = 'equal' | 'exclusive' | 'custom'

const mode = ref<Mode>('equal')
const among = ref<string[]>([])
const owner = ref('')
const custom = ref<Record<string, string>>({})

const duo = computed(() => props.members.length === 2)

// Reset setiap kali daftar anggota berubah (tambah/hapus/ganti template).
watch(
  () => props.members.map((m) => m.id).join('|'),
  () => {
    among.value = props.members.map((m) => m.id)
    owner.value = props.members[0]?.id ?? ''
    custom.value = Object.fromEntries(props.members.map((m) => [m.id, '']))
    mode.value = 'equal'
  },
  { immediate: true },
)

const split = computed<Split>(() => {
  if (mode.value === 'equal') return { type: 'equal', among: [...among.value] }
  if (mode.value === 'exclusive') return { type: 'exclusive', owner: owner.value }
  return {
    type: 'custom',
    shares: Object.fromEntries(props.members.map((m) => [m.id, toInt(custom.value[m.id] ?? '')])),
  }
})
watch(split, (v) => emit('change', v), { immediate: true, deep: true })

const customSum = computed(() =>
  props.members.reduce((s, m) => s + toInt(custom.value[m.id] ?? ''), 0),
)
const customDiff = computed(() => props.amount - customSum.value)

function setEqualAll() {
  mode.value = 'equal'
  among.value = props.members.map((m) => m.id)
}
function setExclusive(id?: string) {
  mode.value = 'exclusive'
  if (id) owner.value = id
}
function setCustom() {
  mode.value = 'custom'
}
function toggle(id: string) {
  among.value = among.value.includes(id)
    ? among.value.filter((x) => x !== id)
    : [...among.value, id]
}
function clearAll() {
  among.value = []
}
function distributeEvenly() {
  if (props.amount <= 0 || props.members.length === 0) return
  const r = allocate(props.amount, Object.fromEntries(props.members.map((m) => [m.id, 1])))
  custom.value = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)]))
}
</script>

<template>
  <div class="stack" style="gap: 12px">
    <div>
      <span class="label">Dibagi bagaimana?</span>
      <div class="chip-row" role="group" aria-label="Metode pembagian">
        <template v-if="duo">
          <button type="button" class="chip" :class="{ 'chip-active': mode === 'equal' }" @click="setEqualAll">
            Bagi 2 (50:50)
          </button>
          <button
            v-for="m in members"
            :key="m.id"
            type="button"
            class="chip"
            :class="{ 'chip-active': mode === 'exclusive' && owner === m.id }"
            @click="setExclusive(m.id)"
          >
            Khusus {{ m.name }}
          </button>
          <button type="button" class="chip" :class="{ 'chip-active': mode === 'custom' }" @click="setCustom">
            Custom
          </button>
        </template>
        <template v-else>
          <button type="button" class="chip" :class="{ 'chip-active': mode === 'equal' }" @click="setEqualAll">
            Rata
          </button>
          <button type="button" class="chip" :class="{ 'chip-active': mode === 'exclusive' }" @click="setExclusive()">
            Satu orang
          </button>
          <button type="button" class="chip" :class="{ 'chip-active': mode === 'custom' }" @click="setCustom">
            Custom
          </button>
        </template>
      </div>
    </div>

    <!-- Rata untuk > 2 anggota: pilih peserta -->
    <div v-if="!duo && mode === 'equal'">
      <div class="row" style="justify-content: space-between">
        <span class="label" style="margin: 0">Siapa yang ikut?</span>
        <span class="row" style="gap: 14px">
          <button type="button" class="link-btn" @click="among = members.map((m) => m.id)">Pilih semua</button>
          <button type="button" class="link-btn" @click="clearAll">Bersihkan</button>
        </span>
      </div>
      <div class="chip-row" style="margin-top: 8px">
        <button
          v-for="m in members"
          :key="m.id"
          type="button"
          class="chip"
          :class="{ 'chip-active': among.includes(m.id) }"
          :aria-pressed="among.includes(m.id)"
          @click="toggle(m.id)"
        >
          {{ m.name }}
        </button>
      </div>
    </div>

    <!-- Satu orang untuk > 2 anggota -->
    <div v-if="!duo && mode === 'exclusive'">
      <span class="label">Ditanggung oleh</span>
      <div class="chip-row">
        <button
          v-for="m in members"
          :key="m.id"
          type="button"
          class="chip"
          :class="{ 'chip-active': owner === m.id }"
          :aria-pressed="owner === m.id"
          @click="owner = m.id"
        >
          {{ m.name }}
        </button>
      </div>
    </div>

    <!-- Custom -->
    <div v-if="mode === 'custom'" class="stack" style="gap: 10px">
      <div class="grid-2" style="gap: 10px">
        <div v-for="m in members" :key="m.id">
          <label class="label" :for="`custom-${m.id}`">{{ m.name }}</label>
          <input
            :id="`custom-${m.id}`"
            v-model="custom[m.id]"
            class="input"
            inputmode="numeric"
            placeholder="0"
            autocomplete="off"
          />
        </div>
      </div>
      <div class="list-row">
        <span class="text-small" :class="customDiff === 0 && amount > 0 ? 'pos' : 'muted-text'">
          <template v-if="amount <= 0">Isi nominal pengeluaran dulu</template>
          <template v-else-if="customDiff === 0">Pas — total {{ rupiah(customSum) }}</template>
          <template v-else-if="customDiff > 0">Kurang {{ rupiah(customDiff) }} dari {{ rupiah(amount) }}</template>
          <template v-else>Lebih {{ rupiah(-customDiff) }} dari {{ rupiah(amount) }}</template>
        </span>
        <button type="button" class="link-btn" :disabled="amount <= 0" @click="distributeEvenly">
          Bagi merata
        </button>
      </div>
    </div>
  </div>
</template>
