#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { access, copyFile, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const DATABASE_DIR = resolve('.database')
const CACHE_DIR = resolve(DATABASE_DIR, 'manufacturer-cache')
const PRODUCT_IMAGE_DIR = resolve(DATABASE_DIR, 'product-images')
const DEFAULT_DELAY_MS = 5000
const DEFAULT_DAILY_LIMIT = 100

const decodeHtml = (value = '') =>
  value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&nbsp;', ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export const normalizeSku = (value = '') => String(value).replace(/[^a-z0-9]/gi, '').toLowerCase()

const knownBrands = [
  ['Ideal Standard', /\bideal standard\b/i],
  ['GF Piping Systems', /\b(gf piping|georg fischer)\b/i],
  ['Grundfos', /\bgrundfos\b/i],
  ['Hansgrohe', /\bhansgrohe\b/i],
  ['Geberit', /\bgeberit\b/i],
  ['Vaillant', /\bvaillant\b/i],
  ['Viega', /\bviega\b/i],
  ['Bosch', /\b(bosch|junkers)\b/i],
  ['Grohe', /\bgrohe\b/i],
  ['Caleffi', /\bcaleffi\b/i],
  ['Delabie', /\bdelabie\b/i],
  ['RIDGID', /\bridgid\b/i],
  ['Comap', /\bcomap\b/i],
  ['Giacomini', /\bgiacomini\b/i],
  ['Ariston', /\bariston\b/i],
  ['OLI', /\boli\b/i],
  ['ACV', /\bacv\b/i]
]

export const detectManufacturer = (item) => {
  const catalogBrand = String(item.technicalData?.Merk || item.manufacturerData?.Merk || '').trim()
  return catalogBrand ||
    knownBrands.find(([, expression]) => expression.test(`${item.name || ''} ${item.description || ''}`))?.[0]
}

const productSkuFor = (item) =>
  String(item.technicalData?.['Artikelcode leverancier'] || item.manufacturerData?.MPN || item.productNumber || '').trim()

export const hasUsableImageValue = (item) => /^(?:https?:\/\/|\/(?:cache|catalog-assets)\/)\S+$/i
  .test(String(item.image || '').trim())

const productImageCacheFile = (imageUrl, variant) =>
  `${createHash('sha256').update(`v2:${variant}:${imageUrl}`).digest('hex')}.webp`

const firstMatch = (html, expression) => decodeHtml(html.match(expression)?.[1] || '')

const metaContent = (html, attribute, value) => {
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = Object.fromEntries(
      [...tag[0].matchAll(/([:\w-]+)\s*=\s*["']([^"']*)["']/g)].map((match) => [match[1].toLowerCase(), decodeHtml(match[2])])
    )
    if (String(attributes[attribute] || '').toLowerCase() === value.toLowerCase()) return attributes.content || ''
  }
  return ''
}

const officialPageResult = (html, expectedSku, {
  brand,
  pageUrl,
  evidenceSku = expectedSku,
  imageUrl,
  title,
  familyImage = false
}) => {
  const normalizedEvidence = normalizeSku(evidenceSku)
  const normalizedPage = normalizeSku(decodeHtml(html))
  if (!normalizedEvidence || !normalizedPage.includes(normalizedEvidence)) return null

  const imageCandidate = imageUrl || metaContent(html, 'property', 'og:image') || metaContent(html, 'name', 'twitter:image')
  if (!imageCandidate) return null
  const resolvedImage = new URL(imageCandidate, pageUrl).href
  if (!/^https?:\/\//i.test(resolvedImage)) return null
  return {
    title: title || metaContent(html, 'property', 'og:title') || firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i),
    technicalData: {
      Merk: brand,
      MPN: String(evidenceSku),
      Beeldtype: familyImage ? 'Officieel productfamiliebeeld' : 'Officieel productbeeld'
    },
    imageUrl: resolvedImage,
    publishableImage: true,
    rightsStatus: 'permission-required'
  }
}

const stripSupplierPrefix = (sku, prefix) => String(sku).replace(new RegExp(`^${prefix}`, 'i'), '')

