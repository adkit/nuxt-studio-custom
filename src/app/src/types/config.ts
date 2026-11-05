import type { StudioFeature } from './context'

export type EditorMode = 'code' | 'tiptap'

export interface StudioConfig {
  syncEditorAndRoute: boolean
  followEditorCursor: boolean
  showTechnicalMode: boolean
  editorMode: EditorMode
  debug: boolean
  enableAICompletion: boolean
}

export interface StudioLocation {
  active: boolean
  feature: StudioFeature
  fsPath: string
}
