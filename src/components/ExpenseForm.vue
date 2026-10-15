<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'
import BaseSelect from './BaseSelect.vue'
import SplitSelector from './SplitSelector.vue'
import { computeShares } from '../lib/split'
import type { Expense, Member, Split } from '../lib/split'
import { rupiah, toInt, uid } from '../lib/format'

const props = defineProps<{ members: Member[] }>()
const emit = defineEmits<{ (e: 'add', v: Expense): void; (e: 'close'): void }>()

const form = reactive({ title: '', amount: '', tax: '', taxKind: 'plus' as 'plus' | 'minus', paidBy: '' })
const split = ref<Split>({ type: 'equal', among: [] })

watch(
  () => props.members,
  (list) => {
    if (!list.some((m) => m.id === form.paidBy)) form.paidBy = list[0]?.id ?? ''
  },
  { immediate: true, deep: true },
)

const memberOptions = computed(() => props.members.map((m) => ({ value: m.id, label: m.name })))
const amountInt = computed(() => toInt(form.amount))
const taxInt = computed(() => toInt(form.tax) * (form.taxKind === 'minus' ? -1 : 1))
const draftTotal = computed(() => amountInt.value + taxInt.value)

function draft(): Expense {
  return { id: 'draft', title: form.title, amount: amountInt.value, tax: taxInt.value, paidBy: form.paidBy, split: split.value }
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
const canAdd = computed(() => amountInt.value > 0 && !!form.paidBy && !draftError.value)

function submit() {
  if (!canAdd.value) return
  emit('add', {
    id: uid(),
    title: form.title.trim() || 'Pengeluaran',
    amount: amountInt.value,
    tax: taxInt.value,
    paidBy: form.paidBy,
    split: JSON.parse(JSON.stringify(split.value)) as Split,
    source: 'Manual',
  })
  form.title = ''
  form.amount = ''
  form.tax = ''
  form.taxKind = 'plus'
}
</script>

<template>
  <form class="panel stack" style="gap: 20px" aria-labelledby="add-title" @submit.prevent="submit">
    <div class="list-row">
      <h3 id="add-title" class="h3">Tambah pengeluaran</h3>
      <button type="button" class="icon-btn" aria-label="Tutup form" title="Tutup" @click="emit('close')">
        <X :size="22" aria-hidden="true" />
      </button>
    </div>

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
        <span class="label">Dibayar oleh</span>
        <BaseSelect v-model="form.paidBy" :options="memberOptions" aria-label="Dibayar oleh" />
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
      <button type="button" class="btn btn-secondary" @click="emit('close')">Selesai</button>
    </div>
  </form>
</template>
