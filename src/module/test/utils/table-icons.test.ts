import { expect, it } from 'vitest'
import type { MarkdownDocument } from 'comark'
import { parseMarkdown } from 'comark'
import { renderMarkdown } from 'comark/render'
import { readLegacyTableIcons, renderTableWithInlineIcons } from '../../src/runtime/utils/document/table-icons'

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

it('recovers old table icons while preserving literal examples and prose', async () => {
  const broken = '::code-icon{icon="logos:meta-icon" filename=" " .size-8}   ::  Meta'
  const placeholder = '::icon   ---   mode: svg   size: \'24\'   customize:     name: \'\'   ---   ::    '
  const article = ['| Platform | Example |', '| --- | --- |', `| ${placeholder}${broken} | \`${broken}\` |`, '', 'A closing paragraph.'].join('\n')
  const tree = await parseMarkdown(article, { plugins: [readLegacyTableIcons] })
  const markdown = await renderMarkdown(tree, { components: { table: renderTableWithInlineIcons } })
  expect(markdown).toMatch(/\| :code-icon\{[^}]*logos:meta-icon[^}]*\}\s+Meta/)
  expect(markdown).toContain('`' + broken + '`')
  expect(markdown).toContain('A closing paragraph.')
  const reopened = await parseMarkdown(markdown, { plugins: [readLegacyTableIcons] })
  expect(await renderMarkdown(reopened, { components: { table: renderTableWithInlineIcons } })).toBe(markdown)
})
