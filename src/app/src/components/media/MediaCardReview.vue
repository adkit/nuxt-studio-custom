<script setup lang="ts">
import type { DraftItem, MediaItem } from '../../types'
import { computed, ref, watch, type PropType } from 'vue'
import { DraftStatus } from '../../types'
import type { useDraftDocuments } from '../../composables/useDraftDocuments'
import { useMonacoDiff } from '../../composables/useMonacoDiff'
import { useStudio } from '../../composables/useStudio'

const props = defineProps({
  draftItem: {
    type: Object as PropType<DraftItem<MediaItem>>,
    required: true,
  },
})

const { documentTree, ui } = useStudio()
const documents = documentTree.draft as ReturnType<typeof useDraftDocuments>
const isOpen = ref(false)
const articleImage = computed(() => props.draftItem.modified?.articleImage)
const settings = ref<{ original: string, modified: string }>()
const settingsError = ref('')
const settingsTarget = ref<HTMLElement>()
const { editor } = useMonacoDiff(settingsTarget, {
  get original() { return settings.value?.original ?? '' },
  get modified() { return settings.value?.modified ?? '' },
  language: 'markdown',
  colorMode: ui.colorMode,
  editorOptions: { renderSideBySide: false },
})
watch(editor, instance => instance?.revealFirstDiff())

watch([isOpen, articleImage], async ([open, image], _, onCleanup) => {
  settings.value = undefined
  settingsError.value = ''
  if (!open || !image) return

  let current = true
  onCleanup(() => {
    current = false
  })
  try {
    const change = await documents.prepareArticleImageChange(image.articleFsPath, [image.field])
    if (current) settings.value = change
  }
  catch (cause) {
    if (current) settingsError.value = String(cause)
  }
})

const previewSource = computed(() => {
  const { modified, original } = props.draftItem
  if (typeof modified?.raw === 'string' && modified.raw) return modified.raw
  return original?.path ?? modified?.path
})
</script>

<template>
  <ItemCardReview
    v-model="isOpen"
    :draft-item="draftItem"
  >
    <template #open>
      <div class="flex justify-end p-1">
        <ReviewDiscardButton :draft-item="draftItem" />
      </div>
      <img
        v-if="previewSource"
        :src="previewSource"
        :alt="draftItem.fsPath.split('/').pop()"
        :class="{ 'opacity-50': draftItem.status === DraftStatus.Deleted }"
      >
      <p
        v-if="settingsError"
        role="alert"
        class="p-3 text-xs text-error"
      >
        {{ settingsError }}
      </p>
      <div
        v-if="settings"
        class="border-t border-default"
      >
        <h3 class="px-3 py-2 text-xs font-medium text-muted">
          {{ $t('studio.review.articleSettings') }}
        </h3>
        <div
          ref="settingsTarget"
          class="h-36"
        />
      </div>
    </template>
  </ItemCardReview>
</template>
