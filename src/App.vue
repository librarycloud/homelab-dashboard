<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ArrowDown, Bell, Close, Folder, Grid, House, Moon, Search, Setting, Sunny, WarningFilled } from '@element-plus/icons-vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import 'element-plus/es/components/message/style/css'
import { authApi, serviceApi, settingsApi } from './api'
import { applySettings, DEFAULT_SETTINGS, normalizeSettings } from './appSettings'

const route = useRoute()
const router = useRouter()
const dark = ref(localStorage.getItem('homelab-theme') !== 'light')
const siteName = ref(DEFAULT_SETTINGS.siteName)
const siteSubtitle = ref(DEFAULT_SETTINGS.siteSubtitle)
const search = ref('')
const services = ref([])
const noticeSettings = ref({ ...DEFAULT_SETTINGS.notifications })
const noticeOpen = ref(false)
const dismissedNotices = ref(new Set(JSON.parse(localStorage.getItem('homelab-dismissed-notices') || '[]')))
const isLoginPage = computed(() => route.path === '/login')
const nav = [
  { label: '总览', path: '/', icon: House },
  { label: '我的服务', path: '/services', icon: Grid },
  { label: '项目管理', path: '/projects', icon: Folder }
]
const pageTitle = computed(() => route.path === '/' ? '总览' : route.path === '/projects' ? '项目管理' : route.path === '/settings' ? '系统设置' : '我的服务')
const notices = computed(() => services.value.flatMap((service) => {
  const items = []
  if (noticeSettings.value.error && (service.status === 3 || service.status === 0)) items.push({ key: `${service.id}-status`, type: 'danger', icon: WarningFilled, title: `${service.name} 状态异常`, text: service.status === 0 ? '服务当前处于离线状态' : '服务当前处于异常状态' })
  if (noticeSettings.value.update && service.version_status === 2) items.push({ key: `${service.id}-version`, type: 'warning', icon: Bell, title: `${service.name} 有新版本`, text: `可更新至 ${service.remote_version || '最新版本'}` })
  if (noticeSettings.value.docker && service.docker_enabled && [2, 3, 4].includes(service.docker_status)) items.push({ key: `${service.id}-docker`, type: 'danger', icon: WarningFilled, title: `${service.name} Docker 异常`, text: service.docker_health || '请检查容器运行状态' })
  return items
}).filter((notice) => !dismissedNotices.value.has(notice.key)))

function go(path) { router.push(path) }
async function loadNotices() {
  try { services.value = await serviceApi.list() } catch { services.value = [] }
}
function openNotices() { noticeOpen.value = !noticeOpen.value }
function closeNotices() { noticeOpen.value = false }
function syncSettings(event) {
  const settings = normalizeSettings(event.detail || {})
  siteName.value = settings.siteName
  siteSubtitle.value = settings.siteSubtitle
  noticeSettings.value = settings.notifications
  applySettings(settings)
}
function persistDismissedNotices() { localStorage.setItem('homelab-dismissed-notices', JSON.stringify([...dismissedNotices.value])) }
function dismissNotice(notice) { dismissedNotices.value = new Set([...dismissedNotices.value, notice.key]); persistDismissedNotices() }
function clearNotices() { dismissedNotices.value = new Set([...dismissedNotices.value, ...notices.value.map((notice) => notice.key)]); persistDismissedNotices(); noticeOpen.value = false }
async function logout() {
  await authApi.logout()
  ElMessage.success('已退出登录')
  router.replace('/login')
}
function handleUserCommand(command) {
  if (command === 'settings') go('/settings')
  if (command === 'logout') void logout()
}
watch(dark, (value) => {
  localStorage.setItem('homelab-theme', value ? 'dark' : 'light')
  document.documentElement.classList.toggle('homelab-light', !value)
}, { immediate: true })
async function loadSettings() {
  try { syncSettings({ detail: await settingsApi.get() }) } catch {}
}
onMounted(() => window.addEventListener('homelab-settings-changed', syncSettings))
onUnmounted(() => window.removeEventListener('homelab-settings-changed', syncSettings))
applySettings(DEFAULT_SETTINGS)
void loadSettings()
loadNotices()
watch(() => route.path, (path) => {
  if (path !== '/login') loadNotices()
})
</script>

