<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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
const { isPublishing, reviewInputs } = useStudioState()
const extension = getFileExtension(props.draftItem.fsPath)
const language = ({ md: 'markdown', yml: 'yaml', yaml: 'yaml', json: 'json' })[extension] ?? 'plaintext'
const canEdit = computed(() => extension === 'md' && !props.draftItem.conflict && props.draftItem.status !== DraftStatus.Deleted)
const diffTarget = ref<HTMLElement>()
const singleTarget = ref<HTMLElement>()
const saving = ref(false)
const error = ref('')
const current = computed(() => props.draftItem.modified as DatabaseItem | undefined)
const dirty = computed(() => !!current.value && reviewInputs.has(current.value))
const initialText = current.value ? reviewInputs.get(current.value) ?? props.modified : props.original
const { editor: single } = useMonaco(singleTarget, {
  language,
  initialContent: props.draftItem.status === DraftStatus.Deleted ? props.original : initialText,
  readOnly: !canEdit.value,
  colorMode: ui.colorMode,
})

const { editor: diff } = useMonacoDiff(diffTarget, {
  original: props.original,
  modified: initialText,
  language,
  colorMode: ui.colorMode,
  editorOptions: { readOnly: !canEdit.value, originalEditable: false },
})
const right = computed(() => diff.value?.getModifiedEditor() ?? single.value)
watch(right, (editor, _, onCleanup) => {
  if (!editor || !canEdit.value) return
  const listener = editor.onDidChangeModelContent(() => {
    const doc = current.value
    if (!doc) return
    const text = editor.getValue()
    if (text === props.modified) reviewInputs.delete(doc)
    else reviewInputs.set(doc, text)
    error.value = ''
  })
  onCleanup(() => listener.dispose())
})
watch([right, canEdit, isPublishing, saving], () => {
  right.value?.updateOptions({ readOnly: !canEdit.value || isPublishing.value || saving.value })
}, { flush: 'sync' })

function cancel() {
  right.value?.setValue(props.modified)
  error.value = ''
}

async function save() {
  const doc = current.value
  if (saving.value || isPublishing.value || !right.value || !doc || !dirty.value) return
  saving.value = true
  const text = right.value.getValue()
  try {
    const parsed = await host.document.generate.documentFromContent(doc.id, text)
    if (!parsed) throw new Error(t('studio.review.invalidMarkdown'))
    const document = { ...host.document.utils.pickReservedKeys(doc), ...parsed, id: doc.id, fsPath: props.draftItem.fsPath }
    await documentTree.draft.update(props.draftItem.fsPath, document, { text, original: props.original })
    emit('saved', text)
    reviewInputs.delete(doc)
  }
  catch (cause) {
    error.value = String(cause)
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
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

    <div
      v-if="dirty || saving"
      class="flex items-center justify-end gap-2 border-t border-default p-2"
    >
      <p
        v-if="error"
        role="alert"
        class="me-auto text-sm text-error"
      >
        {{ error }}
      </p>
      <UButton
        :label="t('studio.aria.cancel')"
        color="neutral"
        variant="ghost"
        size="xs"
        :disabled="saving"
        @click="cancel"
      />
      <UButton
        :label="t('studio.review.saveDraft')"
        size="xs"
        :loading="saving"
        @click="save"
      />
    </div>
  </div>
</template>
