<script setup lang="ts">
import VolumeViewer from './components/VolumeViewer.vue';
import { resolveVolumeUuid } from './defaultVolume';

const volumeUuid = resolveVolumeUuid(new URLSearchParams(window.location.search));
</script>

<template>
  <main class="dark min-h-screen bg-zinc-100 text-zinc-950 dark:bg-[#0b0b0f] dark:text-zinc-100">
    <VolumeViewer api-base-url="" initial-mode="3d" :volume-uuid="volumeUuid" />
  </main>
</template>
