// This file contains a test for publishing an image when its article changed on GitHub.
import { expect, it, vi } from 'vitest'
import { DraftStatus } from '../../../../src/types/draft'
import { createGitHubProvider } from '../../../../src/utils/providers/github'

const { repositoryApi } = vi.hoisted(() => ({ repositoryApi: vi.fn() }))
vi.mock('ofetch', () => ({ ofetch: { create: () => repositoryApi } }))

it('stops before writing any files if the article changed on the commit being updated', async () => {
  repositoryApi.mockResolvedValueOnce({ object: { sha: 'latest-commit' } })
  repositoryApi.mockResolvedValueOnce({ sha: 'new-article' })
  const github = createGitHubProvider({
    provider: 'github',
    owner: 'adkit',
    repo: 'adkit-monorepo',
    branch: 'cms',
    rootDir: 'apps/web',
    authorName: 'Writer',
    authorEmail: 'writer@example.com',
    token: 'test-token',
  })
  const files = [
    {
      path: 'content/resources/guide.md',
      content: '---\ncover: true\n---\nArticle.',
      status: DraftStatus.Updated,
      expectedSha: 'old-article',
    },
    {
      path: 'public/images/blog/guide/cover.png',
      content: 'image-bytes',
      status: DraftStatus.Created,
    },
  ]

  await expect(github.commitFiles(files, 'Add cover')).rejects.toThrow('changed on GitHub')
  expect(repositoryApi.mock.calls.map(([path]) => path)).toEqual([
    '/git/refs/heads/cms',
    '/contents/apps/web/content/resources/guide.md?ref=latest-commit',
  ])
})
