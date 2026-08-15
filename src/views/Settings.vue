<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Download, Lock, Bell, Refresh, Upload, Monitor, CircleCheck, Warning, InfoFilled, Setting, Brush, UserFilled } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
import { authApi, serviceApi, settingsApi, systemApi } from '../api'
import { applySettings, DEFAULT_SETTINGS, normalizeSettings } from '../appSettings'
import { applyPrimaryColor, normalizePrimary, PRIMARY_PRESETS } from '../theme'

const router = useRouter()
const passwordForm = reactive({ currentPassword: '', newPassword: '', confirmPassword: '' })
const passwordLoading = ref(false)
const checking = ref(DEFAULT_SETTINGS.checking)
const checkInterval = ref(DEFAULT_SETTINGS.checkInterval)
const versionChecking = ref(DEFAULT_SETTINGS.versionChecking)
const versionCheckInterval = ref(DEFAULT_SETTINGS.versionCheckInterval)
const notifications = reactive({ ...DEFAULT_SETTINGS.notifications })
const system = ref(null)
const importInput = ref(null)
const loadingSystem = ref(false)
const loginAudit = ref([])
const loadingAudit = ref(false)
const categories = ref([...DEFAULT_SETTINGS.categories])
const newCategory = ref('')
const primaryColor = ref(DEFAULT_SETTINGS.primaryColor)
const siteName = ref(DEFAULT_SETTINGS.siteName)
const siteSubtitle = ref(DEFAULT_SETTINGS.siteSubtitle)
const sessionTtlHours = ref(DEFAULT_SETTINGS.sessionTtlHours)
const primaryPresets = PRIMARY_PRESETS

