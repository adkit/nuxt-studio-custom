import { joinURL, withLeadingSlash } from 'ufo'
import type { DraftItem, StudioHost, MediaItem, RawFile } from '../types'
import { VIRTUAL_MEDIA_COLLECTION_NAME, generateStemFromFsPath } from '../utils/media'
import { DraftStatus } from '../types/draft'
import type { useGitProvider } from './useGitProvider'
import { createSharedComposable } from './createSharedComposable'
import { useDraftBase } from './useDraftBase'
import { mediaStorage as storage } from '../utils/storage'
import { getFileExtension, slugifyFileName } from '../utils/file'
import { useHooks } from './useHooks'
import { useError } from './useError'
import { consola } from 'consola'
import { ref } from 'vue'
import { useStudioState } from './useStudioState'

const logger = consola.withTag('Nuxt Studio')
const hooks = useHooks()
const { showError } = useError()

export const useDraftMedias = createSharedComposable((host: StudioHost, gitProvider: ReturnType<typeof useGitProvider>) => {
  const {
    isLoading,
    list,
    current,
    get,
    create,
    remove,
    revert,
    revertAll,
    selectByFsPath,
    unselect,
    load,
    getStatus,
  } = useDraftBase('media', host, gitProvider, storage)

  const isExternalMedia = host.meta.media?.external
  const { isPublishing } = useStudioState()
  const isSavingArticleImage = ref(false)

  async function saveArticleImage({ articleFsPath, articlePath, field, file }: {
    articleFsPath: string
    articlePath: string
    field: NonNullable<MediaItem['articleImage']>['field']
    file: File
  }) {
    if (isSavingArticleImage.value || isPublishing.value) {
      throw new Error('Wait for the current save to finish.')
    }

    // Match the article page's /resources route and its public image folder.
    const slug = articlePath.match(/^\/resources\/([a-z0-9-]+(?:\/[a-z0-9-]+)*)$/i)?.[1]
    if (!slug || isExternalMedia) {
      throw new Error('This article has no supported image folder.')
    }

    isSavingArticleImage.value = true
    try {
      const raw = await readArticleImage(file)
      const fsPath = `/images/blog/${slug}/${field}.png`
      const existing = list.value.find(item => withLeadingSlash(item.fsPath) === fsPath) as DraftItem<MediaItem> | undefined
      const original = existing ? existing.original : await host.media.get(fsPath)
      const draftPath = existing?.fsPath ?? fsPath
      const id = joinURL(VIRTUAL_MEDIA_COLLECTION_NAME, draftPath)
      const modified: MediaItem = {
        id,
        fsPath: draftPath,
        stem: generateStemFromFsPath(draftPath),
        extension: 'png',
        path: fsPath,
        raw,
        articleImage: { articleFsPath, field },
      }
      const draft: DraftItem<MediaItem> = {
        ...existing,
        fsPath: draftPath,
        original,
        modified,
        status: original ? DraftStatus.Updated : DraftStatus.Created,
      }

      await storage.setItem(draftPath, draft)
      if (existing) {
        list.value = list.value.map(item => item.fsPath === draftPath ? draft : item)
      }
      else {
        list.value.push(draft)
      }
      await host.media.upsert(draftPath, modified)
      await hooks.callHook('studio:draft:media:updated', { caller: 'useDraftMedias.saveArticleImage' })
    }
    finally {
      isSavingArticleImage.value = false
    }
  }

  async function readArticleImage(file: File) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      throw new Error('Choose a PNG, JPEG, or WebP image.')
    }

    const bitmap = await createImageBitmap(file)
    try {
      if (file.type === 'image/png') {
        return await fileToDataUrl(file)
      }

      // The article expects PNG files, so convert other formats before saving.
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Could not convert the image to PNG.')
      context.drawImage(bitmap, 0, 0)
      const raw = canvas.toDataURL('image/png')
      if (!raw.startsWith('data:image/png;base64,')) {
        throw new Error('Could not convert the image to PNG.')
      }
      return raw
    }
    finally {
      bitmap.close()
    }
  }

  async function createFolder(parentFsPath: string): Promise<string | undefined> {
    try {
      const gitkeepFsPath = joinURL(parentFsPath, '.gitkeep')
      const gitKeepMedia: MediaItem = {
        id: joinURL(VIRTUAL_MEDIA_COLLECTION_NAME, gitkeepFsPath),
        fsPath: gitkeepFsPath,
        stem: generateStemFromFsPath(gitkeepFsPath),
        extension: '',
      }

      await host.media.upsert(gitkeepFsPath, gitKeepMedia)

      if (!isExternalMedia) {
        await create(gitkeepFsPath, gitKeepMedia)
      }

      await hooks.callHook('studio:draft:media:updated', { caller: 'useDraftMedias.createFolder' })

      return gitkeepFsPath
    }
    catch (error) {
      showError('Error creating folder', (error as Error).message)
    }
  }

  async function upload(parentFsPath: string, file: File) {
    try {
      const draftItem = await fileToDraftItem(parentFsPath, file)

      if (!isExternalMedia) {
        await create(draftItem.fsPath, draftItem.modified!)
      }

      await host.media.upsert(draftItem.fsPath, draftItem.modified!)

      await hooks.callHook('studio:draft:media:updated', { caller: 'useDraftMedias.upload' })
    }
    catch (error) {
      logger.error('Error uploading media:', error)
      showError('Error uploading media', (error as Error).message)
    }
  }

  async function fileToDraftItem(parentFsPath: string, file: File): Promise<DraftItem<MediaItem>> {
    const rawData = await fileToDataUrl(file)
    const slugifiedFileName = slugifyFileName(file.name)
    const fsPath = parentFsPath !== '/' ? joinURL(parentFsPath, slugifiedFileName) : slugifiedFileName

    return {
      fsPath,
      remoteFile: undefined,
      status: DraftStatus.Created,
      modified: {
        id: joinURL(VIRTUAL_MEDIA_COLLECTION_NAME, fsPath),
        fsPath,
        extension: getFileExtension(fsPath),
        stem: generateStemFromFsPath(fsPath),
        path: withLeadingSlash(fsPath),
        raw: rawData,
      },
    }
  }

  async function rename(items: { fsPath: string, newFsPath: string }[]) {
    // TODO: Implement rename with external storage
    if (isExternalMedia) {
      showError('Error renaming media', 'External storage renaming must be implemented')
      return
    }

    const paths = new Set(items.map(item => withLeadingSlash(item.fsPath)))
    if (list.value.some(draft => draft.modified?.articleImage && paths.has(withLeadingSlash(draft.fsPath)))) {
      showError('Error renaming media', 'Pending covers and social images must keep their names. Discard the upload to cancel it.')
      return
    }

    for (const item of items) {
      const { fsPath, newFsPath } = item

      const existingDraftToRename = list.value.find(draftItem => draftItem.fsPath === fsPath) as DraftItem<MediaItem>

      const currentDbItem = await host.media.get(fsPath)
      if (!currentDbItem) {
        throw new Error(`Database item not found for document fsPath: ${fsPath}`)
      }

      await remove([fsPath], { rerender: false })

      const newDbItem: MediaItem = {
        ...currentDbItem,
        fsPath: newFsPath,
        id: joinURL(VIRTUAL_MEDIA_COLLECTION_NAME, newFsPath),
        stem: generateStemFromFsPath(newFsPath),
        path: withLeadingSlash(newFsPath),
      }

      await host.media.upsert(newFsPath, newDbItem)

      let originalDbItem: MediaItem | undefined = currentDbItem
      if (existingDraftToRename) {
        originalDbItem = existingDraftToRename.original
      }

      await create(newFsPath, newDbItem, originalDbItem, { rerender: false })
    }

    await hooks.callHook('studio:draft:media:updated', { caller: 'useDraftMedias.rename' })
  }

  function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = error => reject(error)
    })
  }

  async function listAsRawFiles(): Promise<RawFile[]> {
    const files = [] as RawFile[]
    for (const draftItem of list.value) {
      if (draftItem.status === DraftStatus.Pristine) {
        continue
      }

      if (draftItem.status === DraftStatus.Deleted) {
        files.push({ path: joinURL('public', draftItem.fsPath), content: null, status: draftItem.status, encoding: 'base64' })
        continue
      }

      const raw = draftItem.modified?.raw as string | undefined
      const content = raw ? raw.replace(/^data:[^;]+;base64,/, '') : ''
      files.push({ path: joinURL('public', draftItem.fsPath), content, status: draftItem.status, encoding: 'base64' })
    }

    return files
  }

  return {
    isLoading,
    list,
    current,
    get,
    create,
    update: () => {},
    duplicate: () => {},
    remove,
    revert,
    revertAll,
    createFolder,
    rename,
    load,
    selectByFsPath,
    unselect,
    upload,
    saveArticleImage,
    isSavingArticleImage,
    listAsRawFiles,
    getStatus,
    applyFormatting: () => {},
  }
})
