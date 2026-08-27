export const repairProductImageUrl = (imageUrl: string): string => {
  let value = String(imageUrl).split('|')[0].trim()
  const googleDriveId = value.match(/drive\.google\.com\/file\/d\/([^/]+)/i)?.[1] ||
    value.match(/drive\.google\.com\/uc\?[^#]*\bid=([^&#]+)/i)?.[1]
  if (googleDriveId) {
    return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(googleDriveId)}&export=download&confirm=t`
  }
  if (!/^https?:\/\//i.test(value) && /^[a-z0-9.,-]+\.[a-z,]{2,}\//i.test(value)) value = `https://${value}`
  if (!/^https?:\/\//i.test(value)) return value

  try {
    const parsed = new URL(value)
    if (parsed.hostname.includes(',')) parsed.hostname = parsed.hostname.replaceAll(',', '.')
    parsed.pathname = parsed.pathname.replace(/,(jpe?g|png|webp|gif)$/i, '.$1')
    return parsed.href
  } catch {
    return value
  }
}
