import { Router } from '@koa/router'
import multer from '@koa/multer'
import { mkdir, unlink } from 'fs/promises'
import { createReadStream } from 'fs'
import { basename, extname, resolve } from 'path'

import { media, mediaStore } from '../database/database.js'
import { MediaAsset } from '../../types/index.js'
import { hasRole } from '../helpers/roles.js'

const mediaRoot = resolve('.database/media')

await mkdir(mediaRoot, { recursive: true })

const normaliseText = (value: unknown, fallback = '') => {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed || fallback
}

const normaliseFolder = (value: unknown, fallback = 'general') => {
  const normalised = normaliseText(value, fallback)
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-/]+|[-/]+$/g, '')

  return normalised || fallback
}

const normaliseNumber = (value: unknown, fallback = 0) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return fallback

  const normalised = Number(value)
  return Number.isFinite(normalised) ? normalised : fallback
}

const sortByDate = (assets: MediaAsset[]) => {
  return assets.sort((left, right) => {
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  })
}

const sortByGroupOrder = (assets: MediaAsset[]) => {
  return assets.sort((left, right) => {
    const orderDifference = (left.order || 0) - (right.order || 0)
    if (orderDifference !== 0) return orderDifference
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  })
}

const deactivateSlotAssets = (slot: string, exceptId?: string) => {
  if (!slot) return

  for (const asset of Object.values(media)) {
    if (asset.slot === slot && asset.id !== exceptId) {
      asset.active = false
      asset.updatedAt = new Date().toISOString()
    }
  }
}

const upload = multer({
  storage: multer.diskStorage({
    filename: (req, file, cb) => {
      const extension = extname(file.originalname || '') || '.bin'
      cb(null, `${crypto.randomUUID()}${extension.toLowerCase()}`)
    },
    destination: async (req, file, cb) => {
      const year = new Date().getFullYear().toString()
      const directory = resolve(mediaRoot, year)

      try {
        await mkdir(directory, { recursive: true })
        cb(null, directory)
      } catch (error) {
        cb(error as Error, directory)
      }
    }
  }),
  limits: {
    fileSize: 20 * 1024 * 1024
  }
})

const router = new Router({
  prefix: '/api/media'
})

const publicRouter = new Router({
  prefix: '/api/media'
})

router.use(async (ctx, next) => {
  if (!hasRole(ctx.state.userid, 'admin')) {
    ctx.status = 403
    ctx.body = { error: 'Forbidden', message: 'Admin role required for media management' }
    return
  }

  await next()
})

publicRouter.get('/public', async (ctx) => {
  const slot = normaliseText(ctx.query.slot)
  const collection = normaliseText(ctx.query.collection)
  const folder = normaliseFolder(ctx.query.folder, '')
  const group = normaliseFolder(ctx.query.group, '')

  let assets = Object.values(media).filter((asset) => asset.active)

  if (slot) {
    assets = assets.filter((asset) => asset.slot === slot)
  }

  if (collection) {
    assets = assets.filter((asset) => asset.collection === collection)
  }

  if (folder) {
    assets = assets.filter((asset) => (asset.folder || 'general') === folder)
  }

  if (group) {
    assets = assets.filter((asset) => (asset.group || '') === group)
  }

  ctx.body = group ? sortByGroupOrder(assets) : sortByDate(assets)
  ctx.status = 200
  ctx.set('Content-Type', 'application/json')
})

publicRouter.get('/public/manifest', async (ctx) => {
  const collection = normaliseText(ctx.query.collection)
  const folder = normaliseFolder(ctx.query.folder, '')
  const group = normaliseFolder(ctx.query.group, '')

  let assets = Object.values(media).filter((asset) => asset.active)

  if (collection) {
    assets = assets.filter((asset) => asset.collection === collection)
  }

  if (folder) {
    assets = assets.filter((asset) => (asset.folder || 'general') === folder)
  }

  if (group) {
    assets = assets.filter((asset) => (asset.group || '') === group)
  }

  const sortedAssets = sortByDate(assets)
  const bySlot = sortedAssets.reduce<Record<string, MediaAsset>>((acc, asset) => {
    if (asset.slot) {
      acc[asset.slot] = asset
    }
    return acc
  }, {})

  const byFolder = sortedAssets.reduce<Record<string, MediaAsset[]>>((acc, asset) => {
    const key = asset.folder || 'general'
    if (!acc[key]) {
      acc[key] = []
    }
    acc[key].push(asset)
    return acc
  }, {})

  const byCollection = sortedAssets.reduce<Record<string, MediaAsset[]>>((acc, asset) => {
    if (!acc[asset.collection]) {
      acc[asset.collection] = []
    }
    acc[asset.collection].push(asset)
    return acc
  }, {})

  const byGroup = sortedAssets.reduce<Record<string, MediaAsset[]>>((acc, asset) => {
    if (!asset.group) return acc
    if (!acc[asset.group]) {
      acc[asset.group] = []
    }
    acc[asset.group].push(asset)
    return acc
  }, {})

  for (const key of Object.keys(byGroup)) {
    byGroup[key] = sortByGroupOrder(byGroup[key])
  }

  ctx.body = {
    generatedAt: new Date().toISOString(),
    total: sortedAssets.length,
    assets: sortedAssets,
    bySlot,
    byGroup,
    byFolder,
    byCollection
  }
  ctx.status = 200
  ctx.set('Content-Type', 'application/json')
})

