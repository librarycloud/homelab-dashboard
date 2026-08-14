<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { Download, Lock, Bell, Refresh, Upload, Monitor, CircleCheck, Warning, InfoFilled, Setting, Brush } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
import { authApi, serviceApi, systemApi } from '../api'
import { readServiceCategories, writeServiceCategories } from '../serviceCategories'
import { normalizePrimary, PRIMARY_PRESETS, readPrimaryColor, savePrimaryColor } from '../theme'

const passwordForm = reactive({ currentPassword: '', newPassword: '', confirmPassword: '' })
const passwordLoading = ref(false)
const checking = ref(localStorage.getItem('homelab-checking') !== 'off')
const checkInterval = ref(localStorage.getItem('homelab-check-interval') || '30')
const notifications = reactive({ error: localStorage.getItem('homelab-notify-error') !== 'off', update: localStorage.getItem('homelab-notify-update') !== 'off', docker: localStorage.getItem('homelab-notify-docker') === 'on' })
const system = ref(null)
const importInput = ref(null)
const loadingSystem = ref(false)
const categories = ref(readServiceCategories())
const newCategory = ref('')
const primaryColor = ref(readPrimaryColor())
const primaryPresets = PRIMARY_PRESETS

const sessionText = computed(() => '当前会话有效期 24 小时，凭据由服务端安全保存')
function previewPrimaryColor(value) {
  primaryColor.value = savePrimaryColor(normalizePrimary(value))
}
function selectPrimaryColor(value) {
  primaryColor.value = savePrimaryColor(value)
  ElMessage.success('主题色已更新')
}
function resetPrimaryColor() {
  selectPrimaryColor('#42d3b2')
}
function savePreferences() {
  localStorage.setItem('homelab-checking', checking.value ? 'on' : 'off')
  localStorage.setItem('homelab-check-interval', checkInterval.value)
  localStorage.setItem('homelab-notify-error', notifications.error ? 'on' : 'off')
  localStorage.setItem('homelab-notify-update', notifications.update ? 'on' : 'off')
  localStorage.setItem('homelab-notify-docker', notifications.docker ? 'on' : 'off')
  ElMessage.success('设置已保存')
}
function addCategory() {
  const value = newCategory.value.trim()
  if (!value) return ElMessage.warning('请输入分类名称')
  if (categories.value.includes(value)) return ElMessage.warning('分类已存在')
  categories.value = writeServiceCategories([...categories.value, value])
  newCategory.value = ''
  ElMessage.success('分类已添加')
}
async function removeCategory(category) {
  try {
    await ElMessageBox.confirm(`删除分类“${category}”？已有服务不会被删除，但会保留原分类文字。`, '删除分类', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
    categories.value = writeServiceCategories(categories.value.filter((item) => item !== category))
    ElMessage.success('分类已删除')
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
function formatUptime(seconds) { const total = Math.floor(seconds || 0); return `${Math.floor(total / 86400)} 天 ${Math.floor(total / 3600) % 24} 小时 ${Math.floor(total / 60) % 60} 分钟` }
onMounted(loadSystem)
</script>

<template>
  <div class="page-head"><div><div class="eyebrow">WORKSPACE · SETTINGS</div><h1>系统设置</h1><p>管理账户安全、服务检查、通知、备份和系统运行信息。</p></div></div>
  <div class="settings-grid">
    <section class="settings-panel"><div class="settings-heading"><div class="settings-icon security"><el-icon><Lock /></el-icon></div><div><h2>账户安全</h2><span>修改管理员密码和查看会话状态</span></div></div><el-form label-position="top" class="settings-form"><el-form-item label="当前密码"><el-input v-model="passwordForm.currentPassword" type="password" show-password /></el-form-item><el-form-item label="新密码"><el-input v-model="passwordForm.newPassword" type="password" show-password /></el-form-item><el-form-item label="确认新密码"><el-input v-model="passwordForm.confirmPassword" type="password" show-password /></el-form-item><el-button type="primary" :loading="passwordLoading" @click="changePassword">更新密码</el-button></el-form><div class="settings-note"><el-icon><InfoFilled /></el-icon>{{ sessionText }}</div></section>
    <section class="settings-panel"><div class="settings-heading"><div class="settings-icon theme"><el-icon><Brush /></el-icon></div><div><h2>主题外观</h2><span>自定义界面主色，选择后立即预览</span></div></div><div class="theme-color-control"><div class="theme-color-picker"><el-color-picker v-model="primaryColor" :predefine="primaryPresets" @change="previewPrimaryColor" /><div><strong>{{ (primaryColor || '#42d3b2').toUpperCase() }}</strong><p>支持 HEX 颜色值</p></div></div><el-button text @click="resetPrimaryColor">恢复默认</el-button></div><div class="theme-presets"><button v-for="color in primaryPresets" :key="color" class="theme-swatch" :class="{ selected: primaryColor === color }" :style="{ backgroundColor: color }" :title="`使用 ${color} 主题色`" @click="selectPrimaryColor(color)"><el-icon v-if="primaryColor === color"><CircleCheck /></el-icon></button></div></section>
    <section class="settings-panel"><div class="settings-heading"><div class="settings-icon service"><el-icon><Refresh /></el-icon></div><div><h2>服务检查</h2><span>控制版本和服务状态检查频率</span></div></div><div class="setting-row"><div><strong>启用自动检查</strong><p>在服务列表中定期刷新检查结果</p></div><el-switch v-model="checking" /></div><div class="setting-row"><div><strong>检查间隔</strong><p>页面打开时使用的刷新周期</p></div><el-select v-model="checkInterval" popper-class="homelab-select-popper" style="width: 130px"><el-option label="每 15 分钟" value="15" /><el-option label="每 30 分钟" value="30" /><el-option label="每 1 小时" value="60" /></el-select></div><el-button @click="savePreferences">保存检查设置</el-button></section>
    <section class="settings-panel"><div class="settings-heading"><div class="settings-icon service"><el-icon><Setting /></el-icon></div><div><h2>服务分类</h2><span>维护服务编辑时可选择的固定分类</span></div></div><div class="category-manager"><div class="category-add"><el-input v-model="newCategory" placeholder="输入分类名称" @keyup.enter="addCategory" /><el-button type="primary" @click="addCategory">添加</el-button></div><div class="category-list"><el-tag v-for="category in categories" :key="category" closable @close="removeCategory(category)">{{ category }}</el-tag></div></div></section>
    <section class="settings-panel"><div class="settings-heading"><div class="settings-icon notice"><el-icon><Bell /></el-icon></div><div><h2>通知设置</h2><span>选择需要关注的系统事件</span></div></div><div class="setting-row"><div><strong>异常服务</strong><p>服务离线或进入异常状态时提醒</p></div><el-switch v-model="notifications.error" /></div><div class="setting-row"><div><strong>版本更新</strong><p>检测到可用新版本时提醒</p></div><el-switch v-model="notifications.update" /></div><div class="setting-row"><div><strong>Docker 状态</strong><p>容器停止或不健康时提醒</p></div><el-switch v-model="notifications.docker" /></div><el-button @click="savePreferences">保存通知设置</el-button></section>
    <section class="settings-panel"><div class="settings-heading"><div class="settings-icon backup"><el-icon><Download /></el-icon></div><div><h2>备份恢复</h2><span>导出或导入服务配置 JSON</span></div></div><div class="backup-actions"><el-button type="primary" @click="exportBackup"><el-icon><Download /></el-icon>导出配置</el-button><el-button @click="chooseImport"><el-icon><Upload /></el-icon>导入配置</el-button><input ref="importInput" type="file" accept="application/json" hidden @change="importBackup" /></div><div class="settings-note"><el-icon><Warning /></el-icon>导入会按服务 ID 更新已有数据，请先保留一份当前备份。</div></section>
    <section class="settings-panel system-panel"><div class="settings-heading"><div class="settings-icon system"><el-icon><Monitor /></el-icon></div><div><h2>系统信息</h2><span>查看当前 API 和数据库运行状态</span></div><el-button class="system-refresh" text :loading="loadingSystem" title="刷新系统信息" @click="loadSystem"><el-icon><Refresh /></el-icon></el-button></div><div v-if="system" class="system-info-grid"><div><span>应用版本</span><strong>v{{ system.appVersion }}</strong></div><div><span>Node.js</span><strong>{{ system.nodeVersion }}</strong></div><div><span>运行时间</span><strong>{{ formatUptime(system.uptime) }}</strong></div><div><span>数据库</span><strong :class="system.database === 'connected' ? 'healthy' : 'unhealthy'"><el-icon><CircleCheck v-if="system.database === 'connected'" /><Warning v-else /></el-icon>{{ system.database === 'connected' ? '已连接' : '未连接' }}</strong></div><div><span>API 端口</span><strong>{{ system.apiPort }}</strong></div><div><span>运行平台</span><strong>{{ system.platform }}</strong></div></div><el-empty v-else description="暂无系统信息" :image-size="60" /></section>
  </div>
</template>
<style src="../styles/settings.css"></style>
