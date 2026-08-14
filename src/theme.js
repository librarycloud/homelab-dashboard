export const DEFAULT_PRIMARY = '#42d3b2'

export const PRIMARY_PRESETS = [
  '#42d3b2',
  '#409eff',
  '#8b5cf6',
  '#f59e0b',
  '#ef6c8f',
  '#14b8a6'
]

function parseHex(value) {
  const source = String(value || '').trim().replace(/^#/, '')
  const hex = source.length === 3 ? source.split('').map((part) => part + part).join('') : source
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null
  return [Number.parseInt(hex.slice(0, 2), 16), Number.parseInt(hex.slice(2, 4), 16), Number.parseInt(hex.slice(4, 6), 16)]
}

function toHex(rgb) {
  return `#${rgb.map((part) => Math.max(0, Math.min(255, Math.round(part))).toString(16).padStart(2, '0')).join('')}`
}

function mix(rgb, target, amount) {
  return toHex(rgb.map((part, index) => part + (target[index] - part) * amount))
}

export function normalizePrimary(value) {
  const rgb = parseHex(value)
  return rgb ? toHex(rgb) : DEFAULT_PRIMARY
}

export function applyPrimaryColor(value) {
  const color = normalizePrimary(value)
  const rgb = parseHex(color)
  const root = document.documentElement
  const luminance = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000
  root.style.setProperty('--homelab-primary', color)
  root.style.setProperty('--homelab-primary-rgb', rgb.join(','))
  root.style.setProperty('--homelab-primary-contrast', luminance > 165 ? '#15231f' : '#ffffff')
  root.style.setProperty('--homelab-primary-soft', mix(rgb, [255, 255, 255], 0.88))
  root.style.setProperty('--homelab-primary-dark-soft', mix(rgb, [0, 0, 0], 0.7))
  root.style.setProperty('--el-color-primary', color)
  root.style.setProperty('--el-color-primary-light-3', mix(rgb, [255, 255, 255], 0.3))
  root.style.setProperty('--el-color-primary-light-5', mix(rgb, [255, 255, 255], 0.5))
  root.style.setProperty('--el-color-primary-light-7', mix(rgb, [255, 255, 255], 0.7))
  root.style.setProperty('--el-color-primary-light-8', mix(rgb, [255, 255, 255], 0.8))
  root.style.setProperty('--el-color-primary-light-9', mix(rgb, [255, 255, 255], 0.9))
  root.style.setProperty('--el-color-primary-dark-2', mix(rgb, [0, 0, 0], 0.2))
  return color
}
