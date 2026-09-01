import { rm, rename } from 'fs/promises'
import { resolve } from 'path'
import { DatabaseSync } from 'node:sqlite'
import type { MaterialLine } from '../../types/index.js'
import { normalizeShopSearchText } from './shop-search.js'

export type ShopSearchSource = 'desco' | 'alelek'

type CatalogInput = {
  source: ShopSearchSource
  updatedAt: string
  items: MaterialLine[]
}

type SearchFilters = {
  source: string
  category: string
  price: string
  favoriteNames?: string[]
}

export type ShopSearchIndexMatch = {
  source: ShopSearchSource
  itemIndex: number
  rank: number
}

type SearchResult = {
  matches: ShopSearchIndexMatch[]
  total: number
}

const indexPath = resolve('.database', 'shop-search.sqlite')
const temporaryIndexPath = `${indexPath}.tmp`
let database: DatabaseSync | undefined
let databaseSignature = ''

const getCategory = (item: MaterialLine): string => {
  const text = `${item.name} ${item.description || ''}`.toLowerCase()
  if (/douche|bad\b|toilet|\bwc\b|spoel/.test(text)) return 'Sanitair'
  if (/kraan|mengkraan|tapkraan/.test(text)) return 'Kranen'
  if (/ketel|brander|boiler|radiator|verwarm|thermostaat/.test(text)) return 'Verwarming'
  if (/pomp|circulat/.test(text)) return 'Pompen'
  if (/buis|bocht|mof\b|koppeling|fitting|leiding/.test(text)) return 'Leidingen & fittingen'
  if (/tang|zaag|boor|sleutel|gereedschap/.test(text)) return 'Gereedschap'
  if (/ventiel|klep|afsluiter/.test(text)) return 'Kleppen & ventielen'
  return 'Installatiemateriaal'
}

const getSignature = (catalogs: CatalogInput[]): string => {
  // Catalog timestamps are updated whenever a sync or restore changes their
  // contents. Keep this signature O(number of catalogs): hashing hundreds of
  // thousands of complete records made every search request take seconds.
  return `v4:${catalogs.map(({ source, updatedAt, items }) => `${source}:${updatedAt}:${items.length}`).join('|')}`
}

const getShortSearchTokens = (item: MaterialLine): string => {
  const tokens = new Set<string>()
  for (const value of [item.name, item.articleNumber, item.productNumber]) {
    for (const word of normalizeShopSearchText(value).split(' ')) {
      for (let index = 0; index < word.length - 1; index += 1) {
        tokens.add(`zz${word.slice(index, index + 2)}zz`)
      }
    }
  }
  return [...tokens].join(' ')
}

const openCurrentIndex = (signature: string): DatabaseSync | undefined => {
  try {
    const candidate = new DatabaseSync(indexPath)
    const metadata = candidate.prepare("SELECT value FROM metadata WHERE key = 'signature'").get() as
      | { value?: unknown }
      | undefined
    if (metadata?.value === signature) return candidate
    candidate.close()
  } catch {
    return undefined
  }
}

