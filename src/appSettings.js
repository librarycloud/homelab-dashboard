import { applySiteName, normalizeSiteName, normalizeSiteSubtitle } from './siteName'
import { applyPrimaryColor, normalizePrimary } from './theme'

export const DEFAULT_SETTINGS = Object.freeze({
  siteName: 'HomeLab',
  siteSubtitle: 'CONTROL CENTER',
  primaryColor: '#42d3b2',
  checking: true,
  checkInterval: 30,
  versionChecking: true,
  versionCheckInterval: 1,
  sessionTtlHours: 24,
  notifications: { error: true, update: true, docker: false },
  telegram: {
    enabled: false,
    botToken: '',
    chatId: '',
    notifyReminders: true,
    notifyDomains: true,
    notifyServices: false,
    remindIntervalDays: 1
  },
  categories: ['监控', '存储', '媒体', '开发', '网络', '安全']
})

export function normalizeSettings(value = {}) {
  const notifications = value.notifications && typeof value.notifications === 'object' ? value.notifications : {}
  const telegram = value.telegram && typeof value.telegram === 'object' ? value.telegram : {}
  const categories = Array.isArray(value.categories)
    ? [...new Set(value.categories.map((item) => String(item || '').trim()).filter(Boolean))]
    : [...DEFAULT_SETTINGS.categories]
  return {
    siteName: normalizeSiteName(value.siteName),
    siteSubtitle: normalizeSiteSubtitle(value.siteSubtitle),
    primaryColor: normalizePrimary(value.primaryColor),
    checking: typeof value.checking === 'boolean' ? value.checking : DEFAULT_SETTINGS.checking,
    checkInterval: Number.isInteger(Number(value.checkInterval)) && Number(value.checkInterval) >= 1 && Number(value.checkInterval) <= 1440 ? Number(value.checkInterval) : DEFAULT_SETTINGS.checkInterval,
    versionChecking: typeof value.versionChecking === 'boolean' ? value.versionChecking : DEFAULT_SETTINGS.versionChecking,
    versionCheckInterval: Number.isInteger(Number(value.versionCheckInterval)) && Number(value.versionCheckInterval) >= 1 && Number(value.versionCheckInterval) <= 168 ? Number(value.versionCheckInterval) : DEFAULT_SETTINGS.versionCheckInterval,
    sessionTtlHours: Number.isInteger(Number(value.sessionTtlHours)) && Number(value.sessionTtlHours) >= 1 && Number(value.sessionTtlHours) <= 720 ? Number(value.sessionTtlHours) : DEFAULT_SETTINGS.sessionTtlHours,
    notifications: {
      error: typeof notifications.error === 'boolean' ? notifications.error : DEFAULT_SETTINGS.notifications.error,
      update: typeof notifications.update === 'boolean' ? notifications.update : DEFAULT_SETTINGS.notifications.update,
      docker: typeof notifications.docker === 'boolean' ? notifications.docker : DEFAULT_SETTINGS.notifications.docker
    },
    telegram: {
      enabled: typeof telegram.enabled === 'boolean' ? telegram.enabled : DEFAULT_SETTINGS.telegram.enabled,
      botToken: typeof telegram.botToken === 'string' ? telegram.botToken.trim() : DEFAULT_SETTINGS.telegram.botToken,
      chatId: typeof telegram.chatId === 'string' || typeof telegram.chatId === 'number' ? String(telegram.chatId).trim() : DEFAULT_SETTINGS.telegram.chatId,
      notifyReminders: typeof telegram.notifyReminders === 'boolean' ? telegram.notifyReminders : DEFAULT_SETTINGS.telegram.notifyReminders,
      notifyDomains: typeof telegram.notifyDomains === 'boolean' ? telegram.notifyDomains : DEFAULT_SETTINGS.telegram.notifyDomains,
      notifyServices: typeof telegram.notifyServices === 'boolean' ? telegram.notifyServices : DEFAULT_SETTINGS.telegram.notifyServices,
      remindIntervalDays: [1, 2, 3, 7, 14, 30].includes(Number(telegram.remindIntervalDays)) ? Number(telegram.remindIntervalDays) : DEFAULT_SETTINGS.telegram.remindIntervalDays
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
