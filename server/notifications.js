import { isDbConfigured, query } from './db.js'
import { sendTelegramMessage } from './telegram.js'

function escapeHtml(text) {
  if (!text) return ''
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Record a notification entry to `notification_logs` table
 */
export async function recordNotificationLog({
  channel = 'telegram',
  category,
  targetType = null,
  targetId = null,
  title,
  content,
  status = 'success',
  errorMessage = null
}) {
  if (!isDbConfigured) return null
  try {
    const result = await query(
      `INSERT INTO notification_logs
       (channel, category, target_type, target_id, title, content, status, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        channel,
        category,
        targetType,
        targetId,
        String(title || '').slice(0, 200),
        String(content || ''),
        status,
        errorMessage ? String(errorMessage).slice(0, 1000) : null
      ]
    )
    return result.insertId
  } catch (error) {
    if (error.code !== 'ER_NO_SUCH_TABLE') {
      console.error('[NotificationLog] 记录日志失败:', error.message)
    }
    return null
  }
}

/**
 * Check if a successful notification has been sent for this target in the last N hours
 * @param {string} targetType Target entity type ('reminder', 'domain', 'service')
 * @param {number} targetId Target entity primary key
 * @param {number} hours Minimum hours between notifications
 * @returns {Promise<boolean>}
 */
export async function hasNotifiedRecently(targetType, targetId, hours = 24) {
  if (!isDbConfigured) return false
  const intervalHours = Math.max(1, Math.round(hours))
  try {
    const rows = await query(
      `SELECT id, sent_at FROM notification_logs
       WHERE target_type = ? AND target_id = ? AND status = 'success'
         AND sent_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
       ORDER BY sent_at DESC LIMIT 1`,
      [targetType, targetId, intervalHours]
    )
    return rows.length > 0
  } catch (error) {
    if (error.code !== 'ER_NO_SUCH_TABLE') {
      console.warn('[Notification] 检查历史通知失败:', error.message)
    }
    return false
  }
}

/**
 * Calculate window information for reminder (mirrors Reminders.vue)
 */
// ── Window & Cycle calculation for notifications ────────
function getCycleInfo(r) {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()
  const msPerDay = 86400000

  if (r.recur_type === 'once') {
    const start = r.start_date ? new Date(r.start_date) : null
    let end = r.due_date ? new Date(r.due_date) : null
    if (end) end.setHours(23, 59, 59, 999)
    const isDone = r.status === 'done' || r.last_completed_cycle === 'once'
    const isOverdue = !isDone && end && now.getTime() > end.getTime()
    return { cycleKey: 'once', cycleLabel: '', start, end, isPeriod: Boolean(start), isDone, isOverdue }
  }

  if (r.recur_type === 'yearly' && r.recur_month && r.recur_day) {
    const hasStart = Boolean(r.start_month && r.start_day)
    const isCrossYear = hasStart && (r.start_month > r.recur_month || (r.start_month === r.recur_month && r.start_day > r.recur_day))

    let lastCompletedYear = null
    if (r.last_completed_cycle) {
      const parsed = parseInt(r.last_completed_cycle, 10)
      if (!isNaN(parsed)) lastCompletedYear = parsed
    } else if (r.status === 'done') {
      lastCompletedYear = currentYear
    }

    let targetYear = currentYear
    if (lastCompletedYear !== null && lastCompletedYear >= currentYear) {
      targetYear = lastCompletedYear + 1
    }

    const end = new Date(targetYear, r.recur_month - 1, r.recur_day, 23, 59, 59)

    let windowOpen
    let start = null
    if (hasStart) {
      const startYear = isCrossYear ? targetYear - 1 : targetYear
      start = new Date(startYear, r.start_month - 1, r.start_day, 0, 0, 0)
      const remindDays = r.remind_days_before ?? 30
      windowOpen = new Date(start.getTime() - remindDays * msPerDay)
    } else {
      const remindDays = r.remind_days_before ?? 30
      windowOpen = new Date(end.getTime() - remindDays * msPerDay)
    }

    let isDone = false
    let isOverdue = false
    let isActive = false

    if (lastCompletedYear !== null && lastCompletedYear >= currentYear) {
      if (now.getTime() < windowOpen.getTime()) {
        isDone = true
      } else {
        isDone = false
        if (now.getTime() > end.getTime()) {
          isOverdue = true
        } else {
          isActive = true
        }
      }
    } else {
      if (now.getTime() > end.getTime()) {
        isOverdue = true
        isActive = true
      } else if (now.getTime() >= windowOpen.getTime()) {
        isActive = true
      }
    }

    return {
      cycleKey: String(targetYear),
      cycleLabel: `${targetYear}年`,
      targetYear,
      start,
      end,
      windowOpen,
      isPeriod: hasStart,
      isDone,
      isOverdue,
      isActive
    }
  }

  if (r.recur_type === 'monthly' && r.recur_day) {
    const hasStart = Boolean(r.start_day)
    const fmtMonthCycle = (y, m) => `${y}-${String(m + 1).padStart(2, '0')}`

    let lastCompletedIndex = null
    if (r.last_completed_cycle && r.last_completed_cycle.includes('-')) {
      const [yStr, mStr] = r.last_completed_cycle.split('-')
      const py = parseInt(yStr, 10)
      const pm = parseInt(mStr, 10) - 1
      if (!isNaN(py) && !isNaN(pm)) {
        lastCompletedIndex = py * 12 + pm
      }
    } else if (r.status === 'done') {
      lastCompletedIndex = currentYear * 12 + currentMonth
    }

    const currentIndex = currentYear * 12 + currentMonth

    let targetIndex = currentIndex
    if (lastCompletedIndex !== null && lastCompletedIndex >= currentIndex) {
      targetIndex = lastCompletedIndex + 1
    }

    const targetY = Math.floor(targetIndex / 12)
    const targetM = targetIndex % 12

    const end = new Date(targetY, targetM, r.recur_day, 23, 59, 59)

    let windowOpen
    let start = null
    if (hasStart) {
      start = new Date(targetY, targetM, r.start_day, 0, 0, 0)
      const remindDays = r.remind_days_before ?? 5
      windowOpen = new Date(start.getTime() - remindDays * msPerDay)
    } else {
      const remindDays = r.remind_days_before ?? 5
      windowOpen = new Date(end.getTime() - remindDays * msPerDay)
    }

    let isDone = false
    let isOverdue = false
    let isActive = false

    if (lastCompletedIndex !== null && lastCompletedIndex >= currentIndex) {
      if (now.getTime() < windowOpen.getTime()) {
        isDone = true
      } else {
        isDone = false
        if (now.getTime() > end.getTime()) {
          isOverdue = true
        } else {
          isActive = true
        }
      }
    } else {
      if (now.getTime() > end.getTime()) {
        isOverdue = true
        isActive = true
      } else if (now.getTime() >= windowOpen.getTime()) {
        isActive = true
      }
    }

    return {
      cycleKey: fmtMonthCycle(targetY, targetM),
      cycleLabel: `${targetM + 1}月`,
      start,
      end,
      windowOpen,
      isPeriod: hasStart,
      isDone,
      isOverdue,
      isActive
    }
  }

  return null
}

function getPeriodInfo(r) {
  return getCycleInfo(r)
}

function getReminderState(r) {
  const win = getCycleInfo(r)
  if (!win || !win.end) return null
  if (win.isDone) return null

  const now = Date.now()
  const msPerDay = 86400000

  // 1. Overdue
  if (win.isOverdue) {
    const cyclePrefix = win.cycleLabel ? `${win.cycleLabel} ` : ''
    return {
      isDue: true,
      isUrgent: true,
      label: `${cyclePrefix}已逾期！请尽快办理`
    }
  }

  // 2. Period with start & end
  if (win.start) {
    const daysToStart = Math.ceil((win.start.getTime() - now) / msPerDay)
    const daysToEnd = Math.ceil((win.end.getTime() - now) / msPerDay)

    if (now < win.start.getTime()) {
      return {
        isDue: false,
        daysToStart,
        daysToEnd,
        label: daysToStart <= 1 ? '明天开始办理' : `还有 ${daysToStart} 天开始`
      }
    }

    if (now >= win.start.getTime() && now <= win.end.getTime()) {
      const isUrgent = daysToEnd <= 3
      return {
        isDue: true,
        isUrgent,
        daysToEnd,
        label: daysToEnd <= 0 ? '今日截止！' : (daysToEnd <= 3 ? `最后 ${daysToEnd} 天截止！` : `办理期中 · 还剩 ${daysToEnd} 天`)
      }
    }
  }

  // 3. Single deadline
  const days = Math.ceil((win.end.getTime() - now) / msPerDay)
  const remindBefore = r.remind_days_before ?? 30
  if (days < 0) return { isDue: true, isUrgent: true, days, label: '已逾期！' }
  if (days === 0) return { isDue: true, isUrgent: true, days, label: '今天截止！' }
  if (days <= 3) return { isDue: true, isUrgent: true, days, label: `仅剩 ${days} 天！` }
  if (days <= remindBefore) return { isDue: true, isUrgent: false, days, label: `还有 ${days} 天` }

  return { isDue: false, days, label: `还有 ${days} 天` }
}

function formatPeriodText(r) {
  if (r.recur_type === 'yearly') {
    if (r.start_month && r.start_day) {
      return `每年 ${r.start_month} 月 ${r.start_day} 日 ～ ${r.recur_month} 月 ${r.recur_day} 日`
    }
    return `每年 ${r.recur_month} 月 ${r.recur_day} 日 截止`
  }
  if (r.recur_type === 'monthly') {
    if (r.start_day) {
      return `每月 ${r.start_day} 日 ～ ${r.recur_day} 日`
    }
    return `每月 ${r.recur_day} 日 截止`
  }
  if (r.recur_type === 'once') {
    const fmt = (d) => d ? new Date(d).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }) : ''
    if (r.start_date && r.due_date) {
      return `${fmt(r.start_date)} ～ ${fmt(r.due_date)}`
    }
    if (r.due_date) return `${fmt(r.due_date)} 截止`
  }
  return '—'
}

/**
 * Resolve effective Telegram credentials and configuration
 */
export function getTelegramConfig(settings = {}) {
  const tg = settings.telegram || {}
  const botToken = (tg.botToken || process.env.TELEGRAM_BOT_TOKEN || '').trim()
  const chatId = (tg.chatId || process.env.TELEGRAM_CHAT_ID || '').toString().trim()
  const apiBase = (process.env.TELEGRAM_API_BASE || 'https://api.telegram.org').trim()
  const enabled = Boolean(tg.enabled) && Boolean(botToken && chatId)
  const notifyReminders = tg.notifyReminders !== false
  const notifyDomains = tg.notifyDomains !== false
  const notifyServices = Boolean(tg.notifyServices)
  const remindIntervalDays = Math.max(1, Number(tg.remindIntervalDays) || 1)

  return {
    enabled,
    botToken,
    chatId,
    apiBase,
    notifyReminders,
    notifyDomains,
    notifyServices,
    remindIntervalDays
  }
}

/**
 * Check and send reminders via Telegram
 */
export async function checkAndSendReminders(settings) {
  const config = getTelegramConfig(settings)
  if (!config.enabled || !config.notifyReminders) return { sentCount: 0, skippedCount: 0 }

  if (!isDbConfigured) return { sentCount: 0, skippedCount: 0 }

  let reminders
  try {
    reminders = await query("SELECT * FROM reminders ORDER BY sort_order ASC, created_at ASC")
  } catch (error) {
    if (error.code !== 'ER_NO_SUCH_TABLE') console.error('[Notification] 查询提醒事项失败:', error.message)
    return { sentCount: 0, skippedCount: 0 }
  }

  let sentCount = 0
  let skippedCount = 0

  for (const r of reminders) {
    const state = getReminderState(r)
    if (!state || !state.isDue) {
      skippedCount++
      continue
    }

    // Dynamic Interval / Frequency Rule:
    // If critical/urgent (<= 3 days or overdue), notify every 24 hours.
    // Otherwise, respect user's configured remindIntervalDays (e.g. every 1, 2, 3, 7 days).
    const intervalHours = state.isUrgent ? 24 : config.remindIntervalDays * 24

    const alreadyNotified = await hasNotifiedRecently('reminder', r.id, intervalHours)
    if (alreadyNotified) {
      skippedCount++
      continue
    }

    const title = `【待办提醒】${r.title}`
    const periodText = formatPeriodText(r)

    let content = `⏰ <b>【待办提醒】${escapeHtml(r.title)}</b>\n\n`
    content += `<b>当前状态:</b> ${escapeHtml(state.label)}\n`
    content += `<b>所属分类:</b> ${escapeHtml(r.category || '默认')}\n`
    content += `<b>提醒周期:</b> ${escapeHtml(periodText)}\n`
    if (r.description) {
      content += `<b>事项说明:</b> ${escapeHtml(r.description)}\n`
    }
    if (r.action_url) {
      content += `\n🔗 <a href="${escapeHtml(r.action_url)}">${escapeHtml(r.action_label || '立即前往处理')}</a>`
    }

    try {
      await sendTelegramMessage({
        botToken: config.botToken,
        chatId: config.chatId,
        text: content,
        apiBase: config.apiBase
      })
      await recordNotificationLog({
        channel: 'telegram',
        category: 'reminder',
        targetType: 'reminder',
        targetId: r.id,
        title,
        content,
        status: 'success'
      })
      sentCount++
    } catch (err) {
      console.error(`[Notification] 发送待办提醒 #${r.id} (${r.title}) 失败:`, err.message)
      await recordNotificationLog({
        channel: 'telegram',
        category: 'reminder',
        targetType: 'reminder',
        targetId: r.id,
        title,
        content,
        status: 'failed',
        errorMessage: err.message
      })
    }
  }

  return { sentCount, skippedCount }
}

/**
 * Check and send domain expiration alerts via Telegram
 */
export async function checkAndSendDomainAlerts(settings) {
  const config = getTelegramConfig(settings)
  if (!config.enabled || !config.notifyDomains) return { sentCount: 0, skippedCount: 0 }

  if (!isDbConfigured) return { sentCount: 0, skippedCount: 0 }

  let domains
  try {
    domains = await query('SELECT * FROM domains WHERE expiration_date IS NOT NULL ORDER BY expiration_date ASC')
  } catch (error) {
    if (error.code !== 'ER_NO_SUCH_TABLE') console.error('[Notification] 查询域名信息失败:', error.message)
    return { sentCount: 0, skippedCount: 0 }
  }

  let sentCount = 0
  let skippedCount = 0
  const now = Date.now()
  const msPerDay = 86400000

  for (const d of domains) {
    const expireTime = new Date(d.expiration_date).getTime()
    const days = Math.ceil((expireTime - now) / msPerDay)

    // Alert if expiring in <= 30 days or already expired
    if (days > 30) {
      skippedCount++
      continue
    }

    // Urgency rule:
    // If <= 7 days, notify every 24 hours.
    // Otherwise notify every remindIntervalDays (e.g. 1, 3, 7 days).
    const intervalHours = days <= 7 ? 24 : config.remindIntervalDays * 24
    const alreadyNotified = await hasNotifiedRecently('domain', d.id, intervalHours)
    if (alreadyNotified) {
      skippedCount++
      continue
    }

    const title = `【域名到期】${d.domain_name}`
    const expDateStr = new Date(d.expiration_date).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })

    const statusLabel = days < 0 ? `已过期 ${Math.abs(days)} 天！` : (days === 0 ? '今日到期！' : `还剩 ${days} 天到期`)

    let content = `🌐 <b>【域名到期提醒】${escapeHtml(d.domain_name)}</b>\n\n`
    content += `<b>到期状态:</b> ${escapeHtml(statusLabel)}\n`
    content += `<b>到期日期:</b> ${escapeHtml(expDateStr)}\n`
    content += `<b>所属分类:</b> ${escapeHtml(d.category || '默认')}\n`
    if (d.registrar_name) {
      content += `<b>注册厂商:</b> ${escapeHtml(d.registrar_name)}\n`
    }
    if (d.registrar_url) {
      content += `\n🔗 <a href="${escapeHtml(d.registrar_url)}">前往域名注册商续费</a>`
    }

    try {
      await sendTelegramMessage({
        botToken: config.botToken,
        chatId: config.chatId,
        text: content,
        apiBase: config.apiBase
      })
      await recordNotificationLog({
        channel: 'telegram',
        category: 'domain',
        targetType: 'domain',
        targetId: d.id,
        title,
        content,
        status: 'success'
      })
      sentCount++
    } catch (err) {
      console.error(`[Notification] 发送域名提醒 #${d.id} (${d.domain_name}) 失败:`, err.message)
      await recordNotificationLog({
        channel: 'telegram',
        category: 'domain',
        targetType: 'domain',
        targetId: d.id,
        title,
        content,
        status: 'failed',
        errorMessage: err.message
      })
    }
  }

  return { sentCount, skippedCount }
}

