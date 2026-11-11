<script setup lang="ts">
import { computed, ref, type PropType } from 'vue'
import { DraftStatus, type DatabasePageItem, type DraftItem, type MediaItem } from '../../../types'
import { useStudio } from '../../../composables/useStudio'
import { useStudioState } from '../../../composables/useStudioState'
import { useError } from '../../../composables/useError'
import type { useDraftMedias } from '../../../composables/useDraftMedias'
import { ContentFileExtension } from '../../../types'

const props = defineProps({
  draftItem: {
    type: Object as PropType<DraftItem>,
    required: true,
  },
  readOnly: {
    type: Boolean,
    required: false,
    default: false,
  },
})

const { context, host, mediaTree } = useStudio()
const { isPublishing, preferences } = useStudioState()
const { showError } = useError()
const mediaDrafts = mediaTree.draft as ReturnType<typeof useDraftMedias>
const { isSavingArticleImage } = mediaDrafts
const imageInput = ref<HTMLInputElement>()
const articleImageButtons = [
  { field: 'cover', label: 'Upload cover', alt: 'Draft cover' },
  { field: 'og', label: 'Upload social image', alt: 'Draft social image' },
] as const
const selectedImage = ref<Omit<Parameters<typeof mediaDrafts.saveArticleImage>[0], 'file'>>()

const document = computed<DatabasePageItem>({
  get() {
    if (!props.draftItem) {
      return {} as DatabasePageItem
    }

    if (props.draftItem.status === DraftStatus.Deleted) {
      return props.draftItem.original as DatabasePageItem
    }

    return props.draftItem.modified as DatabasePageItem
  },
  set(value) {
    if (props.readOnly) {
      return
    }

    context.activeTree.value.draft.update(props.draftItem.fsPath, value)
  },
})

const canUploadArticleImages = computed(() => {
  const { owner, repo, branch } = host.repository
  return owner === 'adkit' && repo === 'adkit-monorepo' && branch === 'cms'
    && !host.meta.media?.external
    && document.value.extension === ContentFileExtension.Markdown
    && document.value.path?.startsWith('/resources/')
    && !props.readOnly && !props.draftItem.conflict && props.draftItem.status !== DraftStatus.Deleted
})

const articleImagePreviews = computed(() => {
  const previews: Partial<Record<'cover' | 'og', string>> = {}
  for (const draft of mediaDrafts.list.value) {
    const media = draft.modified as MediaItem | undefined
    if (media?.articleImage?.articleFsPath === props.draftItem.fsPath && typeof media.raw === 'string') {
      previews[media.articleImage.field] = media.raw
    }
  }
  return previews
})

function chooseArticleImage(field: 'cover' | 'og') {
  selectedImage.value = { articleFsPath: props.draftItem.fsPath, articlePath: document.value.path, field }
  imageInput.value?.click()
}

async function uploadArticleImage(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !selectedImage.value) return

  try {
    await mediaDrafts.saveArticleImage({ ...selectedImage.value, file })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Try uploading the image again.'
    showError('Could not upload the article image', message)
  }
}
</script>

<template>
  <div class="h-full flex flex-col">
    <div
      v-if="canUploadArticleImages"
      class="flex flex-wrap gap-x-3 gap-y-2 border-b border-default px-4 py-2"
    >
      <input
        ref="imageInput"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        class="hidden"
        @change="uploadArticleImage"
      >
      <div
        v-for="{ field, label, alt } in articleImageButtons"
        :key="field"
        class="flex items-center gap-1.5"
      >
        <img
          v-if="articleImagePreviews[field]"
          :src="articleImagePreviews[field]"
          :alt="alt"
          class="size-7 rounded object-cover"
        >
        <UButton
          :label="label"
          :icon="articleImagePreviews[field] ? 'i-lucide-check' : 'i-lucide-upload'"
          :loading="isSavingArticleImage && selectedImage?.field === field"
          :disabled="isSavingArticleImage || isPublishing"
          color="neutral"
          variant="soft"
          size="xs"
          @click="chooseArticleImage(field)"
        />
      </div>
    </div>
    <ContentEditorConflict
      v-if="draftItem.conflict"
      :draft-item="draftItem"
    />
    <ContentEditorCode
      v-else-if="preferences.editorMode === 'code'"
      v-model="document"
      :draft-item="draftItem"
      :read-only="readOnly"
      class="flex-1"
    />
    <ContentEditorTipTap
      v-else-if="document.extension === ContentFileExtension.Markdown"
      v-model="document"
      :draft-item="draftItem"
      class="flex-1"
    />
    <ContentEditorForm
      v-else
      v-model="document"
      :draft-item="draftItem"
      class="flex-1"
    />
  </div>
</template>
