import { applySiteName, normalizeSiteName, normalizeSiteSubtitle } from './siteName'
import { applyPrimaryColor, normalizePrimary } from './theme'

export const DEFAULT_SETTINGS = Object.freeze({
  siteName: 'HomeLab',
  siteSubtitle: 'CONTROL CENTER',
  primaryColor: '#42d3b2',
  checking: true,
  checkInterval: '30',
  sessionTtlHours: 24,
  notifications: { error: true, update: true, docker: false },
  categories: ['监控', '存储', '媒体', '开发', '网络', '安全']
})

export function normalizeSettings(value = {}) {
  const notifications = value.notifications && typeof value.notifications === 'object' ? value.notifications : {}
  const categories = Array.isArray(value.categories)
    ? [...new Set(value.categories.map((item) => String(item || '').trim()).filter(Boolean))]
    : [...DEFAULT_SETTINGS.categories]
  return {
    siteName: normalizeSiteName(value.siteName),
    siteSubtitle: normalizeSiteSubtitle(value.siteSubtitle),
    primaryColor: normalizePrimary(value.primaryColor),
    checking: typeof value.checking === 'boolean' ? value.checking : DEFAULT_SETTINGS.checking,
    checkInterval: ['15', '30', '60'].includes(String(value.checkInterval)) ? String(value.checkInterval) : DEFAULT_SETTINGS.checkInterval,
    sessionTtlHours: [1, 8, 24, 168, 720].includes(Number(value.sessionTtlHours)) ? Number(value.sessionTtlHours) : DEFAULT_SETTINGS.sessionTtlHours,
    notifications: {
      error: typeof notifications.error === 'boolean' ? notifications.error : DEFAULT_SETTINGS.notifications.error,
      update: typeof notifications.update === 'boolean' ? notifications.update : DEFAULT_SETTINGS.notifications.update,
      docker: typeof notifications.docker === 'boolean' ? notifications.docker : DEFAULT_SETTINGS.notifications.docker
    },
    categories
  }
}

export function applySettings(value) {
  const settings = normalizeSettings(value)
  applySiteName(settings.siteName)
  applyPrimaryColor(settings.primaryColor)
  return settings
}