/**
 * Check and send service status alerts via Telegram
 */
export async function checkAndSendServiceAlerts(settings) {
  const config = getTelegramConfig(settings)
  if (!config.enabled || !config.notifyServices) return { sentCount: 0, skippedCount: 0 }

  if (!isDbConfigured) return { sentCount: 0, skippedCount: 0 }

  let services
  try {
    services = await query('SELECT * FROM services WHERE status IN (0, 2, 3) OR docker_status IN (2, 3, 4)')
  } catch (error) {
    return { sentCount: 0, skippedCount: 0 }
  }

  let sentCount = 0
  let skippedCount = 0

  for (const s of services) {
    // Notify at most once every 24 hours per unhealthy service
    const alreadyNotified = await hasNotifiedRecently('service', s.id, 24)
    if (alreadyNotified) {
      skippedCount++
      continue
    }

    const statusNames = { 0: '离线 (Offline)', 2: '警告 (Warning)', 3: '错误 (Error)' }
    const statusText = statusNames[s.status] || '异常'

    const title = `【服务异常】${s.name}`
    let content = `🚨 <b>【服务异常提醒】${escapeHtml(s.name)}</b>\n\n`
    content += `<b>服务状态:</b> ${escapeHtml(statusText)}\n`
    content += `<b>所属分类:</b> ${escapeHtml(s.category || '默认')}\n`
    if (s.docker_enabled) {
      content += `<b>Docker 状态:</b> ${escapeHtml(s.docker_health || '异常')}\n`
    }
    const url = s.wan_url || s.lan_url
    if (url) {
      content += `\n🔗 <a href="${escapeHtml(url)}">访问服务</a>`
    }

    try {
      await sendTelegramMessage({
        botToken: config.botToken,
        chatId: config.chatId,
        text: content,
        apiBase: config.apiBase
      })
      await recordNotificationLog({
        channel: 'telegram',
        category: 'service',
        targetType: 'service',
        targetId: s.id,
        title,
        content,
        status: 'success'
      })
      sentCount++
    } catch (err) {
      console.error(`[Notification] 发送服务告警 #${s.id} (${s.name}) 失败:`, err.message)
      await recordNotificationLog({
        channel: 'telegram',
        category: 'service',
        targetType: 'service',
        targetId: s.id,
        title,
        content,
        status: 'failed',
        errorMessage: err.message
      })
    }
  }

  return { sentCount, skippedCount }
}

