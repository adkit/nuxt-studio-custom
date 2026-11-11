<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useEventListener } from '@vueuse/core'
import { onBeforeRouteLeave } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { DraftStatus, type DatabaseItem, type DraftItem } from '../../types'
import { useMonaco } from '../../composables/useMonaco'
import { useMonacoDiff } from '../../composables/useMonacoDiff'
import { useStudio } from '../../composables/useStudio'
import { useStudioState } from '../../composables/useStudioState'
import { getFileExtension } from '../../utils/file'

const props = defineProps<{ draftItem: DraftItem, original: string, modified: string }>()
const emit = defineEmits<{ saved: [text: string] }>()
const { host, ui, documentTree } = useStudio()
const { t } = useI18n()
const { isPublishing } = useStudioState()
const extension = getFileExtension(props.draftItem.fsPath)
const language = ({ md: 'markdown', yml: 'yaml', yaml: 'yaml', json: 'json' })[extension] ?? 'plaintext'
const canEdit = computed(() => extension === 'md' && !props.draftItem.conflict && props.draftItem.status !== DraftStatus.Deleted)
const diffTarget = ref<HTMLElement>()
const singleTarget = ref<HTMLElement>()
const editTarget = ref<HTMLElement>()
const editing = ref(false)
const confirmingDiscard = ref(false)
const saving = ref(false)
const error = ref('')
const dirty = ref(false)
const { editor: single, setContent } = useMonaco(singleTarget, {
  language,
  initialContent: props.draftItem.status === DraftStatus.Deleted ? props.original : props.modified,
  readOnly: true,
  colorMode: ui.colorMode,
})

const options = {
  original: props.original,
  language,
  colorMode: ui.colorMode,
}
const { editor: diff } = useMonacoDiff(diffTarget, { ...options, modified: props.modified })
const { editor: editDiff } = useMonacoDiff(editTarget, {
  ...options,
  get modified() { return props.modified },
  editorOptions: { readOnly: false, originalEditable: false },
})

watch(diff, instance => instance?.revealFirstDiff())

watch(editDiff, (instance, _, onCleanup) => {
  if (!instance) return
  const right = instance.getModifiedEditor()
  const from = diff.value?.getModifiedEditor() ?? single.value
  const line = from?.getVisibleRanges()[0]?.startLineNumber ?? 1
  right.revealLineNearTop(line)
  const listener = right.onDidChangeModelContent(() => {
    dirty.value = right.getValue() !== props.modified
  })
  onCleanup(() => listener.dispose())
})

onBeforeRouteLeave(() => !editing.value)

function requestClose() {
  if (saving.value) return
  if (dirty.value) confirmingDiscard.value = true
  else editing.value = false
}

function discard() {
  confirmingDiscard.value = false
  editing.value = false
}

const editDialog = computed(() => editTarget.value?.closest<HTMLElement>('[role="dialog"]'))
useEventListener(editDialog, 'keydown', (event) => {
  if (event.key !== 'Escape' || event.defaultPrevented) return
  event.stopPropagation()
  requestClose()
})

function startEditing() {
  error.value = ''
  dirty.value = false
  editing.value = true
}

async function save() {
  const current = props.draftItem.modified as DatabaseItem | undefined
  if (saving.value || !editDiff.value || !current || !canEdit.value) return
  saving.value = true
  const right = editDiff.value.getModifiedEditor()
  right.updateOptions({ readOnly: true })
  const text = right.getValue()
  try {
    const parsed = await host.document.generate.documentFromContent(current.id, text)
    if (!parsed) throw new Error(t('studio.review.invalidMarkdown'))
    const document = { ...host.document.utils.pickReservedKeys(current), ...parsed, id: current.id, fsPath: props.draftItem.fsPath }
    await documentTree.draft.update(props.draftItem.fsPath, document, { text, original: props.original })
    emit('saved', text)
    diff.value?.getModel()?.modified.setValue(text)
    if (single.value) setContent(text)
    editing.value = false
  }
  catch (cause) {
    error.value = String(cause)
    right.updateOptions({ readOnly: false })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <div class="flex flex-wrap gap-1 p-1">
      <UButton
        v-if="canEdit"
        :label="t('studio.review.editDraft')"
        :disabled="isPublishing"
        icon="i-lucide-pencil"
        size="xs"
        variant="ghost"
        color="neutral"
        @click="startEditing"
      />
      <div class="ms-auto">
        <ReviewDiscardButton :draft-item="draftItem" />
      </div>
    </div>
    <ResizableElement
      :min-height="200"
      :max-height="600"
      :initial-height="200"
      class="bg-elevated"
    >
      <div
        v-if="draftItem.status === DraftStatus.Updated"
        ref="diffTarget"
        class="h-full"
      />
      <div
        v-else
        ref="singleTarget"
        class="h-full"
      />
    </ResizableElement>

    <UModal
      :open="editing"
      :title="draftItem.fsPath"
      :description="t('studio.review.editDescription')"
      :dismissible="!saving"
      :close="false"
      :ui="{ content: 'w-[95vw] max-w-6xl', body: 'p-0 sm:p-0' }"
      @update:open="!$event && requestClose()"
    >
      <template #body>
        <div
          ref="editTarget"
          class="h-[60vh]"
        />
      </template>
      <template #footer>
        <p
          v-if="error"
          role="alert"
          class="text-sm text-error"
        >
          {{ error }}
        </p>
        <UButton
          :label="t('studio.aria.cancel')"
          color="neutral"
          variant="ghost"
          :disabled="saving"
          class="ms-auto"
          @click="requestClose"
        />
        <UButton
          :label="t('studio.review.saveDraft')"
          :loading="saving"
          :disabled="!dirty || saving"
          @click="save"
        />
      </template>
    </UModal>
    <UModal
      v-model:open="confirmingDiscard"
      :title="t('studio.review.discardTitle')"
      :description="t('studio.review.discardDescription')"
      :close="false"
    >
      <template #footer>
        <UButton
          :label="t('studio.review.keepEditing')"
          color="neutral"
          variant="outline"
          class="ms-auto"
          @click="confirmingDiscard = false"
        />
        <UButton
          :label="t('studio.review.discardChanges')"
          color="error"
          @click="discard"
        />
      </template>
    </UModal>
  </div>
</template>