publicRouter.get('/public/:slot', async (ctx) => {
  const slot = normaliseText(ctx.params.slot)
  const asset = Object.values(media).find((entry) => entry.slot === slot && entry.active)

  if (!asset) {
    ctx.status = 404
    ctx.body = { error: 'No active media found for this slot' }
    return
  }

  ctx.body = asset
  ctx.status = 200
  ctx.set('Content-Type', 'application/json')
})

publicRouter.get('/public/group/:group', async (ctx) => {
  const group = normaliseFolder(ctx.params.group, '')
  const collection = normaliseText(ctx.query.collection)
  const folder = normaliseFolder(ctx.query.folder, '')

  if (!group) {
    ctx.status = 400
    ctx.body = { error: 'Media group is required' }
    return
  }

  let assets = Object.values(media).filter((asset) => asset.active && asset.group === group)

  if (collection) {
    assets = assets.filter((asset) => asset.collection === collection)
  }

  if (folder) {
    assets = assets.filter((asset) => (asset.folder || 'general') === folder)
  }

  ctx.body = sortByGroupOrder(assets)
  ctx.status = 200
  ctx.set('Content-Type', 'application/json')
})

publicRouter.get('/file/:year/:filename', async (ctx) => {
  const year = normaliseText(ctx.params.year)
  const filename = basename(normaliseText(ctx.params.filename))
  const asset = Object.values(media).find((entry) => entry.year.toString() === year && entry.filename === filename)

  if (!asset) {
    ctx.status = 404
    ctx.body = { error: 'Media file not found' }
    return
  }

  ctx.type = asset.mimeType || 'application/octet-stream'
  ctx.body = createReadStream(resolve(mediaRoot, year, filename))
})

router.get('/', async (ctx) => {
  ctx.body = sortByDate(Object.values(media))
  ctx.status = 200
  ctx.set('Content-Type', 'application/json')
})

router.post('/upload', upload.array('files'), async (ctx) => {
  const files = (ctx.files || []) as Array<{
    path: string
    originalname: string
    mimetype: string
    size: number
  }>
  const body = (ctx.request.body || {}) as Record<string, unknown>

  if (!files.length) {
    ctx.status = 400
    ctx.body = { error: 'No files uploaded' }
    return
  }

  const now = new Date().toISOString()
  const collection = normaliseText(body.collection, 'website')
  const folder = normaliseFolder(body.folder, 'general')
  const slot = normaliseText(body.slot)
  const group = normaliseFolder(body.group, '')
  const order = normaliseNumber(body.order, 0)
  const alt = normaliseText(body.alt)
  const active = body.active === 'true'

  const assets = files.map((file) => {
    const year = new Date().getFullYear()
    const asset: MediaAsset = {
      id: crypto.randomUUID(),
      filename: basename(file.path),
      originalName: file.originalname,
      year,
      url: `/api/media/file/${year}/${basename(file.path)}`,
      mimeType: file.mimetype,
      size: file.size,
      collection,
      folder,
      slot,
      group,
      order,
      alt: alt || file.originalname.replace(extname(file.originalname), ''),
      active,
      createdAt: now,
      updatedAt: now
    }

    media[asset.id] = asset

    if (asset.active && asset.slot) {
      deactivateSlotAssets(asset.slot, asset.id)
    }

    return asset
  })

  await mediaStore.put(media)

  ctx.body = assets
  ctx.status = 201
  ctx.set('Content-Type', 'application/json')
})

router.patch('/:id', async (ctx) => {
  const id = normaliseText(ctx.params.id)
  const asset = media[id]
  const body = (ctx.request.body || {}) as Record<string, unknown>

  if (!asset) {
    ctx.status = 404
    ctx.body = { error: 'Media item not found' }
    return
  }

  const nextSlot = normaliseText(body.slot, asset.slot || '')
  const nextCollection = normaliseText(body.collection, asset.collection)
  const nextFolder = normaliseFolder(body.folder, asset.folder || 'general')
  const nextGroup = normaliseFolder(body.group, asset.group || '')
  const nextOrder = normaliseNumber(body.order, asset.order || 0)
  const nextAlt = normaliseText(body.alt, asset.alt || '')
  const nextActive = typeof body.active === 'boolean' ? body.active : asset.active

  if (nextActive && nextSlot) {
    deactivateSlotAssets(nextSlot, id)
  }

  media[id] = {
    ...asset,
    slot: nextSlot,
    collection: nextCollection,
    folder: nextFolder,
    group: nextGroup,
    order: nextOrder,
    alt: nextAlt,
    active: nextActive,
    updatedAt: new Date().toISOString()
  }

  await mediaStore.put(media)

  ctx.body = media[id]
  ctx.status = 200
  ctx.set('Content-Type', 'application/json')
})

router.delete('/:id', async (ctx) => {
  const id = normaliseText(ctx.params.id)
  const asset = media[id]

  if (!asset) {
    ctx.status = 404
    ctx.body = { error: 'Media item not found' }
    return
  }

  try {
    await unlink(resolve(mediaRoot, asset.year.toString(), asset.filename))
  } catch (error) {
    console.warn(`Unable to remove media file ${asset.filename}`, error)
  }

  delete media[id]
  await mediaStore.put(media)

  ctx.status = 204
})

export const publicMedia = publicRouter.routes()

export default router.routes()