/**
 * Dispatch all notification tasks (reminders, domains, services)
 */
export async function checkAndSendAllNotifications(settings) {
  const [reminders, domains, services] = await Promise.all([
    checkAndSendReminders(settings),
    checkAndSendDomainAlerts(settings),
    checkAndSendServiceAlerts(settings)
  ])
  return { reminders, domains, services }
}

/**
 * Send test message to verify Telegram bot setup
 */
export async function sendTestMessage({ botToken, chatId, apiBase } = {}) {
  const token = (botToken || process.env.TELEGRAM_BOT_TOKEN || '').trim()
  const chat = (chatId || process.env.TELEGRAM_CHAT_ID || '').toString().trim()
  const base = (apiBase || process.env.TELEGRAM_API_BASE || 'https://api.telegram.org').trim()

  if (!token) throw new Error('请输入 Telegram Bot Token')
  if (!chat) throw new Error('请输入 Telegram Chat ID')

  const nowStr = new Date().toLocaleString('zh-CN', { hour12: false })
  const title = '【测试通知】HomeLab 控制中心'
  const content = `🔔 <b>【HomeLab 控制中心】Telegram 通知测试</b>\n\n` +
    `恭喜！您已成功接入 Telegram Bot 通知服务。\n` +
    `<b>测试时间:</b> ${escapeHtml(nowStr)}\n` +
    `<b>状态:</b> 正常联通`

  try {
    await sendTelegramMessage({
      botToken: token,
      chatId: chat,
      text: content,
      apiBase: base
    })

    await recordNotificationLog({
      channel: 'telegram',
      category: 'test',
      targetType: null,
      targetId: null,
      title,
      content,
      status: 'success'
    })

    return { ok: true, message: '测试消息已成功发送至 Telegram！' }
  } catch (error) {
    await recordNotificationLog({
      channel: 'telegram',
      category: 'test',
      targetType: null,
      targetId: null,
      title,
      content,
      status: 'failed',
      errorMessage: error.message
    })
    throw error
  }
}

/**
 * Fetch recent notification logs
 */
export async function getNotificationLogs(limit = 20) {
  if (!isDbConfigured) return []
  const maxLimit = Math.min(100, Math.max(1, Number(limit) || 20))
  try {
    const rows = await query(
      `SELECT id, channel, category, target_type, target_id, title, content, status, error_message, sent_at
       FROM notification_logs
       ORDER BY sent_at DESC, id DESC
       LIMIT ?`,
      [maxLimit]
    )
    return rows
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') return []
    throw error
  }
}
