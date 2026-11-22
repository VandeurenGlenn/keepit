export function invoiceAttachmentPath(reference) {
  if (typeof reference !== 'string') return undefined
  const portable = reference.replaceAll('\\', '/')
  const match = portable.match(/^(\d{4})\/images\/([^/]+)$/)
    ?? portable.match(/(?:^|\/)invoices\/(\d{4})\/images\/([^/]+)$/)
  if (!match) return undefined
  const [, year, filename] = match
  if (filename === '.' || filename === '..' || /[:\x00-\x1f\x7f]/u.test(filename)) return undefined
  return { year, filename }
}
