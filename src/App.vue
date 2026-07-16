<script setup lang="ts">
import { ref } from 'vue';

import { uploadVolume } from './api/volumeApi';
import VolumeViewer from './components/VolumeViewer.vue';
import { resolveVolumeUuid } from './defaultVolume';

const volumeUuid = ref(resolveVolumeUuid(new URLSearchParams(window.location.search)));
const isUploading = ref(false);
const uploadMessage = ref('');
const uploadError = ref('');

function updateVolumeUrl(nextVolumeUuid: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set('volumeUuid', nextVolumeUuid);
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

async function handleVolumeUpload(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) {
    return;
  }

  isUploading.value = true;
  uploadMessage.value = '';
  uploadError.value = '';
  try {
    const result = await uploadVolume('', file);
    volumeUuid.value = result.uuid;
    updateVolumeUrl(result.uuid);
    uploadMessage.value = `${file.name} / ${result.meta.shape.join(' x ')} / ${result.meta.dtype}`;
  } catch (error) {
    uploadError.value = error instanceof Error ? error.message : String(error);
  } finally {
    isUploading.value = false;
    input.value = '';
  }
}
</script>

<template>
  <main class="dark relative min-h-screen bg-zinc-100 text-zinc-950 dark:bg-[#0b0b0f] dark:text-zinc-100">
    <div
      class="absolute left-3 top-1 z-[60] flex h-7 max-w-[calc(100%-24px)] items-center gap-2 text-xs"
    >
      <label
        class="inline-flex h-6 shrink-0 cursor-pointer items-center border border-cyan-500 bg-cyan-500 px-3 font-semibold text-zinc-950 transition hover:bg-cyan-400"
        :class="{ 'cursor-wait opacity-70': isUploading }"
      >
        {{ isUploading ? 'Uploading...' : 'Upload TIFF' }}
        <input
          class="sr-only"
          type="file"
          accept=".tif,.tiff,image/tiff"
          :disabled="isUploading"
          @change="handleVolumeUpload"
        />
      </label>
      <span
        v-if="uploadMessage"
        class="min-w-0 truncate border border-white/10 bg-black/55 px-2 py-1 text-zinc-200"
      >
        {{ uploadMessage }}
      </span>
      <span
        v-if="uploadError"
        class="min-w-0 truncate border border-red-400/40 bg-red-950/80 px-2 py-1 text-red-100"
        role="alert"
      >
        {{ uploadError }}
      </span>
    </div>
    <VolumeViewer
      v-if="volumeUuid"
      :key="volumeUuid"
      api-base-url=""
      initial-mode="3d"
      :volume-uuid="volumeUuid"
    />
    <section
      v-else
      class="flex min-h-screen items-center justify-center bg-[#0b0b0f] px-6 text-zinc-100"
    >
      <div class="max-w-md text-center">
        <h1 class="text-2xl font-semibold">No volume selected</h1>
        <p class="mt-3 text-sm text-zinc-400">
          Upload a TIFF file or open a saved volume URL with a volumeUuid query value.
        </p>
      </div>
    </section>
  </main>
</template>
