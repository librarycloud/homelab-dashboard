<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { AlarmClock, Avatar, Bell, Box, Camera, Calendar, CircleCheck, Clock, Coin, Collection, Connection, CopyDocument, Cpu, DataAnalysis, DataBoard, Document, Download, EditPen, Files, Film, Folder, FolderOpened, Grid, Headset, House, InfoFilled, Key, Link, Lock, Management, Message, Monitor, MoreFilled, Odometer, Picture, PieChart, Platform, Refresh, Setting, Share, ShoppingCart, Tickets, Tools, TopRight, TrendCharts, Upload, User, UserFilled, VideoCamera, VideoCameraFilled, Wallet, Warning, WarningFilled } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
import { useRouter } from 'vue-router'
import { useServicesStore } from '../stores/services'

const servicesStore = useServicesStore()
const router = useRouter()

const services = computed(() => servicesStore.services)
const loading = computed(() => servicesStore.loading)
const checkingId = computed(() => servicesStore.checkingId)
const checkingAll = computed(() => servicesStore.checkingAll)
const checkingProgress = computed(() => servicesStore.checkingProgress)

const openFrpId = ref(null)
const filter = ref('全部')
const filters = ['全部', '运行中', '有更新', '维护中']
const statusMeta = { 0: ['离线', 'info'], 1: ['运行中', 'success'], 2: ['告警', 'warning'], 3: ['异常', 'danger'], 4: ['维护中', 'info'] }
const serviceIconMap = { Monitor, Platform, Avatar, UserFilled, DataAnalysis, DataBoard, PieChart, Odometer, Cpu, Connection, House, Grid, Folder, FolderOpened, Picture, Camera, Calendar, Lock, Key, User, Message, Bell, Headset, Link, Share, Collection, Document, CopyDocument, Files, Download, Upload, AlarmClock, Film, VideoCamera, VideoCameraFilled, ShoppingCart, Coin, Tools, Setting, Management, Tickets, Box, Wallet, CircleCheck, Warning, InfoFilled }

const visibleServices = computed(() => services.value.filter((service) => {
  if (filter.value === '运行中') return service.status === 1
  if (filter.value === '有更新') return service.version_status === 2
  if (filter.value === '维护中') return service.status === 4
  return true
}))

function statusFor(value) { return statusMeta[value] || statusMeta[0] }
function serviceIcon(icon) { return serviceIconMap[icon] || Monitor }
function hasServiceValue(value) {
  const normalized = String(value ?? '').trim().toLowerCase()
  return Boolean(normalized && normalized !== 'null' && normalized !== 'undefined')
}
function formatTime(value) { return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '尚未检测' }
function openUrl(url, defaultProtocol = 'https') { if (url) window.open(url.startsWith('http://') || url.startsWith('https://') ? url : `${defaultProtocol}://${url}`, '_blank', 'noopener') }

async function loadDashboard({ notify = false } = {}) {
  try {
    if (notify) {
      await servicesStore.refreshStatus()
      ElMessage.success('服务状态已刷新')
    } else {
      await servicesStore.fetchServices()
    }
  } catch (error) {
    ElMessage.error(error.message)
  }
}

async function checkVersion(service) {
  if (checkingAll.value) return
  try {
    await servicesStore.checkVersion(service.id)
    ElMessage.success('版本检测完成')
  } catch (error) {
    ElMessage.error(error.message || '版本检测失败')
  }
}

async function checkAllVersions() {
  if (checkingAll.value || loading.value) return
  if (!services.value.length) return ElMessage.info('暂无可检测的服务')
  try {
    const { total, success, failed } = await servicesStore.checkAllVersions(3)
    if (failed) ElMessage.warning(`版本检测完成，${success} 个成功，${failed} 个失败`)
    else ElMessage.success(`已完成 ${total} 个服务的版本检测`)
  } catch (error) {
    ElMessage.error(error.message || '版本检测异常')
  }
}

async function removeService(service) {
  try {
    await ElMessageBox.confirm(`确定删除“${service.name}”吗？此操作不可恢复。`, '删除服务', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
    await servicesStore.removeService(service.id)
    ElMessage.success('服务已删除')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.message || '删除失败')
  }
}

