<script setup lang="ts">
import { computed, ref } from 'vue'
import { FlaskConical, Play, Plus, X } from 'lucide-vue-next'
import MemberAvatar from './MemberAvatar.vue'
import type { Member } from '../lib/split'
import { uid } from '../lib/format'
import { DEFAULT_CUSTOM_MEMBERS, DUO_MEMBERS } from '../lib/sample'

const emit = defineEmits<{
  (e: 'start', name: string, members: Member[]): void
  (e: 'sample'): void
  (e: 'notify', msg: string): void
}>()

const sessionName = ref('')
const members = ref<Member[]>(DUO_MEMBERS.map((m) => ({ ...m })))
const newName = ref('')

const canStart = computed(() => members.value.length >= 2)

function useTemplate(list: Member[]) {
  members.value = list.map((m) => ({ ...m }))
}
function add() {
  const n = newName.value.trim()
  if (!n) return
  if (members.value.some((m) => m.name.toLowerCase() === n.toLowerCase())) {
    emit('notify', 'Nama itu sudah ada')
    return
  }
  members.value.push({ id: `m_${uid()}`, name: n })
  newName.value = ''
}
function remove(id: string) {
  members.value = members.value.filter((m) => m.id !== id)
}
</script>

<template>
  <section class="panel stack" style="gap: 24px; max-width: 640px" aria-labelledby="start-title">
    <div>
      <h2 id="start-title" class="h2">Mulai sesi baru</h2>
      <p class="muted-text" style="margin-top: 8px">
        Sesi tetap aktif sampai kamu menutupnya, lalu masuk ke riwayat. Setelah mulai, langsung upload struk.
      </p>
    </div>

    <div>
      <label class="label" for="s-name">Nama sesi (opsional)</label>
      <input id="s-name" v-model="sessionName" class="input" placeholder="Mis. Makan malam Sabtu" maxlength="40" autocomplete="off" />
    </div>

    <div>
      <div class="list-row" style="margin-bottom: 8px">
        <span class="label" style="margin: 0">Siapa saja yang ikut?</span>
        <span class="row" style="gap: 14px">
          <button type="button" class="link-btn" @click="useTemplate(DUO_MEMBERS)">Gue &amp; Dia</button>
          <button type="button" class="link-btn" @click="useTemplate(DEFAULT_CUSTOM_MEMBERS)">Andi, Budi, Citra</button>
        </span>
      </div>
      <div class="chip-row">
        <span v-for="m in members" :key="m.id" class="chip chip-static" style="padding-right: 4px">
          <MemberAvatar :name="m.name" :size="24" />
          {{ m.name }}
          <button type="button" class="icon-btn" style="width: 28px; height: 28px" :aria-label="`Hapus ${m.name}`" @click="remove(m.id)">
            <X :size="14" stroke-width="2.5" aria-hidden="true" />
          </button>
        </span>
      </div>
      <form class="row" style="flex-wrap: nowrap; margin-top: 12px" @submit.prevent="add">
        <input v-model="newName" class="input" placeholder="Tambah nama" aria-label="Nama anggota baru" maxlength="24" />
        <button type="submit" class="btn btn-secondary" :disabled="!newName.trim()" aria-label="Tambah anggota" title="Tambah anggota">
          <Plus :size="20" aria-hidden="true" />
        </button>
      </form>
      <p v-if="!canStart" class="hint">Minimal 2 orang.</p>
    </div>

    <div class="row" style="gap: 12px">
      <button type="button" class="btn btn-primary" :disabled="!canStart" @click="emit('start', sessionName, members)">
        <Play :size="20" aria-hidden="true" />
        Mulai sesi
      </button>
      <button type="button" class="btn btn-ghost" @click="emit('sample')">
        <FlaskConical :size="20" aria-hidden="true" />
        Coba data contoh
      </button>
    </div>
  </section>
</template>
