<script setup lang="ts">
import { computed, type PropType } from 'vue'
import { DraftStatus, type DatabasePageItem, type DraftItem } from '../../../types'
import { useStudio } from '../../../composables/useStudio'
import { useStudioState } from '../../../composables/useStudioState'
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

const { context } = useStudio()
const { preferences } = useStudioState()

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
</script>

<template>
  <div class="h-full flex flex-col">
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