const noteDialogVisible = ref(false)
const noteService = ref(null)
const noteContent = ref('')
const isEditingNote = ref(false)
const noteSaving = ref(false)

function openNote(service, forceEdit = false) {
  noteService.value = service
  noteContent.value = service.notes || ''
  isEditingNote.value = forceEdit || !hasServiceValue(service.notes)
  noteDialogVisible.value = true
}

function startEditNote() {
  isEditingNote.value = true
}

function cancelEditNote() {
  if (!hasServiceValue(noteService.value?.notes)) {
    noteDialogVisible.value = false
  } else {
    noteContent.value = noteService.value?.notes || ''
    isEditingNote.value = false
  }
}

async function saveNote() {
  if (!noteService.value) return
  noteSaving.value = true
  try {
    const trimmed = noteContent.value.trim() || null
    await servicesStore.updateService(noteService.value.id, { notes: trimmed })
    if (noteService.value) {
      noteService.value.notes = trimmed
    }
    isEditingNote.value = false
    noteDialogVisible.value = false
    ElMessage.success('备注已保存')
  } catch (error) {
    ElMessage.error(error.message || '保存备注失败')
  } finally {
    noteSaving.value = false
  }
}

async function copyNote() {
  if (!noteContent.value) return
  try {
    await navigator.clipboard.writeText(noteContent.value)
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.warning('复制失败，请手动选择复制')
  }
}

function handleServiceMenu(command, service) {
  if (command === 'check') return checkVersion(service)
  if (command === 'edit') return router.push({ path: '/services', query: { edit: service.id } })
  if (command === 'delete') return removeService(service)
}

function toggleFrp(service) { openFrpId.value = openFrpId.value === service.id ? null : service.id }
function closeFrpOutside(event) { if (!event.target.closest('.frp-info-wrap')) openFrpId.value = null }

onMounted(() => {
  loadDashboard()
  document.addEventListener('click', closeFrpOutside)
})
onBeforeUnmount(() => document.removeEventListener('click', closeFrpOutside))
</script>

