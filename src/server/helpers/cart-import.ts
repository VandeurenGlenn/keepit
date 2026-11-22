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
  return delimiters.sort((left, right) => splitRow(line, right).length - splitRow(line, left).length)[0]
}

const headerIndex = (headers: string[], patterns: RegExp[]): number =>
  headers.findIndex((header) => patterns.some((pattern) => pattern.test(normalize(header))))

function uniqueIndex(products: ShopProduct[], field: 'articleNumber' | 'productNumber' | 'name') {
  const index = new Map<string, ShopProduct | null>()
  for (const product of products) {
    const key = normalize(product[field] || '')
    if (!key) continue
    if (!index.has(key)) index.set(key, product)
    else if (index.get(key)?.id !== product.id) index.set(key, null)
  }
  return index
}

export const importCartText = (
  text: string,
  source: CartImportSource,
  products: ShopProduct[]
): { materials: MaterialLine[]; unmatched: string[] } => {
  const sourceProducts = products.filter((product) => product.source === source)
  const byArticle = uniqueIndex(sourceProducts, 'articleNumber')
  const byProduct = uniqueIndex(sourceProducts, 'productNumber')
  const byName = uniqueIndex(sourceProducts, 'name')
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (!lines.length) return { materials: [], unmatched: [] }

  const delimiter = detectDelimiter(lines[0])
  const possibleHeaders = splitRow(lines[0], delimiter)
  const articleIndex = headerIndex(possibleHeaders, [/^(artikel(?:nummer|nr|code)?|artnr|article(?:number|no|code)?|sku)$/])
  const productIndex = headerIndex(possibleHeaders, [/^(product(?:nummer|nr|code|number)|fabrikantnummer|mpn)$/])
  const nameIndex = headerIndex(possibleHeaders, [/^(productnaam|naam|name|omschrijving|description|productdescription|artikelomschrijving)$/])
  const quantityIndex = headerIndex(possibleHeaders, [/^(aantal|quantity|qty)$/])
  const hasHeader = [articleIndex, productIndex, nameIndex, quantityIndex].some((index) => index >= 0)
  const imported = new Map<string, MaterialLine>()
  const unmatched: string[] = []

  for (const line of hasHeader ? lines.slice(1) : lines) {
    const cells = splitRow(line, delimiter)
    let product: ShopProduct | null | undefined
    if (hasHeader) {
      const article = normalize(cells[articleIndex] || '')
      const productNumber = normalize(cells[productIndex] || '')
      if (article) {
        product = byArticle.get(article)
        if (product && productNumber && normalize(product.productNumber || '') !== productNumber) product = undefined
      } else if (productNumber) {
        product = byProduct.get(productNumber)
      } else {
        product = byName.get(normalize(cells[nameIndex] || ''))
      }
    } else {
      const first = cells[0].split(/\s+(?:aantal|qty|quantity)\b/i)[0]
      const key = normalize(first)
      const article = byArticle.get(key)
      const numbered = byProduct.get(key)
      if (article !== null && numbered !== null && !(article && numbered && article.id !== numbered.id)) {
        product = article || numbered || byName.get(key)
      }
    }

    if (!product) {
      unmatched.push(line)
      continue
    }

    const quantityText = quantityIndex >= 0 ? cells[quantityIndex] : line.match(/(?:aantal|qty|quantity)\s*[:x]?\s*(\d+(?:[.,]\d+)?)/i)?.[1]
    const quantity = Number(String(quantityText || '1').replace(',', '.'))
    if (!Number.isFinite(quantity) || quantity <= 0) {
      unmatched.push(line)
      continue
    }
    const key = product.id
    const existing = imported.get(key)
    imported.set(key, {
      name: product.name,
      quantity: (existing?.quantity || 0) + quantity,
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
