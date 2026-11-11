import { createMockGithubFile } from '../mocks/git'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { StudioBranchActionId, type StudioHost } from '../../src/types'
import { generateUniqueDocumentFsPath } from '../utils'
import { mockHost, mockGit, routeState, cleanAndSetupContext } from '../utils/context'
import { createMockFile, mockFileToDataUrl } from '../mocks/media'
import type { useDraftMedias } from '../../src/composables/useDraftMedias'

describe('PublishBranch - Commit Message Prefix', () => {
  let context: Awaited<ReturnType<typeof cleanAndSetupContext>>
  let documentFsPath: string

  beforeEach(async () => {
    routeState.name = 'content'
    documentFsPath = generateUniqueDocumentFsPath('document')
    context = await cleanAndSetupContext(mockHost, mockGit)
  })

  it('passes user message as-is when no prefix is configured', async () => {
    await mockHost.document.db.create(documentFsPath, 'Test content')
    await context.activeTree.value.draft.load()
    await context.activeTree.value.selectItemByFsPath(documentFsPath)

    const userMessage = 'Add 2 links on landing page'
    await context.branchActionHandler[StudioBranchActionId.PublishBranch]({ commitMessage: userMessage })

    expect(mockGit.api.commitFiles).toHaveBeenCalledTimes(1)
    const [, commitMessage] = (mockGit.api.commitFiles as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(commitMessage).toBe('Add 2 links on landing page')
  })

  it('prepends configured prefix to user message', async () => {
    const hostWithPrefix: StudioHost = {
      ...mockHost,
      meta: {
        ...mockHost.meta,
        git: { commit: { messagePrefix: 'content:' } },
      },
    }
    context = await cleanAndSetupContext(hostWithPrefix, mockGit)

    await mockHost.document.db.create(documentFsPath, 'Test content')
    await context.activeTree.value.draft.load()
    await context.activeTree.value.selectItemByFsPath(documentFsPath)

    const userMessage = 'Add 2 links on landing page'
    await context.branchActionHandler[StudioBranchActionId.PublishBranch]({ commitMessage: userMessage })

    expect(mockGit.api.commitFiles).toHaveBeenCalledTimes(1)
    const [, commitMessage] = (mockGit.api.commitFiles as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(commitMessage).toBe('content: Add 2 links on landing page')
  })

  it('trims user message before applying prefix', async () => {
    const hostWithPrefix: StudioHost = {
      ...mockHost,
      meta: {
        ...mockHost.meta,
        git: { commit: { messagePrefix: 'docs:' } },
      },
    }
    context = await cleanAndSetupContext(hostWithPrefix, mockGit)

    await mockHost.document.db.create(documentFsPath, 'Test content')
    await context.activeTree.value.draft.load()
    await context.activeTree.value.selectItemByFsPath(documentFsPath)

    await context.branchActionHandler[StudioBranchActionId.PublishBranch]({ commitMessage: '  Update readme  ' })

    expect(mockGit.api.commitFiles).toHaveBeenCalledTimes(1)
    const [, commitMessage] = (mockGit.api.commitFiles as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(commitMessage).toBe('docs: Update readme')
  })
})

it('opens the newer branch copy when the preview still has the old article', async () => {
  routeState.name = 'content'
  const context = await cleanAndSetupContext(mockHost, mockGit)
  const path = generateUniqueDocumentFsPath('document')
  await mockHost.document.db.create(path, 'Previous text')
  vi.mocked(mockGit.api.fetchFile).mockResolvedValueOnce({
    ...createMockGithubFile(), content: 'Text saved on the branch',
  })
  await context.activeTree.value.draft.selectByFsPath(path)
  const draft = context.activeTree.value.draft.current.value!
  expect(draft.conflict).toBeUndefined()
  expect(draft.status).toBe('pristine')
  expect(JSON.stringify(draft.modified)).toContain('Text saved on the branch')
})

it('keeps exact Review Markdown across reload and uses later editor changes for Publish', async () => {
  routeState.name = 'content'
  const context = await cleanAndSetupContext(mockHost, mockGit)
  const path = generateUniqueDocumentFsPath('review')
  const original = 'Test content'
  const item = await mockHost.document.db.create(path, original)
  const drafts = context.activeTree.value.draft
  await drafts.selectByFsPath(path)

  const text = original + '\n\n\n'
  await drafts.update(path, item, { text, original })
  await drafts.load()
  expect((await drafts.get(path))?.status).toBe('updated')
  expect((await drafts.listAsRawFiles())[0]?.content).toBe(text)

  await drafts.update(path, item, { text: original, original })
  expect((await drafts.get(path))?.status).toBe('pristine')

  const next = await mockHost.document.db.create(path, 'Changed in the visual editor')
  await drafts.update(path, next)
  expect((await drafts.get(path))?.reviewMarkdown).toBeUndefined()
  expect((await drafts.listAsRawFiles())[0]?.content).toContain('Changed in the visual editor')
})

describe('Article image uploads', () => {
  const articleFsPath = 'resources/guide/step.md'
  const articlePath = '/resources/guide/step'
  const coverPath = '/images/blog/guide/step/cover.png'
  const publish = StudioBranchActionId.PublishBranch

  async function setupArticleImages() {
    routeState.name = 'media'
    const git = {
      ...mockGit,
      api: { ...mockGit.api, fetchFile: vi.fn(), commitFiles: vi.fn().mockResolvedValue({ success: true }) },
    }
    const context = await cleanAndSetupContext(mockHost, git)
    const media = context.activeTree.value.draft as ReturnType<typeof useDraftMedias>
    const originalFileReader = globalThis.FileReader
    const reader = mockFileToDataUrl()
    return { context, media, git, reader, originalFileReader }
  }

  it('publishes the latest cover and social image with the current article in one commit', async () => {
    const { context, media, git, reader, originalFileReader } = await setupArticleImages()
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ close: vi.fn() }))
    try {
      vi.mocked(mockHost.media.get).mockResolvedValueOnce(undefined as never)
      const file = createMockFile('writer-filename.png')
      await media.saveArticleImage({ articleFsPath, articlePath, field: 'cover', file })
      reader.result = 'data:image/png;base64,c2Vjb25k'
      await media.saveArticleImage({ articleFsPath, articlePath, field: 'cover', file })
      await media.saveArticleImage({ articleFsPath, articlePath, field: 'og', file })
      await media.load()

      expect(media.list.value).toHaveLength(2)
      const renamedCover = '/images/blog/guide/step/new-name.png'
      const { useError } = await import('../../src/composables/useError')
      const { error, clearError } = useError()
      await media.rename([{ fsPath: coverPath, newFsPath: renamedCover }])
      expect(error.value?.message).toContain('must keep their names')
      clearError()
      expect(await media.get(renamedCover)).toBeUndefined()
      expect(await media.get(coverPath)).toBeDefined()

      const latestMarkdown = '---\ntitle: Newer title\ncover: false\n---\n\nThe newest body.\n'
      git.api.fetchFile.mockResolvedValue(createMockGithubFile({
        content: Buffer.from(latestMarkdown).toString('base64'),
        encoding: 'base64',
      }))
      const { useDraftDocuments } = await import('../../src/composables/useDraftDocuments')
      const documents = useDraftDocuments(mockHost, git)
      const coverChange = await documents.prepareArticleImageChange(articleFsPath, ['cover'])
      expect(coverChange).toMatchObject({
        original: latestMarkdown,
        modified: '---\ntitle: Newer title\ncover: true\n---\n\nThe newest body.\n',
      })
      const imageChanges = await documents.prepareArticleImageChange(articleFsPath, ['cover', 'og'])
      await context.branchActionHandler[publish]({ commitMessage: 'Add article images' })

      expect(git.api.commitFiles).toHaveBeenCalledTimes(1)
      const [files] = git.api.commitFiles.mock.calls[0]!
      expect(files).toHaveLength(3)
      expect(files.find(file => file.path === 'content/resources/guide/step.md')?.content).toBe(imageChanges?.modified)
      expect(files).toEqual(expect.arrayContaining([
        expect.objectContaining({
          path: 'content/resources/guide/step.md',
          expectedSha: 'abc123',
          content: '---\ntitle: Newer title\ncover: true\nog: true\n---\n\nThe newest body.\n',
        }),
        expect.objectContaining({ path: 'public/images/blog/guide/step/cover.png', content: 'c2Vjb25k' }),
        expect.objectContaining({ path: 'public/images/blog/guide/step/og.png', content: 'c2Vjb25k' }),
      ]))
    }
    finally {
      vi.unstubAllGlobals()
      globalThis.FileReader = originalFileReader
    }
  })

  it('replaces a pending deletion and keeps the image draft when publishing fails', async () => {
    const { context, media, git, originalFileReader } = await setupArticleImages()
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ close: vi.fn() }))
    try {
      await media.remove([coverPath])
      expect((await media.get(coverPath))?.status).toBe('deleted')
      const file = createMockFile('new-cover.png')
      await media.saveArticleImage({ articleFsPath, articlePath, field: 'cover', file })
      expect((await media.get(coverPath))?.status).toBe('updated')
      expect(media.list.value).toHaveLength(1)

      git.api.fetchFile.mockResolvedValue(createMockGithubFile({ content: '---\ncover: true\n---\nArticle body.\n' }))
      git.api.commitFiles.mockRejectedValueOnce(new Error('GitHub unavailable'))
      await expect(context.branchActionHandler[publish]({ commitMessage: 'Update cover' })).rejects.toThrow('GitHub unavailable')
      expect(git.api.commitFiles.mock.calls[0]?.[0]).toEqual([
        expect.objectContaining({ path: 'public/images/blog/guide/step/cover.png', status: 'updated', content: expect.any(String) }),
      ])
      expect((await media.get(coverPath))?.status).toBe('updated')
    }
    finally {
      vi.unstubAllGlobals()
      globalThis.FileReader = originalFileReader
    }
  })
})