<template>
  <div class="page-head"><div><h1>系统总览</h1></div><div class="heading-actions"><el-button class="version-check-btn" type="primary" :loading="checkingAll" :disabled="loading" @click="checkAllVersions"><el-icon><CircleCheck /></el-icon>{{ checkingAll ? `检测中 ${checkingProgress}/${services.length}` : '检测版本' }}</el-button><el-button class="refresh-btn" plain :loading="loading" :disabled="checkingAll" @click="loadDashboard({ notify: true })"><el-icon><Refresh /></el-icon>刷新状态</el-button><div class="filter-tabs"><button v-for="item in filters" :key="item" :class="{ selected: filter === item }" @click="filter = item">{{ item }}</button></div><router-link class="overview-link" to="/services">管理服务 <el-icon><TopRight /></el-icon></router-link></div></div>
  <section class="section overview-services-section">
    <div v-loading="loading" class="services-grid"><div v-if="!loading && !visibleServices.length" class="empty-state">暂无符合条件的服务，请前往“我的服务”添加或调整服务信息。</div><article v-for="service in visibleServices" :key="service.id" class="service-card"><div class="service-card-head"><div class="service-logo"><el-icon><component :is="serviceIcon(service.icon)" /></el-icon></div><div class="service-title"><h3>{{ service.name }}</h3><span>{{ service.description || '未填写描述' }}</span></div><el-dropdown trigger="click" :disabled="checkingAll" @command="(command) => handleServiceMenu(command, service)"><button class="card-menu" title="更多操作"><el-icon class="more"><MoreFilled /></el-icon></button><template #dropdown><el-dropdown-menu class="service-action-menu"><el-dropdown-item command="check" :disabled="checkingAll || checkingId === service.id">{{ checkingId === service.id ? '检测中...' : '检测版本' }}</el-dropdown-item><el-dropdown-item command="edit">编辑服务</el-dropdown-item><el-dropdown-item command="delete" divided>删除服务</el-dropdown-item></el-dropdown-menu></template></el-dropdown></div><div class="service-meta"><el-tag :type="statusFor(service.status)[1]" effect="dark" size="small"><i class="status-dot"></i>{{ statusFor(service.status)[0] }}</el-tag><span class="category">{{ service.category || '未分类' }}</span><span class="updated"><Clock /> {{ formatTime(service.updated_at) }}</span></div><div class="version-row"><div><span>当前版本</span><strong>{{ service.local_version || '-' }}</strong></div><div v-if="service.remote_version" class="version-latest"><span>远程版本</span><strong>{{ service.remote_version }}</strong></div><div v-if="service.version_status === 2" class="update-pill">有新版本</div></div><div class="service-links"><button v-if="hasServiceValue(service.lan_url)" @click="openUrl(service.lan_url, 'http')"><el-icon><Connection /></el-icon>内网访问</button><button v-if="hasServiceValue(service.wan_url)" @click="openUrl(service.wan_url)"><el-icon><TopRight /></el-icon>公网访问</button><button v-if="hasServiceValue(service.github_url)" @click="openUrl(service.github_url)"><el-icon><Box /></el-icon>GitHub</button><span v-if="hasServiceValue(service.frp_username) || hasServiceValue(service.frp_password)" class="frp-info-wrap"><button class="frp-info-button" type="button" title="查看 FRP 信息" @click.stop="toggleFrp(service)"><el-icon><Lock /></el-icon>FRP</button><span class="frp-info" :class="{ visible: openFrpId === service.id }"><strong>FRP 信息</strong><span>用户名：{{ hasServiceValue(service.frp_username) ? service.frp_username : '未填写' }}</span><span>密码：{{ hasServiceValue(service.frp_password) ? service.frp_password : '未填写' }}</span></span></span><el-tooltip v-if="hasServiceValue(service.notes)" :content="service.notes" placement="top" popper-class="note-tooltip" :show-after="300"><button type="button" class="note-btn has-note" title="查看/编辑备注" @click.stop="openNote(service)"><el-icon><Document /></el-icon>备注<span class="note-dot"></span></button></el-tooltip><button v-else type="button" class="note-btn" title="添加备注" @click.stop="openNote(service, true)"><el-icon><Document /></el-icon>备注</button></div></article></div>
  </section>

  <el-dialog
    v-model="noteDialogVisible"
    :title="`服务备注 - ${noteService?.name || ''}`"
    width="540px"
    destroy-on-close
    class="service-note-dialog"
  >
    <div class="note-dialog-body">
      <div class="note-meta-bar">
        <span class="note-category-tag">服务分类：{{ noteService?.category || '未分类' }}</span>
        <div class="note-meta-actions">
          <button
            v-if="!isEditingNote && hasServiceValue(noteContent)"
            type="button"
            class="note-action-btn"
            title="复制备注内容"
            @click="copyNote"
          >
            <el-icon><CopyDocument /></el-icon>复制
          </button>
          <button
            v-if="!isEditingNote"
            type="button"
            class="note-action-btn edit"
            title="编辑备注"
            @click="startEditNote"
          >
            <el-icon><EditPen /></el-icon>编辑
          </button>
        </div>
      </div>

      <div v-if="!isEditingNote" class="note-display-box">
        <pre class="note-text-content">{{ noteContent }}</pre>
      </div>

      <div v-else class="note-edit-box">
        <el-input
          v-model="noteContent"
          type="textarea"
          :rows="6"
          placeholder="输入此服务的运维备注、内部端口、账号密码说明或注意事项..."
          maxlength="2000"
          show-word-limit
        />
      </div>
    </div>
    <template #footer>
      <div class="note-dialog-footer">
        <template v-if="isEditingNote">
          <el-button @click="cancelEditNote">取消</el-button>
          <el-button type="primary" :loading="noteSaving" @click="saveNote">保存备注</el-button>
        </template>
        <template v-else>
          <el-button @click="noteDialogVisible = false">关闭</el-button>
          <el-button type="primary" @click="startEditNote">编辑备注</el-button>
        </template>
      </div>
    </template>
  </el-dialog>
</template>
<style src="../styles/dashboard.css"></style>
