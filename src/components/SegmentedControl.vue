<script setup lang="ts">
defineProps<{ modelValue: string; options: { value: string; label: string }[]; ariaLabel?: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()
</script>

<template>
  <div class="segmented" style="display: flex" role="radiogroup" :aria-label="ariaLabel">
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
</template>