export const parseBoschProductPage = (html, expectedSku, pageUrl) => {
  const normalizedSku = normalizeSku(expectedSku)
  const skuEvidence = [
    ...html.matchAll(/data-item-mfact=["']([^"']+)["']/gi),
    ...html.matchAll(/Bestelnummer[\s\S]{0,500}?([0-9][0-9 .-]{7,})/gi)
  ].map((match) => normalizeSku(match[1]))

  if (!normalizedSku || !skuEvidence.includes(normalizedSku)) return null

  const title =
    firstMatch(html, /<h3[^>]*class=["'][^"']*\bHl-3\b[^"']*["'][^>]*>([\s\S]*?)<\/h3>/i) ||
    firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i).replace(/\s*-\s*Onderdelen catalogus\s*$/i, '')

  const technicalData = {}
  const specificationTable =
    html.match(/<div[^>]*class=["'][^"']*\bImageTable_table\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || ''
  for (const row of specificationTable.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((cell) => decodeHtml(cell[1]))
    if (cells.length >= 2 && cells[0] && cells[1]) technicalData[cells[0]] = cells[1]
  }

  const imagePath = html.match(/<img[^>]+src=["']([^"']*\/web-etk\/documents\/img\?id=\d+)["']/i)?.[1]
  const imageUrl = imagePath ? new URL(decodeHtml(imagePath), pageUrl).href : undefined

  return { title, technicalData, imageUrl }
}

export const parseIcecatProduct = (raw, expectedSku, expectedBrand) => {
  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    return null
  }
  if (payload?.msg !== 'OK' || !payload?.data) return null

  const general = payload.data.GeneralInfo || payload.data.EssentialInfo || {}
  const productCode = general.BrandPartCode || general.ProductCode || payload.data.EssentialInfo?.ProductCode || ''
  const brand = general.Brand || payload.data.EssentialInfo?.Brand || ''
  if (normalizeSku(productCode) !== normalizeSku(expectedSku)) return null
  if (normalizeSku(brand) !== normalizeSku(expectedBrand)) return null

  const gtins = general.GTINs || general.GTIN || payload.data.EssentialInfo?.GTINs || []
  const gtinValues = gtins
    .map((entry) => (typeof entry === 'string' ? entry : entry?.Value || entry?.GTIN || ''))
    .filter(Boolean)
  const gallery = Array.isArray(payload.data.Gallery) ? payload.data.Gallery : []
  const mainImage = gallery.find((entry) => entry.IsMain === 'Y') || gallery[0]
  const title = general.Title || payload.data.Title || general.ProductName || ''
  const category = general.Category?.Name?.Value || general.Category?.Name || ''

  return {
    title,
    description: decodeHtml(general.Description?.LongDesc || ''),
    technicalData: {
      Merk: brand,
      MPN: productCode,
      ...(gtinValues.length ? { GTIN: gtinValues.join(', ') } : {}),
      ...(category ? { Categorie: category } : {})
    },
    imageUrl: mainImage?.Pic || mainImage?.Pic500x500 || mainImage?.LowPic,
    rightsStatus: 'licensed',
    icecatId: general.IcecatId || payload.data.GeneralInfo?.IcecatId
  }
}

export const parseEatonProductPage = (html, expectedSku, pageUrl) => {
  const evidence = html.match(/["']productSku["']\s*:\s*["']([^"']+)["']/i)?.[1] || ''
  if (normalizeSku(evidence) !== normalizeSku(expectedSku)) return null
  const imageUrl = metaContent(html, 'property', 'og:image')
  if (!imageUrl) return null
  const title = firstMatch(html, /<h1[^>]*class=["'][^"']*module-product-detail-card-v2__title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)
  const ean = html.match(/specification-value-secondary["'][^>]*>\s*(\d{8,14})\s*</i)?.[1] || ''
  return {
    title,
    technicalData: { Merk: 'Eaton', MPN: String(evidence), ...(ean ? { GTIN: ean } : {}) },
    imageUrl: new URL(imageUrl, pageUrl).href,
    publishableImage: true,
    rightsStatus: 'permission-required'
  }
}

export const parseRittalSitemap = (xml) => {
  const pages = new Map()
  for (const match of xml.matchAll(/<loc>([^<]+[?&]variantId=([^<&]+)[^<]*)<\/loc>/gi)) {
    const pageUrl = decodeHtml(match[1])
    const sku = decodeHtml(match[2])
    if (sku) pages.set(normalizeSku(sku), pageUrl)
  }
  return pages
}

export const parseRittalProductPage = (html, expectedSku, pageUrl) => {
  const pageSku = new URL(pageUrl).searchParams.get('variantId') || ''
  if (normalizeSku(pageSku) !== normalizeSku(expectedSku)) return null
  return officialPageResult(html, expectedSku, {
    brand: 'Rittal',
    pageUrl,
    title: metaContent(html, 'property', 'og:title'),
    imageUrl: metaContent(html, 'property', 'og:image')
  })
}

export const parseLedlinesSitemap = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)]
  .map((match) => decodeHtml(match[1]))
  .filter((pageUrl) => /^https:\/\/ledlines\.be\/producten\/[^/]+\/?$/i.test(pageUrl))

const ledlinesPageFor = (pages, item) => {
  const productName = normalizeSku(item.name || '')
  return pages
    .map((pageUrl) => {
      const slug = new URL(pageUrl).pathname.split('/').filter(Boolean).at(-1) || ''
      const familyKey = normalizeSku(slug)
      return { pageUrl, familyKey }
    })
    .filter(({ familyKey }) => familyKey.length >= 4 && productName.includes(familyKey))
    .sort((left, right) => right.familyKey.length - left.familyKey.length)[0]?.pageUrl
}

export const parseLedlinesProductPage = (html, expectedSku, pageUrl) => {
  const normalizedSku = normalizeSku(expectedSku)
  const listedSkus = [...html.matchAll(/\/datasheets\/nl\/([^/"'?]+)-nl\.pdf/gi)]
    .map((match) => normalizeSku(decodeHtml(match[1])))
  if (!normalizedSku || !listedSkus.includes(normalizedSku)) return null
  const imageUrl = metaContent(html, 'property', 'og:image')
  if (!imageUrl) return null
  return {
    title: metaContent(html, 'property', 'og:title').replace(/\s*-\s*Ledlines\.be\s*$/i, ''),
    technicalData: { Merk: 'Ledlines', MPN: String(expectedSku), Beeldtype: 'Officieel productfamiliebeeld' },
    imageUrl: new URL(imageUrl, pageUrl).href,
    publishableImage: true,
    rightsStatus: 'permission-required'
  }
}

export const parseExterusProductPage = (html, expectedSku, pageUrl, searchResult = {}) => {
  const manufacturerSku = stripSupplierPrefix(expectedSku, 'EXT')
  const normalizedSku = normalizeSku(manufacturerSku)
  if (!normalizedSku) return null
  const referenceValues = [...html.matchAll(/(?:^|[>\s"'])(([A-Z]+\d|\d+[A-Z])[A-Z0-9./_-]{2,})(?=[<\s"']|$)/gi)]
    .map((match) => normalizeSku(decodeHtml(match[1])))
  if (!referenceValues.includes(normalizedSku)) return null
  const imageUrl = searchResult.thumbnail || metaContent(html, 'property', 'og:image')
  if (!imageUrl) return null
  return {
    title: searchResult.name || metaContent(html, 'property', 'og:title') || firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i),
    technicalData: { Merk: 'Exterus', MPN: manufacturerSku, Beeldtype: 'Officieel productfamiliebeeld' },
    imageUrl: new URL(imageUrl, pageUrl).href,
    publishableImage: true,
    rightsStatus: 'permission-required'
  }
}

export const parseWeverDucreProductPage = (html, expectedSku, pageUrl) => {
  const normalizedSku = normalizeSku(expectedSku)
  if (!normalizedSku) return null
  const exactCodes = [...decodeHtml(html).matchAll(/(?:^|\s)([A-Z0-9][A-Z0-9./_-]{5,})(?=\s|$)/gi)]
    .map((match) => normalizeSku(match[1]))
  if (!exactCodes.includes(normalizedSku)) return null

  const productImages = [...html.matchAll(/(?:data-srcset|srcset)=["']([^"']*\/pim\/[^"']+)["']/gi)]
    .flatMap((match) => decodeHtml(match[1]).split(',').map((entry) => entry.trim().split(/\s+/, 1)[0]))
    .filter((url) => /product-detail-img-(?:small|large)/i.test(url) && !/drawing/i.test(url))
  const imageFrequency = new Map()
  for (const image of productImages) imageFrequency.set(image, Number(imageFrequency.get(image) || 0) + 1)
  const exactImage = productImages.find((image) => normalizeSku(image).includes(normalizedSku))
  const repeatedImage = [...imageFrequency]
    .filter(([, count]) => count > 1)
    .sort((left, right) => right[1] - left[1] || Number(/@2x/i.test(right[0])) - Number(/@2x/i.test(left[0])))[0]?.[0]
  const imageUrl = exactImage || repeatedImage || productImages.at(-1)
  if (!imageUrl) return null

  return {
    title: firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i),
    technicalData: {
      Merk: 'Wever & Ducré',
      MPN: String(expectedSku),
      Beeldtype: 'Officieel productfamiliebeeld'
    },
    imageUrl: new URL(imageUrl, pageUrl).href,
    publishableImage: true,
    rightsStatus: 'permission-required'
  }
}

const decodeJsonString = (value = '') => {
  try {
    return JSON.parse(`"${value}"`)
  } catch {
    return value.replaceAll('\\u0026', '&').replaceAll('\\"', '"').replaceAll('\\/', '/')
  }
}

export const parseGeberitProductPage = (html, expectedSku, pageUrl) => {
  const normalizedSku = normalizeSku(expectedSku)
  if (!normalizedSku) return null

  const articles = new Map()
  for (const match of html.matchAll(/Art\. nr\.<\/td>[\s\S]{0,500}?<div>([^<]+)<\/div>/gi)) {
    const articleNumber = decodeHtml(match[1])
    articles.set(normalizeSku(articleNumber), { articleNumber })
  }
  for (const match of html.matchAll(/\\"id\\":\\"([^"\\]+)\\"[\s\S]{0,600}?\\"name\\":\\"([\s\S]*?)\\"/gi)) {
    const articleNumber = decodeJsonString(match[1])
    articles.set(normalizeSku(articleNumber), { articleNumber, name: decodeJsonString(match[2]) })
  }
  const exactArticle = articles.get(normalizedSku)
  if (!exactArticle) return null

  const pageTitle = firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i)
  const isSparePartOverview = /\/spare-part\//i.test(pageUrl)
  let imageUrl = html.match(/<link[^>]+rel=["']preload["'][^>]+as=["']image["'][^>]+href=["'](https:\/\/images\.data\.geberit\.com\/[^"']+)["']/i)?.[1]
  if (!imageUrl) {
    imageUrl = html.match(/\\"type\\":\\"Primary Image\\"[\s\S]{0,1200}?\\"size\\":\\"M\\",\\"url\\":\\"(https:\/\/images\.data\.geberit\.com\/[^"\\]+)\\"/i)?.[1]
  }
  imageUrl = imageUrl ? decodeHtml(decodeJsonString(imageUrl)) : undefined

  const technicalData = {
    Merk: 'Geberit',
    'Art. nr.': exactArticle.articleNumber,
    Beeldtype: isSparePartOverview ? 'Overzichtstekening van bijhorend toestel' : 'Officieel productfamiliebeeld'
  }
  const technicalSection = html.match(/>Technische gegevens<\/h2>([\s\S]*?)(?:<h2|$)/i)?.[1] || ''
  for (const row of technicalSection.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => decodeHtml(cell[1]))
    if (cells.length >= 2 && cells[0] && cells[1]) technicalData[cells[0]] = cells[1]
  }

  return {
    title: exactArticle.name || pageTitle,
    technicalData,
    imageUrl,
    publishableImage: !isSparePartOverview,
    rightsStatus: 'permission-required'
  }
}

const knownGeberitPages = new Map([
  ['361861001', 'https://catalog.geberit.be/nl-BE/product/PRO_101949'],
  ['240468211', 'https://catalog.geberit.be/nl-BE/spare-part/SPT_461543']
])

export const parseViegaProductPage = (html, expectedSku) => {
  const normalizedSku = normalizeSku(expectedSku)
  const articleNumbers = [...html.matchAll(/\b(\d{3})[\s.]?(\d{3})\b/g)].map((match) => normalizeSku(`${match[1]}${match[2]}`))
  if (!normalizedSku || !articleNumbers.includes(normalizedSku)) return null

  const title = firstMatch(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
  const description = firstMatch(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
  const imageUrl = decodeHtml(
    html.match(/https:\/\/web-catalog\.viega\.com\/Images\/PP[^"'\s>]+\.(?:jpg|png|webp)/i)?.[0] || ''
  ) || undefined
  const model = title.match(/\bmodel\s+(.+)$/i)?.[1] || description.match(/-\s*([\d.]+XL)\s*$/i)?.[1]

  return {
    title: title.replace(/\s*-\s*model\s+.+$/i, ''),
    description,
    technicalData: {
      Merk: 'Viega',
      Artikel: String(expectedSku),
      ...(model ? { Model: model } : {}),
      Beeldtype: 'Officieel productfamiliebeeld'
    },
    imageUrl,
    publishableImage: true,
    rightsStatus: 'permission-required'
  }
}

const VIEGA_BASE = 'https://www.viega.be/nl/producten/Catalogus/Leidingtechniek/Profipress/Bochten'
const knownViegaPages = new Map([
  ['476847', `${VIEGA_BASE}/Profipress-XL-Bocht-90-2416XL.html`],
  ['476854', `${VIEGA_BASE}/Profipress-XL-Bocht-90-2416XL.html`],
  ['476878', `${VIEGA_BASE}/Profipress-XL-Bocht-90-2416-1XL.html`],
  ['476885', `${VIEGA_BASE}/Profipress-XL-Bocht-90-2416-1XL.html`],
  ['476908', `${VIEGA_BASE}/Profipress-XL-Bocht-45-2426XL.html`],
  ['476915', `${VIEGA_BASE}/Profipress-XL-Bocht-45-2426XL.html`],
  ['476939', `${VIEGA_BASE}/Profipress-XL-Bocht-45-2426-1XL.html`],
  ['476946', `${VIEGA_BASE}/Profipress-XL-Bocht-45-2426-1XL.html`]
])

const knownSolerPalauProducts = new Map([
  ['5226832600', {
    pageUrl: 'https://www.solerpalau.com/en-en/2373-tls-501-tls-503-t',
    pageEvidence: /\bTLS-501\s*\/\s*TLS-503\s*T\b/i,
    title: 'TLS-501',
    imageUrl: 'https://www.solerpalau.com/media/catalog/product/cache/207e23213cf636ccdef205098cf3c8a3/T/L/TLS-501_product1_2.jpg'
  }],
  ['5131031600', {
    pageUrl: 'https://www.solerpalau.com/en-en/695-ec-n',
    pageEvidence: /\bEC-N(?:\s+Series)?\b/i,
    title: 'EC-9N',
    imageUrl: 'https://www.solerpalau.com/media/catalog/product/cache/2765542505660baab28ecd555e27366e/C/A/CAL_INDS_ECN_produc1.jpg'
  }],
  ['5131033200', {
    pageUrl: 'https://www.solerpalau.com/en-en/695-ec-n',
    pageEvidence: /\bEC-N(?:\s+Series)?\b/i,
    title: 'EC-15N',
    imageUrl: 'https://www.solerpalau.com/media/catalog/product/cache/2765542505660baab28ecd555e27366e/C/A/CAL_INDS_ECN_produc1.jpg'
  }]
])

export const parseSolerPalauProductPage = (html, expectedSku) => {
  const product = knownSolerPalauProducts.get(normalizeSku(expectedSku))
  if (!product || !product.pageEvidence.test(decodeHtml(html))) return null
  return {
    title: product.title,
    technicalData: {
      Merk: 'Soler & Palau',
      MPN: String(expectedSku),
      Beeldtype: product.title.startsWith('EC-') ? 'Officieel productfamiliebeeld' : 'Officieel productbeeld'
    },
    imageUrl: product.imageUrl,
    publishableImage: true,
    rightsStatus: 'permission-required'
  }
}

const knownFischerPages = new Map([
  ['50354', 'https://www.fischer.be/nl-be/products/constructie-kozijnpluggen/nagelplug-n/nagelplug-n-s/50354-n-6-x-40-10-s-50'],
  ['78660', 'https://www.fischer.be/nl-be/products/algemene-bevestigingen/metalen-plug/messingplug-ms/78660-ms-6-x-22'],
  ['78981', 'https://www.fischer.be/nl-be/products/algemene-bevestigingen/metalen-plug/messingplug-ms'],
  ['50491', 'https://www.fischer.be/nl-be/products/algemene-bevestigingen/nylon-pluggen/gasbetonplug-gb/50491-gb-8'],
  ['537259', 'https://www.fischer.be/nl-be/products/hollewand-bevestigingen/tuimelplug/hollewandplug-fischer-duotec/537259-duotec-10-met-schroef'],
  ['542111', 'https://www.fischer.be/nl-be/products/algemene-bevestigingen/nylon-pluggen/metrische-slagplug-rodforce-fgd'],
  ['538246', 'https://www.fischer.be/nl-be/products/algemene-bevestigingen/nylon-pluggen/duopower'],
  ['542796', 'https://www.fischer.be/nl-be/products/hollewand-bevestigingen/tuimelplug/hollewandplug-fischer-duotec']
])

export const parseFischerProductPage = (html, expectedSku, pageUrl) => {
  const manufacturerSku = stripSupplierPrefix(expectedSku, 'FIS')
  return officialPageResult(html, expectedSku, {
    brand: 'Fischer',
    pageUrl,
    evidenceSku: manufacturerSku,
    familyImage: !new URL(pageUrl).pathname.toLowerCase().includes(`/${manufacturerSku.toLowerCase()}-`)
  })
}

const knownGreePages = new Map([
  ['GWH09AUCXBK6DNA1AI', 'https://greeproducts.com/pt-pt/produtos/fm-clivia-9/'],
  ['GWH12AUCXDK6DNA1CI', 'https://greeproducts.com/pt-pt/produtos/fm-clivia-12/'],
  ['GWH18AUDXEK6DNA1AI', 'https://greeproducts.com/pt-pt/produtos/fm-clivia-18/'],
  ['GWH24AUDXFK6DNA1AI', 'https://greeproducts.com/pt-pt/produtos/fm-clivia-24/']
])

export const parseGreeProductPage = (html, expectedSku, pageUrl) => {
  const manufacturerSku = stripSupplierPrefix(expectedSku, 'GRE')
  const officialImages = [...html.matchAll(/<img[^>]+src=["'](https?:\/\/d7rh5s3nxmpy4\.cloudfront\.net\/CMP1049\/[^"']+)["']/gi)]
    .map((match) => decodeHtml(match[1]).replace(/^http:/i, 'https:'))
  const galleryImage = officialImages.find((url) => /\/16\/|white\.png/i.test(url)) || officialImages[0]
  return officialPageResult(html, expectedSku, {
    brand: 'Gree',
    pageUrl,
    evidenceSku: manufacturerSku,
    imageUrl: galleryImage
  })
}

const panasonicSkuFor = (sku) => stripSupplierPrefix(sku, 'PAN')

const panasonicProductImage = (html, manufacturerSku) => {
  const candidates = [...html.matchAll(/https?:\\?\/\\?\/[^"'\s<>]+?\.(?:jpe?g|png|webp)(?:\?[^"'\s<>]*)?/gi)]
    .map((match) => match[0].replaceAll('\\/', '/').replaceAll('\\u0026', '&'))
  const normalizedSku = normalizeSku(manufacturerSku)
  return candidates.find((url) => normalizeSku(url).includes(normalizedSku) && !/logo|icon/i.test(url)) ||
    candidates.find((url) => /product|model|aircon|aquarea/i.test(url) && !/logo|icon|theme\/aircon/i.test(url))
}

export const parsePanasonicProductPage = (html, expectedSku, pageUrl) => {
  const manufacturerSku = panasonicSkuFor(expectedSku)
  return officialPageResult(html, expectedSku, {
    brand: 'Panasonic',
    pageUrl,
    evidenceSku: manufacturerSku,
    imageUrl: panasonicProductImage(html, manufacturerSku)
  })
}

const knownEthermaPages = new Map([
  ['ET14A', 'https://www.etherma.com/nl/verwarming/regeltechniek/regeling-voor-huistechniek/draadloze-thermostaten/et-14a'],
  ['ET111A', 'https://www.etherma.com/nl/verwarming/regeltechniek/regeling-voor-huistechniek/draadloze-thermostaten/et-111a'],
  ['BHKTH', 'https://www.etherma.com/en/heating/direct-heating/bathroom-and-living-room/etherma-bhk'],
  ['BHK63119', 'https://www.etherma.com/en/heating/direct-heating/bathroom-and-living-room/etherma-bhk'],
  ['ICE01', 'https://www.etherma.com/nl/verwarming/heat-tracing/gebruiksklare-verwarmingskabels/etherma-icestop'],
  ['ICE02', 'https://www.etherma.com/nl/verwarming/heat-tracing/gebruiksklare-verwarmingskabels/etherma-icestop'],
  ['ICE04', 'https://www.etherma.com/nl/verwarming/heat-tracing/gebruiksklare-verwarmingskabels/etherma-icestop'],
  ['ICE06', 'https://www.etherma.com/nl/verwarming/heat-tracing/gebruiksklare-verwarmingskabels/etherma-icestop'],
  ['ICE08', 'https://www.etherma.com/nl/verwarming/heat-tracing/gebruiksklare-verwarmingskabels/etherma-icestop'],
  ['ICE10', 'https://www.etherma.com/nl/verwarming/heat-tracing/gebruiksklare-verwarmingskabels/etherma-icestop'],
  ['ICE20', 'https://www.etherma.com/nl/verwarming/heat-tracing/gebruiksklare-verwarmingskabels/etherma-icestop']
])

export const parseEthermaProductPage = (html, expectedSku, pageUrl) => {
  const manufacturerSku = stripSupplierPrefix(expectedSku, 'ETH')
  const productImage = html.match(/<div[^>]+class=["'][^"']*FullWidthImage[^"']*["'][\s\S]{0,800}?<img[^>]+src=["']([^"']+)["']/i)?.[1] ||
    html.match(/<img[^>]+src=["']([^"']*\/FullWidthImage_Component\/[^"']+)["']/i)?.[1]
  return officialPageResult(html, expectedSku, {
    brand: 'Etherma',
    pageUrl,
    evidenceSku: manufacturerSku,
    imageUrl: productImage,
    familyImage: /^ICE\d+$/i.test(manufacturerSku) || /^BHK/i.test(manufacturerSku)
  })
}

const adapters = {
  bosch: {
    label: 'Bosch Home Comfort',
    domain: 'www.bosch-homecomfort.com',
    matches: (item) => /\b(bosch|junkers)\b/i.test(item.name || '') && Boolean(item.productNumber),
    url: (sku) => `https://www.bosch-homecomfort.com/web-etk/be/bosch/be/nl/sparepart/${encodeURIComponent(sku)}`,
    parse: parseBoschProductPage,
    publicUrl: (_item, _result, requestUrl) => requestUrl
  },
  icecat: {
    label: 'Open Icecat',
    domain: 'live.icecat.biz',
    matches: (item) => Boolean(detectManufacturer(item) && productSkuFor(item)),
    url: (sku, item, options) => {
      const params = new URLSearchParams({
        shopname: options.icecatUsername,
        lang: 'nl',
        Brand: detectManufacturer(item),
        ProductCode: sku,
        content: 'title,gallery,essentialinfo,generalinfo'
      })
      if (options.icecatAppKey) params.set('app_key', options.icecatAppKey)
      return `https://live.icecat.biz/api?${params}`
    },
    parse: (raw, sku, _requestUrl, item) => parseIcecatProduct(raw, sku, detectManufacturer(item)),
    publicUrl: (item, result) => {
      const query = encodeURIComponent(`${detectManufacturer(item)} ${productSkuFor(item)}`)
      return result.icecatId
        ? `https://icecat.biz/nl/search?keyword=${query}&icecat_id=${result.icecatId}`
        : `https://icecat.biz/nl/search?keyword=${query}`
    }
  },
  eaton: {
    label: 'Eaton productcatalogus',
    domain: 'www.eaton.com',
    matches: (item) => /^(?:moeller|eaton)$/i.test(String(detectManufacturer(item) || '').trim()) && Boolean(productSkuFor(item)),
    url: (sku) => `https://www.eaton.com/be/nl-nl/skuPage.${encodeURIComponent(sku)}.html`,
    parse: parseEatonProductPage,
    publicUrl: (_item, _result, requestUrl) => requestUrl
  },
  rittal: {
    label: 'Rittal productcatalogus',
    domain: 'www.rittal.com',
    indexDomain: 'api.rittal.com',
    indexUrl: 'https://api.rittal.com/v1/sitemaps/nl-nl/sitemap.xml',
    pages: new Map(),
    prepare(xml) { this.pages = parseRittalSitemap(xml) },
    matches(item) {
      return /^rittal$/i.test(String(detectManufacturer(item) || '').trim()) && this.pages.has(normalizeSku(productSkuFor(item)))
    },
    url(sku) { return this.pages.get(normalizeSku(sku)) },
    parse: parseRittalProductPage,
    publicUrl: (_item, _result, requestUrl) => requestUrl
  },
  ledlines: {
    label: 'Ledlines productcatalogus',
    domain: 'ledlines.be',
    indexUrl: 'https://ledlines.be/products-sitemap.xml',
    pages: [],
    prepare(xml) { this.pages = parseLedlinesSitemap(xml) },
    matches(item) {
      return /^ledlines$/i.test(String(detectManufacturer(item) || '').trim()) && Boolean(ledlinesPageFor(this.pages, item))
    },
    url(_sku, item) { return ledlinesPageFor(this.pages, item) },
    parse: parseLedlinesProductPage,
    publicUrl: (_item, _result, requestUrl) => requestUrl
  },
  exterus: {
    label: 'Exterus productcatalogus',
    domain: 'www.exterus.be',
    indexUrl: 'https://www.exterus.be/nl/producten/interior',
    session: {},
    prepare(html, response) {
      this.session.csrf = metaContent(html, 'name', 'csrf_token') || metaContent(html, 'name', 'csrf-token')
      const cookies = response?.headers?.get('set-cookie') || []
      this.session.cookie = (Array.isArray(cookies) ? cookies : [cookies])
        .map((cookie) => String(cookie).split(';', 1)[0]).filter(Boolean).join('; ')
    },
    matches(item) {
      return /^exterus$/i.test(String(detectManufacturer(item) || '').trim()) && Boolean(productSkuFor(item))
    },
    async lookup(sku, _item, options, state, statePath) {
      const manufacturerSku = stripSupplierPrefix(sku, 'EXT')
      if (!this.session.csrf || !this.session.cookie) {
        return { response: { html: '', status: 401, cached: false }, result: null, pageUrl: this.indexUrl }
      }
      const searchUrl = `https://www.exterus.be/catalog?keepit-sku=${encodeURIComponent(normalizeSku(manufacturerSku))}`
      const searchResponse = await fetchControlled({
        brand: 'exterus', url: searchUrl, options, state, statePath,
        request: {
          method: 'POST',
          headers: {
            Accept: 'application/json', 'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-TOKEN': this.session.csrf,
            Cookie: this.session.cookie
          },
          body: JSON.stringify({
            locale: 'nl', collection: 'producten', category: 21, location: null, application: null,
            mounting: null, lamp_type: null, ip_rating: null, dimming_type: null, keyword: manufacturerSku
          })
        }
      })
      if (!searchResponse.html) return { response: searchResponse, result: null, pageUrl: this.indexUrl }
      let searchResults = []
      try { searchResults = JSON.parse(searchResponse.html) } catch { /* Invalid catalog response. */ }
      for (const searchResult of searchResults.slice(0, 5)) {
        if (!searchResult?.url) continue
        const pageUrl = new URL(searchResult.url, 'https://www.exterus.be/nl/').href
        const pageResponse = await fetchControlled({ brand: 'exterus', url: pageUrl, options, state, statePath })
        const result = pageResponse.html ? parseExterusProductPage(pageResponse.html, sku, pageUrl, searchResult) : null
        if (result) return {
          response: { ...pageResponse, cached: Boolean(searchResponse.cached && pageResponse.cached) }, result, pageUrl
        }
      }
      return { response: searchResponse, result: null, pageUrl: this.indexUrl }
    }
  },
  weverducre: {
    label: 'Wever & Ducré productcatalogus',
    domain: 'www.weverducre.com',
    matches(item) {
      return /^wever\s*&?\s*ducr[eé]$/i.test(String(detectManufacturer(item) || '').trim()) && Boolean(productSkuFor(item))
    },
    url(sku) {
      return `https://www.weverducre.com/en/action/search/detail?q=${encodeURIComponent(sku)}`
    },
    parse: parseWeverDucreProductPage,
    publicUrl: (_item, _result, requestUrl) => requestUrl
  },
  geberit: {
    label: 'Geberit productcatalogus',
    domain: 'catalog.geberit.be',
    matches: (item) =>
      /\bgeberit\b/i.test(`${item.name || ''} ${item.description || ''}`) &&
      knownGeberitPages.has(normalizeSku(item.productNumber)),
    url: (sku) => knownGeberitPages.get(normalizeSku(sku)),
    parse: parseGeberitProductPage,
    publicUrl: (_item, _result, requestUrl) => requestUrl
  },
  viega: {
    label: 'Viega productcatalogus',
    domain: 'www.viega.be',
    matches: (item) =>
      /\bviega\b/i.test(`${item.name || ''} ${item.description || ''}`) &&
      knownViegaPages.has(normalizeSku(item.productNumber)),
    url: (sku) => knownViegaPages.get(normalizeSku(sku)),
    parse: parseViegaProductPage,
    publicUrl: (_item, _result, requestUrl) => requestUrl
  },
  solerpalau: {
    label: 'Soler & Palau productcatalogus',
    domain: 'www.solerpalau.com',
    matches: (item) =>
      /\bsoler\s*(?:&|and)\s*palau\b/i.test(detectManufacturer(item) || '') &&
      knownSolerPalauProducts.has(normalizeSku(productSkuFor(item))),
    url: (sku) => knownSolerPalauProducts.get(normalizeSku(sku))?.pageUrl,
    parse: parseSolerPalauProductPage,
    publicUrl: (_item, _result, requestUrl) => requestUrl
  },
  fischer: {
    label: 'Fischer productcatalogus',
    domain: 'www.fischer.be',
    matches: (item) => /\bfischer\b/i.test(detectManufacturer(item) || '') && knownFischerPages.has(normalizeSku(stripSupplierPrefix(productSkuFor(item), 'FIS'))),
    url: (sku) => knownFischerPages.get(normalizeSku(stripSupplierPrefix(sku, 'FIS'))),
    parse: parseFischerProductPage,
    publicUrl: (_item, _result, requestUrl) => requestUrl
  },
  gree: {
    label: 'Gree productcatalogus',
    domain: 'greeproducts.com',
    matches: (item) => /\bgree\b/i.test(detectManufacturer(item) || '') && knownGreePages.has(normalizeSku(stripSupplierPrefix(productSkuFor(item), 'GRE')).toUpperCase()),
    url: (sku) => knownGreePages.get(normalizeSku(stripSupplierPrefix(sku, 'GRE')).toUpperCase()),
    parse: parseGreeProductPage,
    publicUrl: (_item, _result, requestUrl) => requestUrl
  },
  panasonic: {
    label: 'Panasonic productcatalogus',
    domain: 'www.aircon.panasonic.eu',
    matches: (item) => /\bpanasonic\b/i.test(detectManufacturer(item) || '') && Boolean(productSkuFor(item)),
    url: (sku) => `https://www.aircon.panasonic.eu/BE_fr/model/${encodeURIComponent(panasonicSkuFor(sku).toLowerCase())}/`,
    parse: parsePanasonicProductPage,
    publicUrl: (_item, _result, requestUrl) => requestUrl
  },
  etherma: {
    label: 'Etherma productcatalogus',
    domain: 'www.etherma.com',
    matches: (item) => /\betherma\b/i.test(detectManufacturer(item) || '') && knownEthermaPages.has(normalizeSku(stripSupplierPrefix(productSkuFor(item), 'ETH')).toUpperCase()),
    url: (sku) => knownEthermaPages.get(normalizeSku(stripSupplierPrefix(sku, 'ETH')).toUpperCase()),
    parse: parseEthermaProductPage,
    publicUrl: (_item, _result, requestUrl) => requestUrl
  }
}

const parseArgs = (argv) => {
  const valueAfter = (name) => {
    const arg = argv.find((entry) => entry.startsWith(`${name}=`))
    return arg?.slice(name.length + 1)
  }
  const number = (name, fallback, minimum) => {
    const parsed = Number(valueAfter(name))
    return Number.isFinite(parsed) && parsed >= minimum ? Math.floor(parsed) : fallback
  }
  return {
    catalog: (valueAfter('--catalog') || 'desco').trim().toLowerCase(),
    brands: (valueAfter('--brands') || 'bosch').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean),
    sku: normalizeSku(valueAfter('--sku') || ''),
    max: number('--max', 10, 1),
    delayMs: number('--delay-ms', DEFAULT_DELAY_MS, 1000),
    dailyLimit: number('--daily-limit', DEFAULT_DAILY_LIMIT, 1),
    apply: argv.includes('--apply'),
    publishImages: argv.includes('--publish-images'),
    repairImages: argv.includes('--repair-images'),
    missingImages: argv.includes('--missing-images'),
    cachedOnly: argv.includes('--cached-only'),
    reprocess: argv.includes('--reprocess'),
    resetIcecatCircuit: argv.includes('--reset-icecat-circuit'),
    refresh: argv.includes('--refresh'),
    icecatUsername: process.env.ICECAT_USERNAME || '',
    icecatAppKey: process.env.ICECAT_APP_KEY || ''
  }
}

const readJson = async (path, fallback) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return fallback
  }
}

const writeJsonAtomic = async (path, value) => {
  const temporaryPath = `${path}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, path)
}

const today = () => new Date().toISOString().slice(0, 10)
const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
const cachePathFor = (brand, url) => resolve(CACHE_DIR, brand, `${createHash('sha256').update(url).digest('hex')}.html`)

const requestText = (url, requestOptions = {}, redirectsLeft = 5) => new Promise((resolvePromise, rejectPromise) => {
  const transport = new URL(url).protocol === 'http:' ? http : https
  let settled = false
  const finish = (callback, value) => {
    if (settled) return
    settled = true
    clearTimeout(deadline)
    callback(value)
  }
  const request = transport.request(url, {
    method: requestOptions.method || 'GET',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'KeepitCatalogEnrichment/1.0 (rate-limited product verification)',
      ...requestOptions.headers
    }
  }, (response) => {
    const status = Number(response.statusCode || 0)
    const location = response.headers.location
    if (location && status >= 300 && status < 400) {
      response.resume()
      if (redirectsLeft <= 0) return finish(rejectPromise, new Error(`Te veel redirects voor ${url}`))
      return finish(resolvePromise, requestText(new URL(location, url).href, requestOptions, redirectsLeft - 1))
    }

    const chunks = []
    response.on('data', (chunk) => chunks.push(chunk))
    response.on('error', (error) => finish(rejectPromise, error))
    response.on('end', () => finish(resolvePromise, {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name) => response.headers[String(name).toLowerCase()] || null },
      text: Buffer.concat(chunks).toString('utf8')
    }))
  })
  const deadline = setTimeout(() => request.destroy(new Error(`Totale timeout bij ${url}`)), 30_000)
  request.setTimeout(20_000, () => request.destroy(new Error(`Timeout bij ${url}`)))
  request.on('error', (error) => finish(rejectPromise, error))
  if (requestOptions.body) request.write(requestOptions.body)
  request.end()
})

const fetchControlled = async ({ brand, url, options, state, statePath, request, forceNetwork = false }) => {
  const adapter = adapters[brand]
  const domainState = state.domains[adapter.domain] || { date: today(), requests: 0 }
  if (domainState.date !== today()) Object.assign(domainState, { date: today(), requests: 0, blockedAt: undefined })
  state.domains[adapter.domain] = domainState

  const cachePath = cachePathFor(brand, url)
  if (!options.refresh && !forceNetwork) {
    try {
      return { html: await readFile(cachePath, 'utf8'), cached: true }
    } catch {
      // Cache miss.
    }
  }

  if (options.cachedOnly) return { html: '', status: 0, cached: false, cacheMiss: true }
  if (domainState.blockedAt) throw new Error(`${adapter.domain} circuit breaker staat open sinds ${domainState.blockedAt}`)
  if (domainState.requests >= options.dailyLimit) throw new Error(`${adapter.domain} daglimiet (${options.dailyLimit}) bereikt`)

  const elapsed = Date.now() - Number(domainState.lastRequestAt || 0)
  if (elapsed < options.delayMs) await sleep(options.delayMs - elapsed)

  domainState.lastRequestAt = Date.now()
  domainState.requests += 1
  await writeJsonAtomic(statePath, state)

  let response
  try {
    response = await requestText(url, request)
  } catch (error) {
    return { html: '', status: 0, cached: false, transientError: error?.message || String(error) }
  }

  if (response.status === 403 && brand === 'icecat') {
    domainState.consecutiveRestricted = Number(domainState.consecutiveRestricted || 0) + 1
    if (domainState.consecutiveRestricted < 3) {
      await writeJsonAtomic(statePath, state)
      return { html: '', status: 403, cached: false, restricted: true }
    }
  } else if (response.ok || response.status === 404) {
    domainState.consecutiveRestricted = 0
  }

  if (response.status === 403 || response.status === 429) {
    domainState.blockedAt = new Date().toISOString()
    domainState.blockedStatus = response.status
    domainState.retryAfter = response.headers.get('retry-after') || undefined
    await writeJsonAtomic(statePath, state)
    throw new Error(`${adapter.domain} antwoordde ${response.status}; circuit breaker geopend`)
  }
  if (!response.ok) return { html: '', status: response.status, cached: false }

  const html = response.text
  await mkdir(resolve(CACHE_DIR, brand), { recursive: true })
  await writeFile(cachePath, html, 'utf8')
  return { html, status: response.status, headers: response.headers, cached: false }
}

const uniqueBy = (items, keyFor) => [...new Map(items.map((item) => [keyFor(item), item])).values()]

const mergeEnrichment = (item, result, brand, pageUrl, fetchedAt, publishImages = false, repairImages = false) => {
  const adapter = adapters[brand]
  const source = { provider: adapter.label, pageUrl, productNumber: productSkuFor(item), fetchedAt }
  const manufacturerData = { ...result.technicalData }
  if (result.title) manufacturerData.Productnaam = result.title
  const imageCandidate = result.imageUrl
    ? {
        url: result.imageUrl,
        sourceUrl: pageUrl,
        provider: adapter.label,
        rightsStatus: result.rightsStatus || 'permission-required',
        checkedAt: fetchedAt
      }
    : undefined

  return {
    ...item,
    image:
      publishImages && result.publishableImage !== false && (repairImages || !hasUsableImageValue(item))
        ? result.imageUrl || item.image
        : item.image,
    description: item.description || result.description || undefined,
    manufacturerData,
    dataSources: uniqueBy([...(item.dataSources || []), source], (entry) => `${entry.provider}|${entry.pageUrl}`),
    imageCandidates: imageCandidate
      ? uniqueBy([...(item.imageCandidates || []), imageCandidate], (entry) => entry.url)
      : item.imageCandidates,
    enrichedAt: fetchedAt
  }
}

const usage = () => {
  console.log('Gebruik: npm run enrich:manufacturers -- [--catalog=desco|alelek] [--brands=bosch,icecat,eaton,rittal,ledlines,exterus,weverducre,geberit,viega,solerpalau,fischer,gree,panasonic,etherma] [--sku=MPN] [--max=10] [--delay-ms=5000] [--daily-limit=100] [--apply] [--publish-images] [--repair-images] [--missing-images] [--cached-only] [--reprocess] [--refresh] [--reset-icecat-circuit]')
  console.log('Zonder --apply wordt niets aan catalogus of metadata gewijzigd.')
}

export const runManufacturerEnrichment = async (argv = process.argv.slice(2)) => {
  if (argv.includes('--help') || argv.includes('-h')) return usage()
  const options = parseArgs(argv)
  if (!['desco', 'alelek'].includes(options.catalog)) throw new Error('--catalog moet desco of alelek zijn')
  const catalogPath = resolve(DATABASE_DIR, `${options.catalog}-materials.json`)
  const metadataPath = resolve(DATABASE_DIR, `${options.catalog}-materials.metadata.json`)
  const overridesPath = resolve(DATABASE_DIR, `${options.catalog}-manufacturer-overrides.json`)
  const statePath = resolve(DATABASE_DIR, `manufacturer-enrichment-state-${options.catalog}.json`)
  const serverConfig = await readJson(resolve('server.config.json'), {})
  options.icecatUsername ||= String(serverConfig.icecat?.username || '').trim()
  options.icecatAppKey ||= String(serverConfig.icecat?.appKey || '').trim()
  const unknownBrands = options.brands.filter((brand) => !adapters[brand])
  if (unknownBrands.length) throw new Error(`Nog geen veilige adapter voor: ${unknownBrands.join(', ')}`)
  if (options.brands.includes('icecat') && !options.icecatUsername) {
    throw new Error(
      'Icecat-gebruikersnaam ontbreekt. Vul icecat.username in server.config.json in of stel ICECAT_USERNAME in.'
    )
  }

  await mkdir(DATABASE_DIR, { recursive: true })
  const catalog = await readJson(catalogPath, { items: [] })
  const metadata = await readJson(metadataPath, { source: `${options.catalog}-metadata`, items: [] })
  const state = await readJson(statePath, { version: 1, domains: {}, products: {} })
  const overrides = await readJson(overridesPath, { version: 1, updatedAt: '', items: {} })
  const cachedProductImages = options.missingImages
    ? new Set(await readdir(PRODUCT_IMAGE_DIR).catch(() => []))
    : new Set()
  if (options.resetIcecatCircuit && state.domains?.['live.icecat.biz']?.blockedStatus === 403) {
    delete state.domains['live.icecat.biz'].blockedAt
    delete state.domains['live.icecat.biz'].blockedStatus
    delete state.domains['live.icecat.biz'].retryAfter
    state.domains['live.icecat.biz'].consecutiveRestricted = 0
    await writeJsonAtomic(statePath, state)
  }
  if (!Array.isArray(catalog.items) || catalog.items.length === 0) {
    throw new Error(`${options.catalog}-catalogus is leeg; voer eerst sync ${options.catalog} uit.`)
  }

  const itemKey = (item) => String(item.articleNumber || item.productNumber || item.name || '')
  const metadataByArticle = new Map((metadata.items || []).map((item) => [itemKey(item), item]))
  let attempted = 0
  let matched = 0
  let cacheHits = 0
  let sanitized = 0
  let eligibleCandidates = 0
  let alreadyChecked = 0

  if (options.apply && options.repairImages) {
    for (const item of catalog.items) {
      if (item.image && !hasUsableImageValue(item)) {
        delete item.image
        sanitized += 1
      }
    }
  }

  for (const brand of options.brands) {
    const adapter = adapters[brand]
    if (adapter.indexUrl && adapter.prepare) {
      const indexAdapter = { ...adapter, domain: adapter.indexDomain || adapter.domain }
      const originalAdapter = adapters[brand]
      adapters[brand] = indexAdapter
      try {
        const indexResponse = await fetchControlled({
          brand, url: adapter.indexUrl, options, state, statePath, forceNetwork: Boolean(adapter.session)
        })
        if (!indexResponse.html) throw new Error(`${adapter.label}: officiële productindex niet beschikbaar`)
        originalAdapter.prepare(indexResponse.html, indexResponse)
        if (indexResponse.cached) cacheHits += 1
      } finally {
        adapters[brand] = originalAdapter
      }
    }
    const hasCompleteLocalImage = (item) => Boolean(item.image) && ['card', 'detail'].every((variant) =>
      cachedProductImages.has(productImageCacheFile(item.image, variant)))
    const matchingItems = catalog.items.filter(
      (item) =>
        adapter.matches(item) &&
        (!options.sku || normalizeSku(productSkuFor(item)) === options.sku)
    )
    const candidates = matchingItems.filter((item) => !options.missingImages || !hasCompleteLocalImage(item))
    const skipKnown = !options.refresh && !options.reprocess && !options.repairImages
    const checkedForBrand = skipKnown
      ? candidates.filter((item) => state.products[`${options.catalog}:${brand}:${normalizeSku(productSkuFor(item))}`]?.status).length
      : 0
    const newForBrand = candidates.length - checkedForBrand
    eligibleCandidates += newForBrand
    alreadyChecked += checkedForBrand
    console.log(
      `${adapter.label}: ${matchingItems.length} ondersteund, ` +
      `${matchingItems.length - candidates.length} lokaal compleet, ${checkedForBrand} al gecontroleerd, ${newForBrand} nieuw.`
    )
    for (const catalogItem of candidates) {
      if (attempted >= options.max) break
      const sku = productSkuFor(catalogItem)
      const stateKey = `${options.catalog}:${brand}:${normalizeSku(sku)}`
      if (!options.refresh && !options.reprocess && !options.repairImages && state.products[stateKey]?.status) continue

      // In cache-only mode, do not let thousands of uncached catalog items consume --max.
      // This makes browser-fed adapters deterministic: --max limits actual cached pages.
      if (options.cachedOnly) {
        const cachedRequestUrl = adapter.url(sku, catalogItem, options)
        try {
          await access(cachePathFor(brand, cachedRequestUrl))
        } catch {
          continue
        }
      }

      attempted += 1
      const lookup = adapter.lookup ? await adapter.lookup(sku, catalogItem, options, state, statePath) : null
      const requestUrl = lookup?.pageUrl || adapter.url(sku, catalogItem, options)
      const response = lookup?.response || await fetchControlled({ brand, url: requestUrl, options, state, statePath })
      if (response.cacheMiss) {
        console.log(`- ${adapter.label} ${sku}: niet in lokale cache`)
        continue
      }
      if (response.transientError) {
        console.warn(`! ${adapter.label} ${sku}: tijdelijke netwerkfout (${response.transientError}); blijft beschikbaar voor een volgende run`)
        continue
      }
      if (response.cached) cacheHits += 1
      const result = lookup ? lookup.result : response.html ? adapter.parse(response.html, sku, requestUrl, catalogItem) : null
      const fetchedAt = new Date().toISOString()
      const pageUrl = adapter.publicUrl
        ? result ? adapter.publicUrl(catalogItem, result, requestUrl) : adapter.publicUrl(catalogItem, {}, requestUrl)
        : requestUrl
      state.products[stateKey] = {
        brand,
        sku,
        pageUrl,
        checkedAt: fetchedAt,
        status: result
          ? 'matched'
          : response.restricted
            ? 'restricted'
            : response.status === 404
              ? 'not-found'
              : 'unverified',
        httpStatus: response.status || 200
      }

      if (result) {
        matched += 1
        const catalogIndex = catalog.items.indexOf(catalogItem)
        catalog.items[catalogIndex] = mergeEnrichment(
          catalogItem,
          result,
          brand,
          pageUrl,
          fetchedAt,
          options.publishImages,
          options.repairImages || options.missingImages
        )
        const enrichedCatalogItem = catalog.items[catalogIndex]
        overrides.items[itemKey(catalogItem)] = {
          image: enrichedCatalogItem.image,
          manufacturerData: enrichedCatalogItem.manufacturerData,
          dataSources: enrichedCatalogItem.dataSources,
          imageCandidates: enrichedCatalogItem.imageCandidates,
          enrichedAt: enrichedCatalogItem.enrichedAt
        }
        const existingMetadata = metadataByArticle.get(itemKey(catalogItem)) || catalogItem
        const enrichedMetadata = mergeEnrichment(
          existingMetadata,
          result,
          brand,
          pageUrl,
          fetchedAt,
          options.publishImages,
          options.repairImages || options.missingImages
        )
        metadataByArticle.set(itemKey(catalogItem), enrichedMetadata)
        console.log(`✓ ${adapter.label} ${sku}: exacte match${response.cached ? ' (cache)' : ''}`)
      } else {
        console.log(
          response.restricted
            ? `- ${adapter.label} ${sku}: merktoegang vereist (403)`
            : `- ${adapter.label} ${sku}: geen exacte match (${response.status || 200})`
        )
      }
      await writeJsonAtomic(statePath, state)
    }
  }

  if (options.apply && (matched > 0 || sanitized > 0)) {
    const timestamp = new Date().toISOString()
    const backupDirectory = resolve(DATABASE_DIR, 'backups', `manufacturer-enrichment-${timestamp.replaceAll(':', '-')}`)
    await mkdir(backupDirectory, { recursive: true })
    await copyFile(catalogPath, resolve(backupDirectory, `${options.catalog}-materials.json`))
    try {
      await copyFile(metadataPath, resolve(backupDirectory, `${options.catalog}-materials.metadata.json`))
    } catch {
      // Metadata may not exist on a fresh installation.
    }
    catalog.updatedAt = timestamp
    metadata.updatedAt = timestamp
    overrides.updatedAt = timestamp
    metadata.items = catalog.items.map((item) => metadataByArticle.get(itemKey(item)) || item)
    await writeJsonAtomic(catalogPath, catalog)
    await writeJsonAtomic(metadataPath, metadata)
    await writeJsonAtomic(overridesPath, overrides)
  }

  if (attempted === 0 && eligibleCandidates === 0) {
    console.log(`Geen nieuwe kandidaten: ${alreadyChecked} onvolledige producten zijn eerder al gecontroleerd.`)
  }
  console.log(`Klaar: ${attempted} gecontroleerd, ${matched} exacte matches, ${sanitized} ongeldige beeldwaarden verwijderd, ${cacheHits} uit cache, modus=${options.apply ? 'toegepast' : 'dry-run'}.`)
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  runManufacturerEnrichment().catch((error) => {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