const buildIndex = async (catalogs: CatalogInput[], signature: string): Promise<DatabaseSync> => {
  await rm(temporaryIndexPath, { force: true })
  const nextDatabase = new DatabaseSync(temporaryIndexPath)
  nextDatabase.exec(`
    PRAGMA journal_mode = OFF;
    PRAGMA synchronous = OFF;
    CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE VIRTUAL TABLE products USING fts5(
      source UNINDEXED,
      item_index UNINDEXED,
      price UNINDEXED,
      category UNINDEXED,
      name,
      article_number,
      product_number,
      description,
      metadata,
      short_tokens,
      tokenize = 'trigram'
    );
  `)

  const insert = nextDatabase.prepare('INSERT INTO products VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
  nextDatabase.exec('BEGIN')
  try {
    for (const catalog of catalogs) {
      catalog.items.forEach((item, itemIndex) => {
        insert.run(
          catalog.source,
          itemIndex,
          item.unitPrice || 0,
          getCategory(item),
          normalizeShopSearchText(item.name),
          normalizeShopSearchText(item.articleNumber),
          normalizeShopSearchText(item.productNumber),
          normalizeShopSearchText(item.description),
          normalizeShopSearchText(JSON.stringify([item.manufacturerData || {}, item.technicalData || {}])),
          getShortSearchTokens(item)
        )
      })
    }
    nextDatabase.prepare('INSERT INTO metadata VALUES (?, ?)').run('signature', signature)
    nextDatabase.exec('COMMIT')
  } catch (error) {
    nextDatabase.exec('ROLLBACK')
    nextDatabase.close()
    await rm(temporaryIndexPath, { force: true })
    throw error
  }

  nextDatabase.close()
  await rm(indexPath, { force: true })
  await rename(temporaryIndexPath, indexPath)
  return new DatabaseSync(indexPath)
}

const getDatabase = async (catalogs: CatalogInput[]): Promise<DatabaseSync> => {
  const signature = getSignature(catalogs)
  if (database && databaseSignature === signature) return database

  database?.close()
  database = openCurrentIndex(signature) || (await buildIndex(catalogs, signature))
  databaseSignature = signature
  return database
}

export const warmShopSearchIndex = async (catalogs: CatalogInput[]): Promise<void> => {
  await getDatabase(catalogs)
}

const getFilterSql = (filters: SearchFilters): { clauses: string[]; values: Array<string | number> } => {
  const clauses: string[] = []
  const values: Array<string | number> = []

  if (filters.source !== 'all') {
    clauses.push('source = ?')
    values.push(filters.source)
  }
  if (filters.category !== 'all') {
    clauses.push('category = ?')
    values.push(filters.category)
  }
  if (filters.price === 'under-25') clauses.push('price < 25')
  if (filters.price === '25-100') clauses.push('price >= 25 AND price <= 100')
  if (filters.price === '100-plus') clauses.push('price > 100')
  if (filters.favoriteNames) {
    if (filters.favoriteNames.length === 0) {
      clauses.push('0 = 1')
    } else {
      clauses.push(`name IN (${filters.favoriteNames.map(() => '?').join(', ')})`)
      values.push(...filters.favoriteNames)
    }
  }

  return { clauses, values }
}

export const searchShopIndex = async (
  catalogs: CatalogInput[],
  query: string,
  filters: SearchFilters,
  limit?: number,
  offset = 0,
  includeTotal = true
): Promise<SearchResult> => {
  const normalizedQuery = normalizeShopSearchText(query)
  if (normalizedQuery.length < 2) return { matches: [], total: 0 }

  const terms = normalizedQuery.split(/\s+/).filter(Boolean)
  const matchQuery = terms
    .map((term) =>
      term.length >= 3 ? `"${term.replaceAll('"', '""')}"` : `short_tokens : "zz${term.replaceAll('"', '""')}zz"`
    )
    .join(' AND ')

  const currentDatabase = await getDatabase(catalogs)
  const { clauses, values } = getFilterSql(filters)
  const where = ['products MATCH ?', ...clauses].join(' AND ')
  const queryValues = [matchQuery, ...values]
  const total = includeTotal
    ? Number(
        (
          currentDatabase.prepare(`SELECT count(*) AS total FROM products WHERE ${where}`).get(...queryValues) as {
            total: number | bigint
          }
        ).total
      )
    : 0
  const pageSql = `
    SELECT source, item_index, bm25(products, 0, 0, 0, 0, 8, 5, 4, 1, 2, 3) AS rank
    FROM products
    WHERE ${where}
    ORDER BY rank
    ${limit === undefined ? '' : 'LIMIT ? OFFSET ?'}
  `
  const pageValues = limit === undefined ? queryValues : [...queryValues, limit, offset]
  const rows = currentDatabase.prepare(pageSql).all(...pageValues) as Array<{
    source: ShopSearchSource
    item_index: number | bigint
    rank: number
  }>

  return {
    total,
    matches: rows.map((row) => ({
      source: row.source,
      itemIndex: Number(row.item_index),
      rank: row.rank
    }))
  }
}
