import type { NodeHandler } from 'comark/render'
import type { ComarkPlugin, ElementNodeAttributes } from 'comark'

export function isTableIcon(tag: unknown) {
  return tag === 'icon' || tag === 'code-icon'
}

// Studio 1.8 flattened block icons into one table cell. Recover their props before
// the inline Markdown parser consumes the braces and leaves only the literal marker.
export const readLegacyTableIcons: ComarkPlugin = {
  name: 'read-legacy-table-icons',
  markdownItPlugins: [md => md.core.ruler.before('inline', 'legacy_table_icons', (state) => {
    for (const [index, token] of state.tokens.entries()) {
      const previous = state.tokens[index - 1]?.type
      if (token.type !== 'inline' || (previous !== 'td_open' && previous !== 'th_open')) continue
      // Some cells start with an unconfigured icon left over from the insert menu.
      const placeholder = /^::icon\s+---\s+mode: svg\s+size: '\d+'\s+customize:\s+name: ''\s+---\s+::\s+(?=::(?:code-)?icon\{)/
      const content = token.content.replace(placeholder, '')
      const block = /^::(code-icon|icon)(\{[^{}|\n]+\})\s+::(?=\s|$)/
      if (block.test(content)) token.content = content.replace(block, ':$1$2')
    }
  })],
}

export const renderTableWithInlineIcons: NodeHandler = async (table, state, parent) => {
  if (table[1].$?.html === 1) return state.handlers.html!(table, state, parent)
  const handlers = { ...state.context.handlers, 'icon': renderInlineIcon, 'code-icon': renderInlineIcon }
  const previous = state.applyContext({ handlers })
  try {
    return await state.handlers.table!(table, state)
  }
  finally {
    state.applyContext(previous)
  }
}

const renderInlineIcon: NodeHandler = async (node, state, parent) => {
  const [tag, attrs, ...children] = node
  if (attrs.$?.html === 1) return state.handlers.html!(node, state, parent)
  // Table rows cannot contain a multiline YAML block. Write object props as bindings.
  const props: ElementNodeAttributes = {}
  for (const key of Object.keys(attrs).sort((a, b) => a.localeCompare(b))) {
    const value = attrs[key]
    if (key !== '$' && typeof value === 'object') {
      props[key.startsWith(':') ? key : ':' + key] = JSON.stringify(value)
    }
    else {
      props[key] = value
    }
  }
  const previous = state.applyContext({ inline: true })
  try {
    const icon = await state.handlers.mdc!([tag, props, ...children], state, parent)
    const siblings = parent?.slice(2) ?? []
    const index = siblings.indexOf(node)
    const before = siblings[index - 1]
    const after = siblings[index + 1]
    const prefix = before && (typeof before !== 'string' || !/\s$/.test(before)) ? ' ' : ''
    const suffix = typeof after === 'string' ? after && !/^\s/.test(after) : Array.isArray(after) && !isTableIcon(after[0])
    return prefix + icon + (suffix ? ' ' : '')
  }
  finally {
    state.applyContext(previous)
  }
}
