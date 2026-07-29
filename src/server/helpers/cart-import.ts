import type { MaterialLine, ShopProduct } from '../../types/index.js'

export type CartImportSource = 'desco' | 'alelek'

const normalize = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '')

const splitRow = (line: string, delimiter: string): string[] => {
  const cells: string[] = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '"' && line[index + 1] === '"' && quoted) {
      cell += '"'
      index += 1
    } else if (character === '"') {
      quoted = !quoted
    } else if (character === delimiter && !quoted) {
      cells.push(cell.trim())
      cell = ''
    } else {
      cell += character
    }
  }
  cells.push(cell.trim())
  return cells
}

const detectDelimiter = (line: string): string => {
  const delimiters = ['\t', ';', ',']
  return delimiters.sort((left, right) => line.split(right).length - line.split(left).length)[0]
}

const headerIndex = (headers: string[], patterns: RegExp[]): number =>
  headers.findIndex((header) => patterns.some((pattern) => pattern.test(normalize(header))))

export const importCartText = (
  text: string,
  source: CartImportSource,
  products: ShopProduct[]
): { materials: MaterialLine[]; unmatched: string[] } => {
  const sourceProducts = products.filter((product) => product.source === source)
  const byArticle = new Map(
    sourceProducts.filter((product) => product.articleNumber).map((product) => [normalize(product.articleNumber!), product])
  )
  const byProduct = new Map(
    sourceProducts.filter((product) => product.productNumber).map((product) => [normalize(product.productNumber!), product])
  )
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (!lines.length) return { materials: [], unmatched: [] }

  const delimiter = detectDelimiter(lines[0])
  const possibleHeaders = splitRow(lines[0], delimiter)
  const articleIndex = headerIndex(possibleHeaders, [/artikel/, /article/, /^artnr$/, /^sku$/])
  const productIndex = headerIndex(possibleHeaders, [/product/, /productnummer/, /fabrikantnummer/])
  const nameIndex = headerIndex(possibleHeaders, [/naam/, /name/, /omschrijving/, /description/])
  const quantityIndex = headerIndex(possibleHeaders, [/aantal/, /quantity/, /^qty$/])
  const hasHeader = [articleIndex, productIndex, nameIndex, quantityIndex].some((index) => index >= 0)
  const imported = new Map<string, MaterialLine>()
  const unmatched: string[] = []

  for (const line of hasHeader ? lines.slice(1) : lines) {
    const cells = splitRow(line, delimiter)
    const candidates = [
      articleIndex >= 0 ? cells[articleIndex] : '',
      productIndex >= 0 ? cells[productIndex] : '',
      ...cells
    ].filter(Boolean)
    let product: ShopProduct | undefined

    for (const candidate of candidates) {
      const key = normalize(candidate)
      product = byArticle.get(key) || byProduct.get(key)
      if (product) break
    }

    if (!product && nameIndex >= 0 && cells[nameIndex]) {
      const name = normalize(cells[nameIndex])
      product = sourceProducts.find((item) => {
        const productName = normalize(item.name)
        return productName === name || (name.length >= 8 && productName.includes(name))
      })
    }

    if (!product) {
      const normalizedLine = normalize(line)
      product = sourceProducts.find((item) => {
        const article = item.articleNumber ? normalize(item.articleNumber) : ''
        const productNumber = item.productNumber ? normalize(item.productNumber) : ''
        return Boolean((article && normalizedLine.includes(article)) || (productNumber && normalizedLine.includes(productNumber)))
      })
    }

    if (!product) {
      unmatched.push(line)
      continue
    }

    const quantityText = quantityIndex >= 0 ? cells[quantityIndex] : line.match(/(?:aantal|qty|quantity)\s*[:x]?\s*(\d+(?:[.,]\d+)?)/i)?.[1]
    const quantity = Number(String(quantityText || '1').replace(',', '.'))
    const key = product.id
    const existing = imported.get(key)
    imported.set(key, {
      name: product.name,
      quantity: (existing?.quantity || 0) + (Number.isFinite(quantity) && quantity > 0 ? quantity : 1),
      unit: product.unit,
      unitPrice: product.price,
      articleNumber: product.articleNumber,
      productNumber: product.productNumber,
      packagingQuantity: product.packagingQuantity,
      description: product.description,
      image: product.image,
      technicalData: product.technicalData
    })
  }

  return { materials: [...imported.values()], unmatched }
}
