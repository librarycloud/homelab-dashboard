const STORAGE_KEY = 'homelab-service-categories'

export const defaultServiceCategories = ['监控', '存储', '媒体', '开发', '网络', '安全']

export function readServiceCategories() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (Array.isArray(saved)) {
      const categories = saved.map((item) => String(item).trim()).filter(Boolean)
      if (categories.length) return [...new Set(categories)]
    }
  } catch {}
  return [...defaultServiceCategories]
}

export function writeServiceCategories(categories) {
  const normalized = [...new Set(categories.map((item) => String(item).trim()).filter(Boolean))]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  return normalized
}
