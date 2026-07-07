<script setup lang="ts">
import VolumeViewer from './components/VolumeViewer.vue';

const DEFAULT_VOLUME_UUID = 'synthetic-sample-500x500x1000';
const volumeUuid = new URLSearchParams(window.location.search).get('volumeUuid') ?? DEFAULT_VOLUME_UUID;
</script>

<template>
  <main class="dark min-h-screen bg-zinc-100 text-zinc-950 dark:bg-[#0b0b0f] dark:text-zinc-100">
    <VolumeViewer api-base-url="" initial-mode="3d" :volume-uuid="volumeUuid" />
  </main>
</template>
