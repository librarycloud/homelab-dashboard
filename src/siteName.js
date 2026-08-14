export const DEFAULT_SITE_NAME = 'HomeLab'

export function normalizeSiteName(value) {
  const name = String(value || '').trim().replace(/\s+/g, ' ')
  return name.slice(0, 60) || DEFAULT_SITE_NAME
}

export function readSiteName() {
  return normalizeSiteName(localStorage.getItem('homelab-site-name'))
}

export function saveSiteName(value) {
  const name = normalizeSiteName(value)
  localStorage.setItem('homelab-site-name', name)
  document.title = name
  window.dispatchEvent(new CustomEvent('homelab-site-name-changed', { detail: name }))
  return name
}

export function applySiteName(value = readSiteName()) {
  const name = normalizeSiteName(value)
  document.title = name
  return name
}
