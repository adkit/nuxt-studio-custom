import type { DatabaseItem, DraftItem, MediaItem, StudioHost, RawFile } from '../types'
import { DraftStatus } from '../types/draft'
import type { useGitProvider } from './useGitProvider'
import { createSharedComposable } from './createSharedComposable'
import { useHooks } from './useHooks'
import { joinURL } from 'ufo'
import { documentStorage as storage } from '../utils/storage'
import { getFileExtension } from '../utils/file'
import { useDraftBase } from './useDraftBase'
import { useAI } from './useAI'
import { CORE_SCHEMA, dump, load, mergeTag, timestampTag } from 'js-yaml'
import { fromBase64ToUTF8 } from '../utils/string'

type ArticleImage = NonNullable<MediaItem['articleImage']>

export const useDraftDocuments = createSharedComposable((host: StudioHost, gitProvider: ReturnType<typeof useGitProvider>) => {
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
  } = useDraftBase<DatabaseItem>('document', host, gitProvider, storage)

  const hooks = useHooks()
  const ai = useAI(host)
  const hostDb = host.document.db
  const generateContentFromDocument = host.document.generate.contentFromDocument

  async function update(fsPath: string, document: DatabaseItem, review?: { text: string, original: string }): Promise<DraftItem<DatabaseItem>> {
    const existingItem = list.value.find(item => item.fsPath === fsPath) as DraftItem<DatabaseItem>
    if (!existingItem) {
      throw new Error(`Draft file not found for document fsPath: ${fsPath}`)
    }

    const oldStatus = existingItem.status
    let status = await getStatus(document, existingItem.original as DatabaseItem, { formattingApplied: existingItem.formattingApplied })
    if (review && status !== DraftStatus.Created) {
      status = review.text === review.original ? DraftStatus.Pristine : DraftStatus.Updated
    }
    const changes = { status, modified: document, reviewMarkdown: review?.text }
    await storage.setItem(fsPath, { ...existingItem, ...changes })
    Object.assign(existingItem, changes)

    list.value = list.value.map(item => item.fsPath === fsPath ? existingItem : item)

    // Upsert document in database
    await hostDb.upsert(fsPath, document)

    // Trigger hook to warn that draft list has changed
    if (existingItem.status !== oldStatus) {
      const isAIUpdate = ai.enabled ? existingItem.fsPath.startsWith(ai.contextFolder) : false

      const hookName = isAIUpdate ? 'studio:draft:ai:updated' : 'studio:draft:document:updated'
      await hooks.callHook(hookName, { caller: 'useDraftDocuments.update' })
    }
    else {
      // Rerender host app
      host.app.requestRerender()
    }

    return existingItem
  }

  async function rename(items: { fsPath: string, newFsPath: string }[]) {
    for (const item of items) {
      const { fsPath, newFsPath } = item

      const existingDraftToRename = list.value.find(draftItem => draftItem.fsPath === fsPath) as DraftItem<DatabaseItem>
      const dbItemToRename = await hostDb.get(fsPath)
      if (!dbItemToRename) {
        throw new Error(`Database item not found for document fsPath: ${fsPath}`)
      }

      const modifiedDbItem = existingDraftToRename?.modified || dbItemToRename
      let originalDbItem: DatabaseItem | undefined = dbItemToRename
      if (existingDraftToRename) {
        originalDbItem = existingDraftToRename.original
      }

      const content = await generateContentFromDocument(modifiedDbItem)

      await remove([fsPath], { rerender: false })

      const newDbItem = await hostDb.create(newFsPath, content!)

      await create(newFsPath, newDbItem, originalDbItem, { rerender: false })
    }

    await hooks.callHook('studio:draft:document:updated', { caller: 'useDraftDocuments.rename' })
  }

  async function duplicate(fsPath: string): Promise<DraftItem<DatabaseItem>> {
    let currentDbItem = await hostDb.get(fsPath)
    if (!currentDbItem) {
      throw new Error(`Database item not found for document fsPath: ${fsPath}`)
    }

    const currentDraftItem = list.value.find(item => item.fsPath === fsPath)
    if (currentDraftItem) {
      currentDbItem = currentDraftItem.modified as DatabaseItem
    }

    const currentFsPath = currentDraftItem?.fsPath || fsPath
    const currentContent = await generateContentFromDocument(currentDbItem) || ''
    const currentName = currentFsPath.split('/').pop()!
    const currentExtension = getFileExtension(currentName)
    const currentNameWithoutExtension = currentName.split('.').slice(0, -1).join('.')

    const newFsPath = `${currentFsPath.split('/').slice(0, -1).join('/')}/${currentNameWithoutExtension}-copy.${currentExtension}`

    const newDbItem = await hostDb.create(newFsPath, currentContent)

    return await create(newFsPath, newDbItem)
  }

  /**
   * Mark a draft as "user explicitly accepted comark's canonical formatting."
   * Flips the status to `Updated` so the canonical render flows through the
   * normal review → publish path even when `modified` and `original` are
   * semantically equal. Called from the ComarkFormattingBanner's "Apply" action.
   *
   * `revert(fsPath)` clears the flag and the draft returns to Pristine.
   */
  async function applyFormatting(fsPath: string): Promise<DraftItem<DatabaseItem> | undefined> {
    const existingItem = list.value.find(item => item.fsPath === fsPath) as DraftItem<DatabaseItem> | undefined
    if (!existingItem) return undefined

    delete existingItem.reviewMarkdown
    existingItem.formattingApplied = true
    existingItem.status = await getStatus(
      existingItem.modified as DatabaseItem,
      existingItem.original as DatabaseItem,
      { formattingApplied: true },
    )
    await storage.setItem(fsPath, existingItem)
    list.value = list.value.map(item => item.fsPath === fsPath ? existingItem : item)

    await hooks.callHook('studio:draft:document:updated', { caller: 'useDraftDocuments.applyFormatting' })
    return existingItem
  }

  function readDraftMarkdown(draftItem: DraftItem) {
    return draftItem.reviewMarkdown ?? generateContentFromDocument(draftItem.modified as DatabaseItem)
  }

  async function prepareArticleImageChange(articleFsPath: string, fields: ArticleImage['field'][], content?: string | null) {
    const draft = await get(articleFsPath)
    if (draft?.status === DraftStatus.Deleted) {
      throw new Error('Revert the article image draft or restore its article before publishing.')
    }

    // Read the current branch for image-only changes, in case the preview build is older.
    const remote = !draft || draft.status === DraftStatus.Pristine
      ? await gitProvider.api.fetchFile(joinURL('content', articleFsPath))
      : draft.remoteFile
    const markdown = draft && draft.status !== DraftStatus.Pristine
      ? (content ?? await readDraftMarkdown(draft))
      : (remote?.encoding === 'base64' && remote.content ? fromBase64ToUTF8(remote.content) : remote?.content)
    if (markdown == null) {
      throw new Error(`Could not read ${articleFsPath}. The image draft is still saved.`)
    }

    const modified = enableArticleImages(markdown, fields)
    if (modified !== markdown) return { original: markdown, modified, expectedSha: remote?.sha }
  }

  async function listAsRawFiles(articleImages: ArticleImage[] = []): Promise<RawFile[]> {
    const files = [] as RawFile[]
    for (const draftItem of list.value) {
      if (draftItem.status === DraftStatus.Deleted) {
        files.push({ path: joinURL('content', draftItem.fsPath), content: null, status: draftItem.status, encoding: 'utf-8' })
        continue
      }

      const content = await readDraftMarkdown(draftItem)
      files.push({
        path: joinURL('content', draftItem.fsPath),
        content: content!,
        status: draftItem.status,
        encoding: 'utf-8',
      })
    }

    const fieldsByArticle = new Map<string, ArticleImage['field'][]>()
    for (const { articleFsPath, field } of articleImages) {
      const fields = fieldsByArticle.get(articleFsPath) ?? []
      fieldsByArticle.set(articleFsPath, [...fields, field])
    }

    for (const [articleFsPath, fields] of fieldsByArticle) {
      const path = joinURL('content', articleFsPath)
      const file = files.find(item => item.path === path)
      const change = await prepareArticleImageChange(articleFsPath, fields, file?.content)
      if (!change) continue
      if (file) {
        file.content = change.modified
        file.expectedSha = change.expectedSha
        if (file.status === DraftStatus.Pristine) file.status = DraftStatus.Updated
      }
      else {
        files.push({ path, content: change.modified, status: DraftStatus.Updated, encoding: 'utf-8', expectedSha: change.expectedSha })
      }
    }

    return files
  }

  return {
    isLoading,
    list,
    current,
    get,
    create,
    update,
    applyFormatting,
    remove,
    revert,
    revertAll,
    rename,
    duplicate,
    listAsRawFiles,
    prepareArticleImageChange,
    load,
    selectByFsPath,
    unselect,
    getStatus,
  }
})

function enableArticleImages(markdown: string, fields: ArticleImage['field'][]) {
  const header = markdown.match(/^---[ \t]*\r?\n([\s\S]*?)^---[ \t]*(?:\r?\n|$)/m)
  const schema = CORE_SCHEMA.withTags(mergeTag)
  const metadata = header?.index === 0 ? load(header[1]!, { schema }) : {}
  const values = metadata ?? {}
  if (typeof values !== 'object' || Array.isArray(values)) {
    throw new TypeError('The article settings could not be read.')
  }

  const settings = values as Record<string, unknown>
  if (fields.every(field => settings[field] === true)) return markdown

  for (const field of fields) settings[field] = true
  const body = header?.index === 0 ? markdown.slice(header[0].length) : markdown
  const yaml = dump(settings, { schema: schema.withTags(timestampTag), lineWidth: -1 })
  return `---\n${yaml}---\n${body}`
}
