<!-- This file contains the confirmation for discarding a file draft from Review. -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useStudio } from '../../composables/useStudio'
import { useStudioState } from '../../composables/useStudioState'
import type { DraftItem } from '../../types/draft'

const props = defineProps<{ draftItem: DraftItem }>()
const { context } = useStudio()
const { isPublishing } = useStudioState()
const { t } = useI18n()
const open = ref(false)
const discarding = ref(false)
const error = ref('')
const fileName = computed(() => props.draftItem.fsPath.split('/').pop())
const disabled = computed(() => isPublishing.value || context.isSavingArticleImage.value || context.isDiscardingDraft.value)

function openConfirmation() {
  error.value = ''
  open.value = true
}

async function discardDraft() {
  if (disabled.value) return
  discarding.value = true
  try {
    await context.discardReviewDraft(props.draftItem)
    open.value = false
  }
  catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
  finally {
    discarding.value = false
  }
}
</script>

<template>
  <UButton
    :label="t('studio.review.discardChanges')"
    :disabled="disabled"
    icon="i-lucide-undo-2"
    size="xs"
    variant="ghost"
    color="error"
    @click="openConfirmation"
  />
  <UModal
    v-model:open="open"
    :title="t('studio.review.discardFileTitle', { name: fileName })"
    :description="t('studio.review.discardFileDescription')"
    :dismissible="!discarding"
    :close="false"
  >
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
        :disabled="discarding"
        color="neutral"
        variant="outline"
        class="ms-auto"
        @click="open = false"
      />
      <UButton
        :label="t('studio.review.discardChanges')"
        :loading="discarding"
        :disabled="disabled"
        color="error"
        @click="discardDraft"
      />
    </template>
  </UModal>
</template>
