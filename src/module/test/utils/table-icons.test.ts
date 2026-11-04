import { expect, it } from 'vitest'
import type { MarkdownDocument } from 'comark'
import { renderMarkdown } from 'comark/render'
import { renderTableWithInlineIcons } from '../../src/runtime/utils/document/table-icons'

it.each(['icon', 'code-icon'])('saves %s beside a label in a table cell', async (tag) => {
  const props = tag === 'icon' ? { name: 'logos:google-ads' } : { icon: 'logos:google-ads' }
  const body: MarkdownDocument = { frontmatter: {}, meta: {}, nodes: [
    ['table', {}, ['thead', {}, ['tr', {}, ['th', {}, 'Platform']]],
      ['tbody', {}, ['tr', {}, ['td', {}, [tag, props], ['p', {}, 'Google Ads']]]]],
  ] }
  const md = await renderMarkdown(body, { components: { table: renderTableWithInlineIcons } })
  expect(md).not.toContain('::')
  expect(md).toContain('logos:google-ads')
  expect(md).toMatch(/\}\s+Google Ads/)
})
