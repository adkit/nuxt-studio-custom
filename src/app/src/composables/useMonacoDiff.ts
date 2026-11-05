import { watch, type Ref, shallowRef } from 'vue'
import type { editor as Editor } from 'modern-monaco/editor-core'
import { setupMonaco } from '../utils/monaco/index'

export interface UseMonacoDiffOptions {
  original: string
  modified: string
  language: string
  colorMode: Ref<'light' | 'dark'>
  editorOptions?: Editor.IStandaloneDiffEditorConstructionOptions
}

export function useMonacoDiff(target: Ref<HTMLElement | undefined>, options: UseMonacoDiffOptions) {
  const editor = shallowRef<Editor.IStandaloneDiffEditor | null>(null)
  const theme = () => options.colorMode.value === 'light' ? 'vitesse-light' : 'vitesse-dark'

  watch(target, async (el, _, onCleanup) => {
    if (!el) return
    let disposed = false
    onCleanup(() => {
      disposed = true
    })
    const monaco = await setupMonaco()
    if (disposed) return

    const diff = monaco.createDiffEditor(el, {
      theme: theme(),
      lineNumbers: 'off',
      readOnly: true,
      renderSideBySide: true,
      renderSideBySideInlineBreakpoint: 0,
      wordWrap: 'on',
      scrollBeyondLastLine: false,
      automaticLayout: true,
      ...options.editorOptions,
    })
    const original = monaco.editor.createModel(options.original, options.language)
    const modified = monaco.editor.createModel(options.modified, options.language)
    diff.setModel({ original, modified })
    editor.value = diff
    onCleanup(() => {
      diff.setModel(null)
      diff.dispose()
      original.dispose()
      modified.dispose()
      editor.value = null
    })
  }, { immediate: true, flush: 'post' })

  watch(options.colorMode, () => {
    // @ts-expect-error -- theme is missing from IDiffEditorOptions
    editor.value?.updateOptions({ theme: theme() })
  })

  function setOptions(opts: Editor.IStandaloneDiffEditorConstructionOptions) {
    editor.value?.updateOptions(opts)
  }

  return { editor, setOptions }
}
