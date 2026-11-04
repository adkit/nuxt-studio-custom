export function queueLatestArticleEdit<T>(getId: () => string | undefined, convert: (value: T, isLatest: () => boolean) => Promise<void>) {
  let pending: { value: T, id: string | undefined } | undefined
  let running = false
  return async (value: T) => {
    pending = { value, id: getId() }
    if (running) return
    running = true
    try {
      while (pending) {
        const next = pending
        pending = undefined
        await convert(next.value, () => !pending && next.id === getId())
      }
    }
    finally {
      running = false
    }
  }
}