<template>
  <router-view v-if="isLoginPage" />
  <div v-else class="app-shell" :class="{ light: !dark }">
    <aside class="sidebar">
      <div class="brand"><div class="brand-mark">H</div><div><strong>{{ siteName }}</strong><span>{{ siteSubtitle }}</span></div></div>
      <div class="workspace-label">工作区</div>
      <nav><button v-for="item in nav" :key="item.path" class="nav-item" :class="{ active: route.path === item.path }" @click="go(item.path)"><el-icon><component :is="item.icon" /></el-icon><span>{{ item.label }}</span></button></nav>
      <div class="sidebar-bottom"><button class="nav-item" :class="{ active: route.path === '/settings' }" @click="go('/settings')"><el-icon><Setting /></el-icon><span>系统设置</span></button><div class="system-state"><i></i><span>系统运行正常</span><small>v0.1.0</small></div></div>
    </aside>
    <main class="main-area">
      <header class="topbar"><div class="mobile-brand"><div class="brand-mark">H</div><strong>{{ siteName }}</strong></div><div class="crumb"><span>{{ siteName }}</span><b>/</b><strong>{{ pageTitle }}</strong></div><div class="top-actions"><div class="search-box"><el-icon><Search /></el-icon><input v-model="search" placeholder="搜索服务..." /><kbd>⌘ K</kbd></div><div class="notice-wrap"><button class="icon-btn" :class="{ active: noticeOpen }" title="通知" @click="openNotices"><el-icon><Bell /></el-icon><i v-if="notices.length" class="notice-dot"></i></button><div v-if="noticeOpen" class="notice-panel"><div class="notice-head"><strong>通知</strong><div><span>{{ notices.length }} 条</span><button v-if="notices.length" class="notice-clear" title="清除全部通知" @click.stop="clearNotices">清除</button></div></div><div v-if="!notices.length" class="notice-empty"><el-icon><Bell /></el-icon><span>暂无需要处理的通知</span></div><div v-for="notice in notices" :key="notice.key" class="notice-item"><span class="notice-icon" :class="notice.type"><el-icon><component :is="notice.icon" /></el-icon></span><span><strong>{{ notice.title }}</strong><small>{{ notice.text }}</small></span><button class="notice-dismiss" title="清除通知" @click.stop="dismissNotice(notice)"><el-icon><Close /></el-icon></button></div></div></div><button class="icon-btn theme-toggle" :title="dark ? '切换浅色主题' : '切换深色主题'" @click="dark = !dark"><el-icon><Sunny v-if="dark" /><Moon v-else /></el-icon><span>{{ dark ? '深色' : '浅色' }}</span></button><el-dropdown class="user-dropdown" trigger="click" placement="bottom-end" popper-class="user-menu" @command="handleUserCommand"><button class="user-chip" title="账户菜单"><div class="avatar">A</div><div class="user-copy"><strong>admin</strong><span>管理员</span></div><el-icon class="user-chevron"><ArrowDown /></el-icon></button><template #dropdown><el-dropdown-menu><el-dropdown-item command="settings"><el-icon><Setting /></el-icon>系统设置</el-dropdown-item><el-dropdown-item divided command="logout">退出登录</el-dropdown-item></el-dropdown-menu></template></el-dropdown></div></header>
      <div class="mobile-tabs"><button v-for="item in nav" :key="item.path" :class="{ active: route.path === item.path }" @click="go(item.path)"><el-icon><component :is="item.icon" /></el-icon>{{ item.label }}</button></div>
      <div class="content"><router-view /></div>
    </main>
  </div>
</template>
