import type { BaseItem } from './item'

export interface MediaConfig {
  external: boolean
  publicUrl?: string
}

export interface MediaItem extends BaseItem {
  articleImage?: { articleFsPath: string, field: 'cover' | 'og' }
  [key: string]: unknown
}
