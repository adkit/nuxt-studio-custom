<script setup lang="ts">
import { queueLatestArticleEdit } from '../../../utils/queueLatestArticleEdit'
import type { PropType } from 'vue'
import type { Editor, EditorEvents, JSONContent } from '@tiptap/core'
import type { MarkdownDocument } from 'comark'
import type { DraftItem, DatabasePageItem } from '../../../types'
import { ref, watch, computed, useTemplateRef } from 'vue'
import { useStudio } from '../../../composables/useStudio'
import { useStudioState } from '../../../composables/useStudioState'
import { comarkToTiptap } from '../../../utils/tiptap/comarkToTiptap'
import { tiptapToComark } from '../../../utils/tiptap/tiptapToComark'
import { scrollPreviewToCursor } from '../../../utils/tiptap/scrollPreviewToCursor'
import { removeLastEmptyParagraph } from '../../../utils/tiptap/editor'
import { pickInitialSlot } from '../../../utils/tiptap/handlers'
import { studioStarterKitOptions, createStudioExtensions } from '../../../utils/tiptap/studio-extensions'
import TiptapSpanStylePopover from '../../tiptap/TiptapSpanStylePopover.vue'
import TiptapTableGrips from '../../tiptap/TiptapTableGrips.vue'
import { useTiptapEditor } from '../../../composables/useTiptapEditor'
import { useTiptapEditorAI } from '../../../composables/useTiptapEditorAI'
import type { NestedOptions, RuleContext } from '@tiptap/extension-drag-handle'

const props = defineProps({
  draftItem: {
    type: Object as PropType<DraftItem>,
    required: true,
  },
})

const document = defineModel<DatabasePageItem>()

const { host } = useStudio()
const { preferences } = useStudioState()

const editorComponent = useTemplateRef('visualEditor')

function followCursor(editor?: Editor) {
  if (!preferences.value.followEditorCursor || !document.value?.id || !editor) return
  scrollPreviewToCursor(editor, document.value.id)
}

function onCursorMove({ editor, transaction }: EditorEvents['selectionUpdate']) {
  if (!editor.isFocused) return
  // A keystroke within the same paragraph should leave the preview still.
  if (!transaction.docChanged) followCursor(editor)
}

function onEditorClick(event: MouseEvent) {
  if (event.target instanceof Element && event.target.closest('.tiptap')) {
    followCursor(editorComponent.value?.editor)
  }
}

watch(() => preferences.value.followEditorCursor, (enabled) => {
  if (enabled) followCursor(editorComponent.value?.editor)
})

const hasNuxtUI = host.meta.editor.components.hasNuxtUI

const {
  customHandlers,
  suggestionItems,
  toolbarItems,
  emojiItems,
  dragHandleItems,
  setSelectedNode,
} = useTiptapEditor()

const nestedDragHandle: NestedOptions = {
  // Default edge detection makes handles unreachable for D&D.
  edgeDetection: 'none',
  rules: [
    {
      // slot is structural and never itself a drag target.
      id: 'excludeSlotNode',
      evaluate: (ctx: RuleContext) => ctx.node.type.name === 'slot' ? 1000 : 0,
    },
    {
      // Keeps the handler at slot level by prevent the parent component to steal the target.
      id: 'excludeElementFromOwnSlot',
      evaluate: ({ node, depth, $pos }: RuleContext) =>
        node.type.name === 'element' && $pos.depth > depth && $pos.node(depth + 1)?.type.name === 'slot'
          ? 1000
          : 0,
    },
  ],
}

const {
  MAX_AI_SELECTION_LENGTH,
  isAIValidationVisible,
  isAILanguageInputVisible,
  aiValidationDomRect,
  aiLanguageInputDomRect,
  aiExtensions,
  isAISelectionTooLarge,
  getAITransformMenuItems,
  handleAIAccept,
  handleAIDecline,
  handleLanguageSubmit,
  handleLanguageCancel,
} = useTiptapEditorAI(document)

const tiptapJSON = ref<JSONContent>()

// Debug
const debug = computed(() => preferences.value.debug)
const currentTiptap = ref<JSONContent>()
const currentComark = ref<MarkdownDocument>()
const currentContent = ref<string>()

// A conversion can span several keystrokes. Only apply the most recent editor snapshot.
watch(tiptapJSON, queueLatestArticleEdit<JSONContent | undefined>(() => document.value?.id, async (json, isLatest) => {
  const cleanedTiptap = removeLastEmptyParagraph(json!)

  // TipTap → MarkdownDocument (internal representation)
  const comarkTree = await tiptapToComark(cleanedTiptap, {
    highlightTheme: host.meta.editor.highlightTheme,
  })

  const updatedDocument: DatabasePageItem = {
    ...document.value!,
    ...comarkTree.frontmatter,
    body: comarkTree,
  }

  if (!isLatest()) return
  document.value = updatedDocument

  // Debug: Capture current state
  if (debug.value) {
    currentTiptap.value = cleanedTiptap
    currentComark.value = comarkTree
    currentContent.value = await host.document.generate.contentFromDocument(updatedDocument) as string
  }
}))

