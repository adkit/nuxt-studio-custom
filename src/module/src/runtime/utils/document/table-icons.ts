import type { NodeHandler } from 'comark/render'
import type { ElementNodeAttributes } from 'comark'

export function isTableIcon(tag: unknown) {
  return tag === 'icon' || tag === 'code-icon'
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
