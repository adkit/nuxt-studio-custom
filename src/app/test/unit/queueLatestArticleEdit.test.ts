import { expect, it } from 'vitest'
import { queueLatestArticleEdit } from '../../src/utils/queueLatestArticleEdit'

it('keeps the final sentence when several keystrokes arrive during conversion', async () => {
  const saved: string[] = []
  let finish!: () => void
  const converting = new Promise<void>((resolve) => {
    finish = resolve
  })
  const change = queueLatestArticleEdit<string>(() => 'article', async (value, isLatest) => {
    await converting
    if (isLatest()) saved.push(value)
  })
  const first = change('A')
  await change('A whole')
  await change('A whole sentence.')
  finish()
  await first
  expect(saved).toEqual(['A whole sentence.'])
})
