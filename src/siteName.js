export const DEFAULT_SITE_NAME = 'HomeLab'
export const DEFAULT_SITE_SUBTITLE = 'CONTROL CENTER'

export function normalizeSiteName(value) {
  const name = String(value || '').trim().replace(/\s+/g, ' ')
  return name.slice(0, 60) || DEFAULT_SITE_NAME
}

export function normalizeSiteSubtitle(value) {
  const subtitle = String(value || '').trim().replace(/\s+/g, ' ')
  return subtitle.slice(0, 60) || DEFAULT_SITE_SUBTITLE
}

export function applySiteName(value = DEFAULT_SITE_NAME) {
  const name = normalizeSiteName(value)
  document.title = name
  return name
}
