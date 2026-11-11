<!-- This file contains the draft cover preview for the AdKit article page. -->
<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useMutationObserver, useStyleTag } from '@vueuse/core'
import { useStudio } from '../../composables/useStudio'
import type { MediaItem } from '../../types/media'

const { host, mediaTree, ui } = useStudio()
const routePath = ref(host.app.getCurrentRoute().path)
const header = shallowRef<HTMLElement | null>(null)

host.on.routeChange((route) => {
  routePath.value = route.path
})

const cover = computed(() => {
  if (!ui.isOpen.value || !routePath.value.startsWith('/resources/')) return null

  const slug = routePath.value.slice('/resources/'.length)
  const coverPath = `/images/blog/${slug}/cover.png`
  for (const draft of mediaTree.draft.list.value) {
    const media = draft.modified as MediaItem | undefined
    if (media?.path === coverPath && media.articleImage?.field === 'cover' && typeof media.raw === 'string') {
      return media.raw
    }
  }
  return null
})

function findArticleHeader() {
  header.value = cover.value ? document.querySelector<HTMLElement>('#article-header > div') : null
}

watch([cover, routePath], findArticleHeader, { immediate: true, flush: 'post' })
// Nuxt can replace the header after a route change or a preview refresh.
const articlePage = computed(() => cover.value ? document.querySelector<HTMLElement>('#__nuxt') : null)
useMutationObserver(articlePage, findArticleHeader, { childList: true, subtree: true })

useStyleTag(`
  #article-header > div:has(> [data-studio-cover-preview]) > img:not([data-studio-cover-preview]),
  #article-header > div:has(> [data-studio-cover-preview]) > a > .iconify {
    display: none;
  }
`)
</script>

<template>
  <Teleport
    v-if="cover && header"
    :to="header"
    prepend
  >
    <img
      :src="cover"
      alt="Draft article cover"
      width="400"
      style="max-width: 100%; height: auto; margin-bottom: 1.25rem;"
      data-studio-cover-preview
    >
  </Teleport>
</template>
