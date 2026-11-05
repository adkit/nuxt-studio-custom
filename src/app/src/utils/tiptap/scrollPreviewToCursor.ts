import type { Editor } from '@tiptap/core'

// ContentRenderer identifies the article. Studio and the preview share a document.
export function scrollPreviewToCursor(editor: Editor, documentId: string) {
  const preview = document.querySelector(`[data-content-id="${CSS.escape(documentId)}"]`)
  if (!preview) return

  const selection = editor.state.selection
  const $head = 'node' in selection ? selection.$from : selection.$head
  const blockIndex = $head.index(0)
  const doc = editor.state.doc
  const block = doc.maybeChild(blockIndex)
  if (!block || block.type.name === 'frontmatter') return

  // Use a heading as the starting point. Rendered components can add or omit
  // elements earlier in the article, and the editor adds its own page settings.
  const children = Array.from(preview.children)
  let firstBlock = doc.firstChild?.type.name === 'frontmatter' ? 1 : 0
  let firstElement = 0
  for (let i = blockIndex; i >= firstBlock; i--) {
    const node = doc.child(i)
    if (node.type.name !== 'heading') continue
    const matches = children.filter(el => el.tagName === `H${node.attrs.level}` && el.textContent.trim() === node.textContent.trim())
    if (matches.length !== 1) continue
    firstBlock = i
    firstElement = children.indexOf(matches[0]!)
    break
  }

  let target = children[firstElement + blockIndex - firstBlock]
  if (!target) return
  if (block.type.name === 'table' && $head.depth >= 3) {
    const table = target instanceof HTMLTableElement ? target : target.querySelector('table')
    const cell = table?.rows[$head.index(1)]?.cells[$head.index(2)]
    if (cell) target = cell
  }

  const text = $head.depth ? $head.parent.textContent.trim() : ''
  if (text) {
    // A list, table, or callout can contain more than one editable paragraph.
    const inside = target.querySelectorAll('p, li, th, td, pre')
    const nested = Array.from(inside).find(el => el.textContent.trim() === text)
    if (nested) target = nested
    else if (!target.textContent.includes(text)) {
      // The preview may still show the previous edit. Only use an unambiguous match.
      const matches = Array.from(preview.querySelectorAll('p, li, th, td, pre, h1, h2, h3, h4, h5, h6')).filter(el => el.textContent.trim() === text)
      if (matches.length !== 1) return
      target = matches[0]!
    }
  }

  const rect = target.getBoundingClientRect()
  if (!rect.height) return

  const sourcePos = 'node' in selection || !$head.depth ? $head.pos : $head.before()
  const source = editor.view.nodeDOM(sourcePos)
  const sourceTop = source instanceof Element ? source.getBoundingClientRect().top : editor.view.coordsAtPos($head.pos).top

  // A sticky site header can cover a line that is visible in the editor.
  const header = document.querySelector('header, [role="banner"]')
  const headerBottom = header && ['fixed', 'sticky'].includes(getComputedStyle(header).position)
    ? header.getBoundingClientRect().bottom
    : 0
  const scroller = findScrollContainer(target)
  const viewport = scroller === document.scrollingElement ? null : scroller.getBoundingClientRect()
  const top = Math.max(headerBottom, viewport?.top ?? 0) + 4
  const bottom = Math.min(window.innerHeight, viewport?.bottom ?? window.innerHeight)
  const desiredTop = Math.max(top, Math.min(sourceTop, bottom - Math.min(rect.height, 24)))
  const delta = rect.top - desiredTop
  if (Math.abs(delta) <= 1) return
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  scroller.scrollBy({ top: delta, behavior: reduceMotion ? 'instant' : 'smooth' })
}

function findScrollContainer(target: Element): Element {
  for (let el = target.parentElement; el && el !== document.body; el = el.parentElement) {
    if (el.scrollHeight > el.clientHeight && ['auto', 'scroll', 'overlay'].includes(getComputedStyle(el).overflowY)) return el
  }
  return document.scrollingElement ?? document.documentElement
}
