import type { Storage } from 'unstorage'
import { createResolver } from '@nuxt/kit'

export async function getAssetsDefaultStorageDevTemplate() {
  return [
    'import { createStorage } from \'unstorage\'',
    'import httpDriver from \'unstorage/drivers/http\'',
    '',
    `export const publicAssetsStorage = createStorage({ driver: httpDriver({ base: '/__nuxt_studio/dev/public' }) })`,
    'export const externalAssetsStorage = null',
  ].join('\n')
}

export async function getAssetsDefaultStorageTemplate(assetsStorage: Storage) {
  const keys = await assetsStorage.getKeys()
  const mediaUtils = createResolver(import.meta.url).resolve('./runtime/utils/media')

  return [
    'import { createStorage } from \'unstorage\'',
    'const storage = createStorage({})',
    '',
    `import { mediaItemFieldsFromKey } from ${JSON.stringify(mediaUtils)}`,
    `for (const key of ${JSON.stringify(keys)}) {`,
    '  const media = mediaItemFieldsFromKey(key)',
    '  storage.setItem(media.id, media)',
    '}',
    '',
    'export const publicAssetsStorage = storage',
    'export const externalAssetsStorage = null',
  ].join('\n')
}

export async function getAssetsExternalStorageTemplate() {
  return [
    'import { createStorage } from \'unstorage\'',
    'import httpDriver from \'unstorage/drivers/http\'',
    '',
    'export const externalAssetsStorage = createStorage({',
    '  driver: httpDriver({',
    '    base: \'/__nuxt_studio/medias\'',
    '  })',
    '})',
    'export const publicAssetsStorage = null',
  ].join('\n')
}