const sessionText = computed(() => `当前会话有效期 ${sessionTtlHours.value >= 24 && sessionTtlHours.value % 24 === 0 ? `${sessionTtlHours.value / 24} 天` : `${sessionTtlHours.value} 小时`}，凭据由服务端安全保存`)
function applySettingsToView(value) {
  const settings = applySettings(value)
  siteName.value = settings.siteName
  siteSubtitle.value = settings.siteSubtitle
  primaryColor.value = settings.primaryColor
  checking.value = settings.checking
  checkInterval.value = settings.checkInterval
  versionChecking.value = settings.versionChecking
  versionCheckInterval.value = settings.versionCheckInterval
  sessionTtlHours.value = settings.sessionTtlHours
  Object.assign(notifications, settings.notifications)
  categories.value = settings.categories
  return settings
}
async function persistSettings(changes, message) {
  const settings = applySettingsToView(await settingsApi.update(changes))
  window.dispatchEvent(new CustomEvent('homelab-settings-changed', { detail: settings }))
  if (message) ElMessage.success(message)
  return settings
}
async function loadSettings() {
  try { applySettingsToView(await settingsApi.get()) } catch (error) { ElMessage.error(error.message) }
}
async function previewPrimaryColor(value) {
  if (!value) return
  const color = normalizePrimary(value)
  primaryColor.value = color
  applyPrimaryColor(color)
  try { await persistSettings({ primaryColor: color }, '主题色已更新') } catch (error) { ElMessage.error(error.message) }
}
function selectPrimaryColor(value) { void previewPrimaryColor(value) }
function resetPrimaryColor() { selectPrimaryColor('#42d3b2') }
async function saveSiteNameSetting() {
  if (!siteName.value.trim() || !siteSubtitle.value.trim()) return ElMessage.warning('请输入站点名称和副标题')
  try { await persistSettings({ siteName: siteName.value, siteSubtitle: siteSubtitle.value }, '站点名称已更新') } catch (error) { ElMessage.error(error.message) }
}
async function savePreferences() {
  try { await persistSettings({ checking: checking.value, checkInterval: checkInterval.value, versionChecking: versionChecking.value, versionCheckInterval: versionCheckInterval.value, notifications: { ...notifications } }, '设置已保存') } catch (error) { ElMessage.error(error.message) }
}
async function saveSessionLifetime() {
  if (!Number.isInteger(sessionTtlHours.value) || sessionTtlHours.value < 1 || sessionTtlHours.value > 720) return ElMessage.warning('请输入 1 到 720 之间的整数小时数')
  try { await persistSettings({ sessionTtlHours: sessionTtlHours.value }, '会话有效期已保存，新登录后生效') } catch (error) { ElMessage.error(error.message) }
}
async function logout() {
  try { await authApi.logout(); ElMessage.success('已退出登录'); router.replace('/login') } catch (error) { ElMessage.error(error.message) }
}
async function addCategory() {
  const value = newCategory.value.trim()
  if (!value) return ElMessage.warning('请输入分类名称')
  if (categories.value.includes(value)) return ElMessage.warning('分类已存在')
  const previous = categories.value
  categories.value = [...categories.value, value]
  newCategory.value = ''
  try { await persistSettings({ categories: categories.value }, '分类已添加') } catch (error) { categories.value = previous; ElMessage.error(error.message) }
}
async function removeCategory(category) {
  try {
    await ElMessageBox.confirm(`删除分类“${category}”？已有服务不会被删除，但会保留原分类文字。`, '删除分类', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
    const previous = categories.value
    categories.value = categories.value.filter((item) => item !== category)
    try { await persistSettings({ categories: categories.value }, '分类已删除') } catch (error) { categories.value = previous; ElMessage.error(error.message) }
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.message || '删除失败')
  }
}
async function changePassword() {
  if (passwordForm.newPassword.length < 8) return ElMessage.warning('新密码至少需要 8 位')
  if (passwordForm.newPassword !== passwordForm.confirmPassword) return ElMessage.warning('两次输入的新密码不一致')
  passwordLoading.value = true
  try { await authApi.changePassword(passwordForm); Object.assign(passwordForm, { currentPassword: '', newPassword: '', confirmPassword: '' }); ElMessage.success('密码已更新') } catch (error) { ElMessage.error(error.message) } finally { passwordLoading.value = false }
}
async function exportBackup() {
  try {
    const services = await serviceApi.list()
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), services }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `homelab-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url)
    ElMessage.success('备份已导出')
  } catch (error) { ElMessage.error(error.message) }
}
function chooseImport() { importInput.value?.click() }
async function importBackup(event) {
  const file = event.target.files?.[0]; event.target.value = ''
  if (!file) return
  try {
    const payload = JSON.parse(await file.text())
    if (!Array.isArray(payload.services)) throw new Error('备份文件格式不正确')
    await ElMessageBox.confirm(`将恢复 ${payload.services.length} 个服务，已有服务会按 ID 更新。是否继续？`, '确认恢复', { type: 'warning' })
    for (const service of payload.services) {
      const { id, created_at, updated_at, last_check_at, docker_last_check_at, ...data } = service
      if (id) await serviceApi.update(id, data)
      else await serviceApi.create(data)
    }
    ElMessage.success('备份已恢复')
  } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error(error.message || '恢复失败') }
}
async function loadSystem() {
  loadingSystem.value = true
  try { system.value = await systemApi.info() } catch (error) { ElMessage.error(error.message) } finally { loadingSystem.value = false }
}
async function loadLoginAudit() {
  loadingAudit.value = true
  try { loginAudit.value = await systemApi.loginAudit(10) } catch (error) { ElMessage.error(error.message) } finally { loadingAudit.value = false }
}
function formatUptime(seconds) { const total = Math.floor(seconds || 0); return `${Math.floor(total / 86400)} 天 ${Math.floor(total / 3600) % 24} 小时 ${Math.floor(total / 60) % 60} 分钟` }
function formatAuditTime(value) { return value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value)) : '-' }
function failureReasonText(reason) {
  return { invalid_credentials: '凭据错误', rate_limited: '触发限流', auth_not_configured: '登录未配置' }[reason] || reason || '-'
}
function auditIpTitle(entry) {
  return [`识别地址：${entry.ipAddress}`, entry.remoteAddress && `直连地址：${entry.remoteAddress}`, entry.proxyChain && `可信代理链：${entry.proxyChain}`].filter(Boolean).join('\n')
}
onMounted(() => { void Promise.all([loadSettings(), loadSystem(), loadLoginAudit()]) })
</script>

<template>
  <div class="page-head"><div><h1>系统设置</h1><p>管理账户安全、服务检查、通知、备份和系统运行信息。</p></div></div>
  <div class="settings-grid">
    <section class="settings-panel"><div class="settings-heading"><div class="settings-icon system"><el-icon><Monitor /></el-icon></div><div><h2>站点名称</h2><span>用于浏览器标签页和界面品牌显示</span></div></div><el-form class="settings-form" @submit.prevent="saveSiteNameSetting"><el-form-item label="名称"><el-input v-model="siteName" maxlength="60" show-word-limit placeholder="例如：HomeLab" @keyup.enter="saveSiteNameSetting" /></el-form-item><el-form-item label="副标题"><el-input v-model="siteSubtitle" maxlength="60" show-word-limit placeholder="例如：CONTROL CENTER" @keyup.enter="saveSiteNameSetting" /></el-form-item><el-button type="primary" @click="saveSiteNameSetting">保存名称</el-button></el-form></section>
    <section class="settings-panel"><div class="settings-heading"><div class="settings-icon security"><el-icon><Lock /></el-icon></div><div><h2>账户安全</h2><span>修改管理员密码和查看会话状态</span></div></div><el-form label-position="top" class="settings-form password-form"><el-form-item label="当前密码"><el-input v-model="passwordForm.currentPassword" type="password" show-password /></el-form-item><el-form-item label="新密码"><el-input v-model="passwordForm.newPassword" type="password" show-password /></el-form-item><el-form-item label="确认新密码"><el-input v-model="passwordForm.confirmPassword" type="password" show-password /></el-form-item><el-button type="primary" class="password-submit" :loading="passwordLoading" @click="changePassword">更新密码</el-button></el-form><div class="settings-note"><el-icon><InfoFilled /></el-icon>{{ sessionText }}</div></section>
    <section class="settings-panel"><div class="settings-heading"><div class="settings-icon theme"><el-icon><Brush /></el-icon></div><div><h2>主题外观</h2><span>自定义界面主色，选择后立即预览</span></div></div><div class="theme-color-control"><div class="theme-color-picker"><el-color-picker v-model="primaryColor" :predefine="primaryPresets" @change="previewPrimaryColor" /><div><strong>{{ (primaryColor || '#42d3b2').toUpperCase() }}</strong><p>支持 HEX 颜色值</p></div></div><el-button text @click="resetPrimaryColor">恢复默认</el-button></div><div class="theme-presets"><button v-for="color in primaryPresets" :key="color" class="theme-swatch" :class="{ selected: primaryColor === color }" :style="{ backgroundColor: color }" :title="`使用 ${color} 主题色`" @click="selectPrimaryColor(color)"><el-icon v-if="primaryColor === color"><CircleCheck /></el-icon></button></div></section>
    <section class="settings-panel"><div class="settings-heading"><div class="settings-icon service"><el-icon><Refresh /></el-icon></div><div><h2>服务检查</h2><span>控制服务状态和版本检测频率</span></div></div><div class="setting-row"><div><strong>启用自动状态检查</strong><p>在服务列表中定期刷新服务运行状态</p></div><el-switch v-model="checking" /></div><div class="setting-row"><div><strong>状态检查间隔</strong><p>自动刷新服务状态的时间间隔</p></div><el-select v-model="checkInterval" popper-class="homelab-select-popper" style="width: 130px"><el-option label="每 15 分钟" value="15" /><el-option label="每 30 分钟" value="30" /><el-option label="每 1 小时" value="60" /></el-select></div><div class="setting-row"><div><strong>定时检测版本</strong><p>由服务端后台自动检测所有服务的版本</p></div><el-switch v-model="versionChecking" /></div><div class="setting-row"><div><strong>版本检测间隔</strong><p>自动检测 GitHub、Docker 等版本来源的时间间隔</p></div><el-select v-model="versionCheckInterval" popper-class="homelab-select-popper" style="width: 130px"><el-option label="每 30 分钟" value="30" /><el-option label="每 1 小时" value="60" /><el-option label="每 3 小时" value="180" /></el-select></div><el-button class="settings-save-button" type="primary" @click="savePreferences">保存检查设置</el-button></section>
    <section class="settings-panel"><div class="settings-heading"><div class="settings-icon service"><el-icon><Setting /></el-icon></div><div><h2>服务分类</h2><span>维护服务编辑时可选择的固定分类</span></div></div><div class="category-manager"><div class="category-add"><el-input v-model="newCategory" placeholder="输入分类名称" @keyup.enter="addCategory" /><el-button type="primary" @click="addCategory">添加</el-button></div><div class="category-list"><el-tag v-for="category in categories" :key="category" closable @close="removeCategory(category)">{{ category }}</el-tag></div></div></section>
    <section class="settings-panel"><div class="settings-heading"><div class="settings-icon notice"><el-icon><Bell /></el-icon></div><div><h2>通知设置</h2><span>选择需要关注的系统事件</span></div></div><div class="setting-row"><div><strong>异常服务</strong><p>服务离线或进入异常状态时提醒</p></div><el-switch v-model="notifications.error" /></div><div class="setting-row"><div><strong>版本更新</strong><p>检测到可用新版本时提醒</p></div><el-switch v-model="notifications.update" /></div><div class="setting-row"><div><strong>Docker 状态</strong><p>容器停止或不健康时提醒</p></div><el-switch v-model="notifications.docker" /></div><el-button class="settings-save-button" type="primary" @click="savePreferences">保存通知设置</el-button></section>
    <section class="settings-panel backup-panel"><div class="settings-heading"><div class="settings-icon backup"><el-icon><Download /></el-icon></div><div><h2>备份恢复</h2><span>导出或导入服务配置 JSON</span></div></div><div class="backup-actions"><el-button type="primary" @click="exportBackup"><el-icon><Download /></el-icon>导出配置</el-button><el-button @click="chooseImport"><el-icon><Upload /></el-icon>导入配置</el-button><input ref="importInput" type="file" accept="application/json" hidden @change="importBackup" /></div><div class="settings-note"><el-icon><Warning /></el-icon>导入会按服务 ID 更新已有数据，请先保留一份当前备份。</div></section>
    <section class="settings-panel system-panel"><div class="settings-heading"><div class="settings-icon system"><el-icon><Monitor /></el-icon></div><div><h2>系统信息</h2><span>查看当前 API 和数据库运行状态</span></div><el-button class="system-refresh" text :loading="loadingSystem" title="刷新系统信息" @click="loadSystem"><el-icon><Refresh /></el-icon></el-button></div><div v-if="system" class="system-info-grid"><div><span>应用版本</span><strong>v{{ system.appVersion }}</strong></div><div><span>Node.js</span><strong>{{ system.nodeVersion }}</strong></div><div><span>运行时间</span><strong>{{ formatUptime(system.uptime) }}</strong></div><div><span>数据库</span><strong :class="system.database === 'connected' ? 'healthy' : 'unhealthy'"><el-icon><CircleCheck v-if="system.database === 'connected'" /><Warning v-else /></el-icon>{{ system.database === 'connected' ? '已连接' : '未连接' }}</strong></div><div><span>API 端口</span><strong>{{ system.apiPort }}</strong></div><div><span>运行平台</span><strong>{{ system.platform }}</strong></div></div><el-empty v-else description="暂无系统信息" :image-size="60" /></section>
    <section class="settings-panel login-audit-panel"><div class="settings-heading"><div class="settings-icon audit"><el-icon><UserFilled /></el-icon></div><div><h2>登录日志</h2><span>最近 10 次登录结果和可信代理来源</span></div><el-button class="system-refresh" text :loading="loadingAudit" title="刷新登录日志" @click="loadLoginAudit"><el-icon><Refresh /></el-icon></el-button></div><div class="login-audit-scroll"><table class="login-audit-table"><thead><tr><th>结果</th><th>用户名</th><th>来源 IP</th><th>时间</th><th>失败原因</th><th>User-Agent</th></tr></thead><tbody><tr v-for="entry in loginAudit" :key="entry.id"><td><span class="audit-status" :class="entry.success ? 'success' : 'failure'"><el-icon><CircleCheck v-if="entry.success" /><Warning v-else /></el-icon>{{ entry.success ? '成功' : '失败' }}</span></td><td class="audit-username">{{ entry.username || '(空)' }}</td><td><span class="audit-ip" :title="auditIpTitle(entry)">{{ entry.ipAddress }}</span></td><td class="audit-time">{{ formatAuditTime(entry.createdAt) }}</td><td>{{ entry.success ? '-' : failureReasonText(entry.failureReason) }}</td><td><el-tooltip :content="entry.userAgent || '-'" effect="light" placement="top" popper-class="audit-agent-tooltip" :show-after="0" append-to="body"><span class="audit-agent" :title="entry.userAgent || '-'" tabindex="0">{{ entry.userAgent || '-' }}</span></el-tooltip></td></tr><tr v-if="!loginAudit.length && !loadingAudit"><td colspan="6" class="audit-empty">暂无登录记录</td></tr></tbody></table></div></section>
    <section class="settings-panel session-panel"><div class="settings-heading"><div class="settings-icon security"><el-icon><Lock /></el-icon></div><div><h2>会话有效期</h2><span>设置新登录会话和 Cookie 的有效时间</span></div></div><div class="setting-row session-setting-row"><div><strong>有效期</strong><p>可设置 1 到 720 小时，修改后从下一次登录开始生效</p></div><el-input-number v-model="sessionTtlHours" :min="1" :max="720" :step="1" :precision="0" controls-position="right" aria-label="会话有效期（小时）" /></div><div class="backup-actions"><el-button type="primary" @click="saveSessionLifetime">保存会话设置</el-button><el-button type="danger" plain @click="logout">退出登录</el-button></div></section>
  </div>
</template>
<style src="../styles/settings.css"></style>