// Trigger on document changes
watch(() => `${document.value?.id}-${props.draftItem.version}-${props.draftItem.status}`, async () => {
  const comarkTree = document.value!.body
  if (!comarkTree) return
  const newTiptapJSON = comarkToTiptap(comarkTree, { hasNuxtUI: hasNuxtUI.value })

  if (!tiptapJSON.value || JSON.stringify(newTiptapJSON) !== JSON.stringify(removeLastEmptyParagraph(tiptapJSON.value))) {
    tiptapJSON.value = newTiptapJSON

    if (debug.value && !currentComark.value) {
      const generatedContent = await host.document.generate.contentFromDocument(document.value!) || ''
      currentComark.value = comarkTree
      currentContent.value = generatedContent
      currentTiptap.value = JSON.parse(JSON.stringify(tiptapJSON.value))
    }
  }
}, { immediate: true })
</script>

<template>
  <div class="h-full flex flex-col">
    <ContentEditorTipTapDebug
      v-if="preferences.debug"
      :current-tiptap="currentTiptap"
      :current-comark="currentComark"
      :current-content="currentContent"
    />

    <UEditor
      ref="visualEditor"
      v-slot="{ editor }"
      v-model="tiptapJSON"
      class="mb-4 ml-1"
      content-type="json"
      :handlers="customHandlers"
      :image="false"
      :on-selection-update="onCursorMove"
      :starter-kit="studioStarterKitOptions"
      :extensions="createStudioExtensions({
        placeholder: $t('studio.tiptap.editor.placeholder'),
        hasNuxtUI,
        resolveInitialSlot: tag => pickInitialSlot(host.meta.editor.components.get().find(c => c.name === tag)?.meta.slots),
        additionalExtensions: aiExtensions,
      })"
      @click="onEditorClick"
    >
      <UEditorToolbar
        :editor="editor"
        :items="toolbarItems"
        layout="bubble"
      >
        <template #link>
          <TiptapLinkPopover :editor="editor" />
        </template>
        <template #span-style>
          <TiptapSpanStylePopover :editor="editor" />
        </template>
        <template #ai-transform>
          <UTooltip
            :text="isAISelectionTooLarge(editor) ? $t('studio.tiptap.ai.selectionTooLarge', { max: MAX_AI_SELECTION_LENGTH }) : undefined"
            :disabled="!isAISelectionTooLarge(editor)"
          >
            <UDropdownMenu
              v-slot="{ open }"
              :items="getAITransformMenuItems(editor)"
              :modal="false"
              :disabled="isAISelectionTooLarge(editor)"
            >
              <UButton
                color="neutral"
                variant="ghost"
                size="sm"
                icon="i-lucide-sparkles"
                :active="open"
                :disabled="isAISelectionTooLarge(editor)"
              />
            </UDropdownMenu>
          </UTooltip>
        </template>
      </UEditorToolbar>

      <UEditorDragHandle
        v-slot="{ ui }"
        :editor="editor"
        :nested="nestedDragHandle"
        :options="{ strategy: 'fixed' }"
        @node-change="setSelectedNode"
      >
        <UDropdownMenu
          v-slot="{ open }"
          :modal="false"
          :items="dragHandleItems(editor)"
          :content="{ side: 'left' }"
          :ui="{ content: 'w-48', label: 'text-xs' }"
          @update:open="editor.chain().setMeta('lockDragHandle', $event).run()"
        >
          <UButton
            color="neutral"
            variant="ghost"
            active-variant="soft"
            size="sm"
            icon="i-lucide-grip-vertical"
            :active="open"
            :class="ui.handle()"
          />
        </UDropdownMenu>
      </UEditorDragHandle>

      <TiptapTableGrips :editor="editor" />

      <UEditorSuggestionMenu
        :editor="editor"
        :items="suggestionItems"
        :limit="host.meta.editor.suggestion.limit"
      />

      <UEditorEmojiMenu
        :editor="editor"
        :items="emojiItems"
      />

      <ContentEditorAIValidation
        :show="isAIValidationVisible"
        :rect="aiValidationDomRect"
        @accept="handleAIAccept"
        @decline="handleAIDecline"
      />

      <ContentEditorAILanguageSelection
        :rect="aiLanguageInputDomRect"
        :show="isAILanguageInputVisible"
        @submit="(language) => handleLanguageSubmit(language, editor)"
        @cancel="handleLanguageCancel"
      />
    </UEditor>
  </div>
</template>
