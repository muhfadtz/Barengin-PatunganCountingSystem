<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { Check, ChevronDown } from 'lucide-vue-next'

export interface SelectOption {
  value: string
  label: string
}

const props = defineProps<{
  modelValue: string
  options: SelectOption[]
  placeholder?: string
  ariaLabel?: string
  prefix?: string
  small?: boolean
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

const root = ref<HTMLElement>()
const list = ref<HTMLElement>()
const open = ref(false)
const up = ref(false)
const active = ref(-1)

// Dua opsi atau kurang (mis. Gue & Dia): tampilkan tombol langsung, bukan dropdown.
const segmented = computed(() => props.options.length <= 2)

const current = computed(() => props.options.find((o) => o.value === props.modelValue))

async function show() {
  open.value = true
  active.value = Math.max(0, props.options.findIndex((o) => o.value === props.modelValue))
  await nextTick()
  // Buka ke atas bila ruang di bawah tidak cukup.
  const r = root.value?.getBoundingClientRect()
  const h = list.value?.offsetHeight ?? 0
  up.value = !!r && window.innerHeight - r.bottom < h + 12 && r.top > h + 12
  list.value?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
}
function hide() {
  open.value = false
}
function choose(v: string) {
  emit('update:modelValue', v)
  hide()
  root.value?.querySelector('button')?.focus()
}
function onKey(e: KeyboardEvent) {
  if (!open.value) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault()
      show()
    }
    return
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    hide()
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    active.value = Math.min(props.options.length - 1, active.value + 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    active.value = Math.max(0, active.value - 1)
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    const o = props.options[active.value]
    if (o) choose(o.value)
  } else if (e.key === 'Tab') {
    hide()
  }
}
function onOutside(e: PointerEvent) {
  if (open.value && root.value && !root.value.contains(e.target as Node)) hide()
}
onMounted(() => document.addEventListener('pointerdown', onOutside))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside))
</script>

<template>
  <div v-if="segmented" class="segmented-wrap" :class="{ 'select-sm': small }">
    <span v-if="prefix" class="text-small muted-text">{{ prefix }}</span>
    <div class="segmented" role="radiogroup" :aria-label="ariaLabel">
      <button
        v-for="o in options"
        :key="o.value"
        type="button"
        role="radio"
        class="segmented-item"
        :class="{ 'segmented-active': o.value === modelValue }"
        :aria-checked="o.value === modelValue"
        @click="emit('update:modelValue', o.value)"
      >
        {{ o.label }}
      </button>
    </div>
  </div>
  <div v-else ref="root" class="select" :class="{ 'select-sm': small }" @keydown="onKey">
    <button
      type="button"
      class="select-trigger"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-label="ariaLabel"
      @click="open ? hide() : show()"
    >
      <span class="select-value" :class="{ 'select-placeholder': !current }">
        <span v-if="prefix" class="muted-text" style="margin-right: 4px">{{ prefix }}</span>{{ current?.label ?? placeholder ?? 'Pilih' }}
      </span>
      <ChevronDown :size="18" class="select-chev" :class="{ 'select-chev-open': open }" aria-hidden="true" />
    </button>
    <ul v-if="open" ref="list" class="select-list" :class="{ 'select-list-up': up }" role="listbox">
      <li
        v-for="(o, i) in options"
        :key="o.value"
        role="option"
        class="select-option"
        :class="{ 'select-option-active': i === active, 'select-option-selected': o.value === modelValue }"
        :data-active="i === active"
        :aria-selected="o.value === modelValue"
        @pointerenter="active = i"
        @click="choose(o.value)"
      >
        <span>{{ o.label }}</span>
        <Check v-if="o.value === modelValue" :size="16" aria-hidden="true" />
      </li>
    </ul>
  </div>
</template>
