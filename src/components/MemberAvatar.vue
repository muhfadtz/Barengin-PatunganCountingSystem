<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 32 })

// Pastel hangat selaras dengan palet merah Barengin; warna stabil per nama.
const TINTS: [string, string][] = [
  ['#ffe3e6', '#a3001a'],
  ['#e0f0ff', '#0b4d8f'],
  ['#e1f5e7', '#0f6b36'],
  ['#fff1d6', '#8a5300'],
  ['#ece4ff', '#4b2fa0'],
  ['#d9f3f1', '#0c6660'],
]
const tint = computed(() => {
  let h = 0
  for (const c of props.name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return TINTS[h % TINTS.length]
})
</script>

<template>
  <span
    class="m-avatar"
    :style="{ width: `${size}px`, height: `${size}px`, background: tint[0], color: tint[1], fontSize: `${Math.round(size * 0.42)}px` }"
    :title="name"
    aria-hidden="true"
  >
    {{ name.charAt(0).toUpperCase() }}
  </span>
</template>
