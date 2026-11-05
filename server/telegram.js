import axios from 'axios'

/**
 * Send a message via Telegram Bot API
 * @param {Object} options
 * @param {string} options.botToken Telegram Bot Token (e.g. '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11')
 * @param {string|number} options.chatId Target chat ID or channel username
 * @param {string} options.text Message text
 * @param {string} [options.parseMode='HTML'] 'HTML' or 'MarkdownV2' or 'Markdown'
 * @param {string} [options.apiBase] Base URL for Telegram API
 * @param {boolean} [options.disableWebPagePreview=true]
 * @returns {Promise<Object>} Telegram API response data
 */
export async function sendTelegramMessage({
  botToken,
  chatId,
  text,
  parseMode = 'HTML',
  apiBase,
  disableWebPagePreview = true
} = {}) {
  const token = (botToken || process.env.TELEGRAM_BOT_TOKEN || '').trim()
  const chat = (chatId || process.env.TELEGRAM_CHAT_ID || '').toString().trim()
  const base = (apiBase || process.env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/+$/, '')

  if (!token) {
    throw new Error('Telegram Bot Token 未配置')
  }
  if (!chat) {
    throw new Error('Telegram Chat ID 未配置')
  }
  if (!text || !text.trim()) {
    throw new Error('通知内容不能为空')
  }

  const url = `${base}/bot${token}/sendMessage`
  const payload = {
    chat_id: chat,
    text: text.trim(),
    parse_mode: parseMode,
    disable_web_page_preview: disableWebPagePreview
  }

  try {
    const response = await axios.post(url, payload, {
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json'
      }
    })

    if (!response.data || !response.data.ok) {
      const description = response.data?.description || '未知错误'
      throw new Error(`Telegram API 返回失败: ${description}`)
    }

    return response.data
  } catch (error) {
    if (error.response?.data?.description) {
      throw new Error(`Telegram 发送失败: ${error.response.data.description}`)
    }
    throw new Error(`Telegram 发送失败: ${error.message}`)
  }
}
