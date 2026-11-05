<script setup lang="ts">
import type { DatabaseItem, DraftItem } from '../../types'
import { ref, watch } from 'vue'
import { useStudio } from '../../composables/useStudio'
import { useStudioState } from '../../composables/useStudioState'
import { fromBase64ToUTF8 } from '../../utils/string'

const { host } = useStudio()
const props = defineProps<{ draftItem: DraftItem }>()
const { reviewInputs } = useStudioState()
const isOpen = ref(!!props.draftItem.modified && reviewInputs.has(props.draftItem.modified))
const comparison = ref<{ original: string, modified: string }>()
const error = ref('')

watch(isOpen, async (open, _, onCleanup) => {
  comparison.value = undefined
  error.value = ''
  if (!open) return
  let current = true
  onCleanup(() => {
    current = false
  })
  try {
    const { remoteFile, modified, reviewMarkdown } = props.draftItem
    const saved = remoteFile?.content ?? ''
    const original = remoteFile?.encoding === 'base64' ? fromBase64ToUTF8(saved) : saved
    const content = reviewMarkdown ?? (modified && await host.document.generate.contentFromDocument(modified as DatabaseItem))
    if (current) comparison.value = { original, modified: content ?? '' }
  }
  catch (cause) {
    if (current) error.value = String(cause)
  }
}, { immediate: true })
</script>

<template>
  <ItemCardReview
    v-model="isOpen"
    :draft-item="draftItem"
  >
    <template #open>
      <p
        v-if="error"
        role="alert"
        class="p-4 text-error"
      >
        {{ error }}
      </p>
      <ContentReviewPanel
        v-else-if="comparison"
        :draft-item="draftItem"
        :original="comparison.original"
        :modified="comparison.modified"
        @saved="comparison.modified = $event"
      />
      <UIcon
        v-else
        name="i-lucide-loader-circle"
        class="m-4 size-5 animate-spin text-muted"
      />
    </template>
  </ItemCardReview>
</template>
