import type { MaterialLine, ProductDataSource, ProductImageCandidate } from '../../types/index.js'

export type DescoMaterialMetadata = {
  articleNumber?: string
  productNumber?: string
  name?: string
  description?: string
  image?: string
  technicalData?: Record<string, string>
  manufacturerData?: Record<string, string>
  dataSources?: ProductDataSource[]
  imageCandidates?: ProductImageCandidate[]
  enrichedAt?: string
}

const normalizeString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const fallbackDescriptionPhrases = [
  'geen beschrijving',
  'omschrijving volgt',
  'beschrijving niet beschikbaar',
  'n/a',
  'onbekend',
  'lorem ipsum'
]

const hasValidDescription = (value: unknown): value is string => {
  const description = normalizeString(value)
  if (description.length < 10) return false
  const normalized = description.toLowerCase()
  return !fallbackDescriptionPhrases.some((phrase) => normalized.includes(phrase))
}

const hasValidImage = (value: unknown): value is string => {
  const image = normalizeString(value)
  return (
    image.startsWith('http://') ||
    image.startsWith('https://') ||
    image.startsWith('/media/') ||
    image.startsWith('/cache/desco/')
  )
}

const hasTechnicalData = (value: unknown): value is Record<string, string> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0)

const keysFor = (item: Pick<MaterialLine, 'name' | 'articleNumber' | 'productNumber'> | DescoMaterialMetadata) =>
  [item.articleNumber, item.productNumber, item.name]
    .map((value) => normalizeString(value).toLowerCase())
    .filter(Boolean)

/**
 * Reconciles a fresh price-list export with previously collected metadata.
 * Desco's articles.xlsx has no image or description columns, so an Excel sync
 * must never replace cached metadata with empty values.
 */
export const mergeDescoMetadataItems = (
  materials: MaterialLine[],
  existingItems: DescoMaterialMetadata[],
  now = new Date().toISOString()
): DescoMaterialMetadata[] => {
  const existingByKey = new Map<string, DescoMaterialMetadata>()

  for (const existing of existingItems) {
    for (const key of keysFor(existing)) existingByKey.set(key, existing)
  }

  return materials.map((material) => {
    const existing = keysFor(material)
      .map((key) => existingByKey.get(key))
      .find(Boolean)

    const description = hasValidDescription(material.description)
      ? normalizeString(material.description)
      : hasValidDescription(existing?.description)
        ? normalizeString(existing?.description)
        : undefined
    const image = hasValidImage(material.image)
      ? normalizeString(material.image)
      : hasValidImage(existing?.image)
        ? normalizeString(existing?.image)
        : undefined
    const technicalData = hasTechnicalData(material.technicalData)
      ? material.technicalData
      : hasTechnicalData(existing?.technicalData)
        ? existing.technicalData
        : undefined

    return {
      articleNumber: material.articleNumber || existing?.articleNumber,
      productNumber: material.productNumber || existing?.productNumber,
      name: material.name || existing?.name,
      description,
      image,
      technicalData,
      manufacturerData: material.manufacturerData || existing?.manufacturerData,
      dataSources: material.dataSources?.length ? material.dataSources : existing?.dataSources,
      imageCandidates: material.imageCandidates?.length ? material.imageCandidates : existing?.imageCandidates,
      enrichedAt: existing?.enrichedAt || (description || image || technicalData ? now : undefined)
    }
  })
}
