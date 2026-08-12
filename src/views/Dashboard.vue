<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { AlarmClock, Avatar, Bell, Box, Camera, Calendar, CircleCheck, Clock, Coin, Collection, Connection, CopyDocument, Cpu, DataAnalysis, DataBoard, Document, Download, Files, Film, Folder, FolderOpened, Grid, Headset, House, InfoFilled, Key, Link, Lock, Management, Message, Monitor, MoreFilled, Odometer, Picture, PieChart, Platform, Refresh, Setting, Share, ShoppingCart, Tickets, Tools, TopRight, TrendCharts, Upload, User, UserFilled, VideoCamera, VideoCameraFilled, Wallet, Warning, WarningFilled } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { serviceApi } from '../api'

const services = ref([])
const loading = ref(false)
const checkingId = ref(null)
const openFrpId = ref(null)
const filter = ref('全部')
const router = useRouter()
const filters = ['全部', '运行中', '有更新', '维护中']
const statusMeta = { 0: ['离线', 'info'], 1: ['运行中', 'success'], 2: ['告警', 'warning'], 3: ['异常', 'danger'], 4: ['维护中', 'info'] }
const serviceIconMap = { Monitor, Platform, Avatar, UserFilled, DataAnalysis, DataBoard, PieChart, Odometer, Cpu, Connection, House, Grid, Folder, FolderOpened, Picture, Camera, Calendar, Lock, Key, User, Message, Bell, Headset, Link, Share, Collection, Document, CopyDocument, Files, Download, Upload, AlarmClock, Film, VideoCamera, VideoCameraFilled, ShoppingCart, Coin, Tools, Setting, Management, Tickets, Box, Wallet, CircleCheck, Warning, InfoFilled }

const visibleServices = computed(() => services.value.filter((service) => {
  if (filter.value === '运行中') return service.status === 1
  if (filter.value === '有更新') return service.version_status === 2
  if (filter.value === '维护中') return service.status === 4
  return true
}).slice(0, 6))

function statusFor(value) { return statusMeta[value] || statusMeta[0] }
function serviceIcon(icon) { return serviceIconMap[icon] || Monitor }
function formatTime(value) { return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '尚未检测' }
function openUrl(url, defaultProtocol = 'https') { if (url) window.open(url.startsWith('http://') || url.startsWith('https://') ? url : `${defaultProtocol}://${url}`, '_blank', 'noopener') }
async function loadDashboard({ notify = false } = {}) { loading.value = true; try { services.value = notify ? await serviceApi.refresh() : await serviceApi.list(); if (notify) ElMessage.success('服务状态已刷新') } catch (error) { ElMessage.error(error.message) } finally { loading.value = false } }
async function checkVersion(service) { checkingId.value = service.id; try { const updated = await serviceApi.checkVersion(service.id); const index = services.value.findIndex((item) => item.id === updated.id); if (index >= 0) services.value.splice(index, 1, updated); ElMessage.success('版本检测完成') } catch (error) { await loadDashboard(); ElMessage.error(error.message || '版本检测失败') } finally { checkingId.value = null } }
async function removeService(service) { try { await ElMessageBox.confirm(`确定删除“${service.name}”吗？此操作不可恢复。`, '删除服务', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }); await serviceApi.remove(service.id); services.value = services.value.filter((item) => item.id !== service.id); ElMessage.success('服务已删除') } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error(error.message || '删除失败') } }
function handleServiceMenu(command, service) { if (command === 'check') return checkVersion(service); if (command === 'edit') return router.push({ path: '/services', query: { edit: service.id } }); if (command === 'delete') return removeService(service) }
function toggleFrp(service) { openFrpId.value = openFrpId.value === service.id ? null : service.id }
function closeFrpOutside(event) { if (!event.target.closest('.frp-info-wrap')) openFrpId.value = null }

onMounted(() => { loadDashboard(); document.addEventListener('click', closeFrpOutside) })
onBeforeUnmount(() => document.removeEventListener('click', closeFrpOutside))
</script>

<template>
  <div class="page-head"><div><div class="eyebrow">WORKSPACE · OVERVIEW <span class="live-dot"></span> LIVE</div><h1>系统总览</h1></div><div class="heading-actions"><el-button class="refresh-btn" plain :loading="loading" @click="loadDashboard({ notify: true })"><el-icon><Refresh /></el-icon>刷新状态</el-button><div class="filter-tabs"><button v-for="item in filters" :key="item" :class="{ selected: filter === item }" @click="filter = item">{{ item }}</button></div><router-link class="overview-link" to="/services">管理服务 <el-icon><TopRight /></el-icon></router-link></div></div>
  <section class="section overview-services-section">
    <div v-loading="loading" class="services-grid"><div v-if="!loading && !visibleServices.length" class="empty-state">暂无符合条件的服务，请前往“我的服务”添加或调整服务信息。</div><article v-for="service in visibleServices" :key="service.id" class="service-card"><div class="service-card-head"><div class="service-logo"><el-icon><component :is="serviceIcon(service.icon)" /></el-icon></div><div class="service-title"><h3>{{ service.name }}</h3><span>{{ service.description || '未填写描述' }}</span></div><el-dropdown trigger="click" @command="(command) => handleServiceMenu(command, service)"><button class="card-menu" title="更多操作"><el-icon class="more"><MoreFilled /></el-icon></button><template #dropdown><el-dropdown-menu class="service-action-menu"><el-dropdown-item command="check" :disabled="checkingId === service.id">{{ checkingId === service.id ? '检测中...' : '检测版本' }}</el-dropdown-item><el-dropdown-item command="edit">编辑服务</el-dropdown-item><el-dropdown-item command="delete" divided>删除服务</el-dropdown-item></el-dropdown-menu></template></el-dropdown></div><div class="service-meta"><el-tag :type="statusFor(service.status)[1]" effect="dark" size="small"><i class="status-dot"></i>{{ statusFor(service.status)[0] }}</el-tag><span class="category">{{ service.category || '未分类' }}</span><span class="updated"><Clock /> {{ formatTime(service.updated_at) }}</span></div><div class="version-row"><div><span>当前版本</span><strong>{{ service.local_version || '-' }}</strong></div><div v-if="service.remote_version" class="version-latest"><span>远程版本</span><strong>{{ service.remote_version }}</strong></div><div v-if="service.version_status === 2" class="update-pill">有新版本</div></div><div class="service-links"><button v-if="service.lan_url" @click="openUrl(service.lan_url, 'http')"><el-icon><Connection /></el-icon>内网访问</button><button v-if="service.wan_url" @click="openUrl(service.wan_url)"><el-icon><TopRight /></el-icon>公网访问</button><button v-if="service.github_url" @click="openUrl(service.github_url)"><el-icon><Box /></el-icon>GitHub</button><span v-if="service.frp_username || service.frp_password" class="frp-info-wrap"><button class="frp-info-button" type="button" title="查看 FRP 信息" @click.stop="toggleFrp(service)"><el-icon><Lock /></el-icon>FRP</button><span class="frp-info" :class="{ visible: openFrpId === service.id }"><strong>FRP 信息</strong><span>用户名：{{ service.frp_username || '未填写' }}</span><span>密码：{{ service.frp_password || '未填写' }}</span></span></span></div></article></div>
  </section>
</template>
