<script setup>
import { computed, onMounted, ref } from 'vue'
import {
  AlarmClock,
  ArrowDown,
  ArrowUp,
  Bell,
  Calendar,
  Check,
  CirclePlus,
  Clock,
  Delete,
  Edit,
  Link,
  MoreFilled,
  Refresh,
  Warning
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
import { marked } from 'marked'
import { useRemindersStore } from '../stores/reminders'

// Configure marked: open links in new tab
const renderer = new marked.Renderer()
renderer.link = ({ href, title, text }) => {
  const titleAttr = title ? ` title="${title}"` : ''
  return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="desc-link"${titleAttr}>${text}</a>`
}
marked.setOptions({ renderer, breaks: true })

const store = useRemindersStore()
const reminders = computed(() => store.reminders)
const loading = computed(() => store.loading)

// ── Filters & Counts ─────────────────────────────────────
const filterStatus = ref('全部')
const filterCat = ref('全部')

const counts = computed(() => {
  let pending = 0
  let active = 0
  let done = 0

  reminders.value.forEach((r) => {
    if (r.status === 'done') {
      done++
    } else {
      pending++
      const state = getReminderState(r)
      if (state.isActive) {
        active++
      }
    }
  })

  return {
    all: reminders.value.length,
    pending,
    active,
    done
  }
})

const statusFilters = computed(() => [
  { key: '全部', label: '全部', count: counts.value.all },
  { key: '待办', label: '待办', count: counts.value.pending },
  { key: '办理中', label: '办理中', count: counts.value.active },
  { key: '已完成', label: '已完成', count: counts.value.done }
])

const categoryList = computed(() => {
  return [...new Set(reminders.value.map((r) => r.category).filter(Boolean))]
})

const allCategories = computed(() => {
  return ['全部', ...categoryList.value]
})

const visibleReminders = computed(() => {
  const filtered = reminders.value.filter((r) => {
    const state = getReminderState(r)
    let matchStatus = true
    if (filterStatus.value === '待办') {
      matchStatus = r.status !== 'done'
    } else if (filterStatus.value === '办理中') {
      matchStatus = r.status !== 'done' && state.isActive
    } else if (filterStatus.value === '已完成') {
      matchStatus = r.status === 'done'
    }

    const matchCat = filterCat.value === '全部' || r.category === filterCat.value
    return matchStatus && matchCat
  })

  // Sort:
  // 1. Incomplete first, completed (done) at the back
  // 2. Earliest deadline / due date first
  return [...filtered].sort((a, b) => {
    const aDone = a.status === 'done' ? 1 : 0
    const bDone = b.status === 'done' ? 1 : 0
    if (aDone !== bDone) return aDone - bDone

    const winA = getPeriodInfo(a)
    const winB = getPeriodInfo(b)
    const timeA = winA?.end ? winA.end.getTime() : Infinity
    const timeB = winB?.end ? winB.end.getTime() : Infinity

    if (timeA !== timeB) return timeA - timeB

    return (b.id || 0) - (a.id || 0)
  })
})

// ── Window & Urgency calculation ─────────────────────────
function getPeriodInfo(r) {
  const now = new Date()
  const currentYear = now.getFullYear()
  const msPerDay = 86400000

  if (r.recur_type === 'once') {
    if (!r.due_date) return null
    const start = r.start_date ? new Date(r.start_date) : null
    const end = new Date(r.due_date)
    end.setHours(23, 59, 59, 999)
    return { start, end, isPeriod: Boolean(start) }
  }

  if (r.recur_type === 'yearly' && r.recur_month && r.recur_day) {
    const hasStart = Boolean(r.start_month && r.start_day)
    const isCrossYear = hasStart && (r.start_month > r.recur_month || (r.start_month === r.recur_month && r.start_day > r.recur_day))

    let year = currentYear
    let start = hasStart ? new Date(year, r.start_month - 1, r.start_day, 0, 0, 0) : null
    let end = new Date(year, r.recur_month - 1, r.recur_day, 23, 59, 59)

    if (isCrossYear) {
      if (now <= end) {
        start = new Date(year - 1, r.start_month - 1, r.start_day, 0, 0, 0)
      } else {
        start = new Date(year, r.start_month - 1, r.start_day, 0, 0, 0)
        end = new Date(year + 1, r.recur_month - 1, r.recur_day, 23, 59, 59)
      }
    } else {
      if (now > end) {
        if (r.status !== 'done' && (now.getTime() - end.getTime()) < 60 * msPerDay) {
          // Keep current year window as overdue
        } else {
          year += 1
          if (hasStart) start = new Date(year, r.start_month - 1, r.start_day, 0, 0, 0)
          end = new Date(year, r.recur_month - 1, r.recur_day, 23, 59, 59)
        }
      }
    }
    return { start, end, isPeriod: hasStart }
  }

  if (r.recur_type === 'monthly' && r.recur_day) {
    let y = now.getFullYear()
    let m = now.getMonth()
    const hasStart = Boolean(r.start_day)
    let start = hasStart ? new Date(y, m, r.start_day, 0, 0, 0) : null
    let end = new Date(y, m, r.recur_day, 23, 59, 59)
    if (now > end) {
      if (r.status !== 'done' && (now.getTime() - end.getTime()) < 15 * msPerDay) {
        // Overdue
      } else {
        m += 1
        if (hasStart) start = new Date(y, m, r.start_day, 0, 0, 0)
        end = new Date(y, m, r.recur_day, 23, 59, 59)
      }
    }
    return { start, end, isPeriod: hasStart }
  }

  return null
}

function getReminderState(r) {
  if (r.status === 'done') {
    return {
      level: 'done',
      label: '已完成',
      badgeClass: 'level-done',
      progress: 100,
      isActive: false
    }
  }

  const win = getPeriodInfo(r)
  if (!win || !win.end) {
    return { level: 'ok', label: '—', badgeClass: 'level-ok', progress: 0, isActive: false }
  }

  const now = Date.now()
  const msPerDay = 86400000

  // 1. Period with start & end
  if (win.start) {
    const daysToStart = Math.ceil((win.start.getTime() - now) / msPerDay)
    const daysToEnd = Math.ceil((win.end.getTime() - now) / msPerDay)

    if (now < win.start.getTime()) {
      return {
        level: daysToStart <= 7 ? 'warning' : 'ok',
        label: daysToStart <= 1 ? '明天开始办理' : `还有 ${daysToStart} 天开始`,
        badgeClass: daysToStart <= 7 ? 'level-warning' : 'level-upcoming',
        daysToStart,
        daysToEnd,
        progress: 0,
        isUpcoming: true,
        isActive: false
      }
    }

    if (now >= win.start.getTime() && now <= win.end.getTime()) {
      const totalDays = Math.max(1, Math.ceil((win.end.getTime() - win.start.getTime()) / msPerDay))
      const elapsedDays = Math.max(0, Math.ceil((now - win.start.getTime()) / msPerDay))
      const progress = Math.min(100, Math.max(5, Math.round((elapsedDays / totalDays) * 100)))

      if (daysToEnd <= 3) {
        return {
          level: 'critical',
          label: daysToEnd <= 0 ? '今日截止！' : `最后 ${daysToEnd} 天截止！`,
          badgeClass: 'level-critical',
          daysToEnd,
          totalDays,
          elapsedDays,
          progress,
          isActive: true
        }
      }
      if (daysToEnd <= 7) {
        return {
          level: 'warning',
          label: `办理期中 · 还剩 ${daysToEnd} 天`,
          badgeClass: 'level-warning',
          daysToEnd,
          totalDays,
          elapsedDays,
          progress,
          isActive: true
        }
      }
      return {
        level: 'active',
        label: `办理期中 · 还剩 ${daysToEnd} 天`,
        badgeClass: 'level-active',
        daysToEnd,
        totalDays,
        elapsedDays,
        progress,
        isActive: true
      }
    }

    // Passed deadline
    return {
      level: 'critical',
      label: '已截止 / 逾期',
      badgeClass: 'level-critical',
      progress: 100,
      isExpired: true,
      isActive: false
    }
  }

  // 2. Single point in time deadline
  const days = Math.ceil((win.end.getTime() - now) / msPerDay)
  if (days < 0) return { level: 'critical', label: '已逾期！', badgeClass: 'level-critical', days, isActive: false }
  if (days === 0) return { level: 'critical', label: '今天截止！', badgeClass: 'level-critical', days, isActive: false }
  if (days <= 3) return { level: 'critical', label: `仅剩 ${days} 天`, badgeClass: 'level-critical', days, isActive: false }
  if (days <= (r.remind_days_before ?? 30)) return { level: 'warning', label: `还有 ${days} 天`, badgeClass: 'level-warning', days, isActive: false }
  return { level: 'ok', label: `还有 ${days} 天`, badgeClass: 'level-ok', days, isActive: false }
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

function recurLabel(r) {
  if (r.recur_type === 'yearly') {
    return (r.start_month && r.start_day) ? '每年周期 · 时间段' : '每年重复'
  }
  if (r.recur_type === 'monthly') {
    return r.start_day ? '每月周期 · 时间段' : '每月重复'
  }
  if (r.recur_type === 'once') {
    return r.start_date ? '单次 · 时间段' : '单次'
  }
  return '—'
}

// ── Markdown renderer & Fold/Expand ───────────────────────
function renderMd(text) {
  if (!text) return ''
  return marked.parse(text)
}

const expandedMap = ref({})

function isExpanded(id) {
  return Boolean(expandedMap.value[id])
}

function toggleExpand(id) {
  expandedMap.value[id] = !expandedMap.value[id]
}

function isLongDesc(text) {
  if (!text) return false
  const trimmed = text.trim()
  const lines = trimmed.split('\n').filter(Boolean)
  return trimmed.length > 100 || lines.length > 2
}

function statusTagInfo(r) {
  if (r.status === 'done') {
    return { label: '已完成', className: 'status-done' }
  }
  const state = getReminderState(r)
  if (state.isActive) {
    return { label: '办理中', className: 'status-active' }
  }
  return { label: '待办', className: 'status-pending' }
}

function handleTopClick(r, event) {
  if (!isLongDesc(r.description)) return
  if (event.target.closest('button, a, .el-dropdown, .done-check, .action-link-btn, .card-menu, input, textarea')) {
    return
  }
  const sel = window.getSelection()?.toString()
  if (sel && sel.length > 0) return

  toggleExpand(r.id)
}

// ── Dialog form ───────────────────────────────────────────
const dialogVisible = ref(false)
const isEditing = ref(false)
const saving = ref(false)
const editingId = ref(null)

const EMPTY_FORM = () => ({
  title: '',
  description: '',
  category: '',
  date_mode: 'period', // 'period' | 'single'
  recur_type: 'yearly',
  start_month: null,
  start_day: null,
  recur_month: null,
  recur_day: null,
  start_date: null,
  due_date: null,
  remind_days_before: 30,
  status: 'pending',
  action_url: '',
  action_label: ''
})
const form = ref(EMPTY_FORM())

function openAdd() {
  form.value = EMPTY_FORM()
  isEditing.value = false
  editingId.value = null
  dialogVisible.value = true
}

function openEdit(r) {
  const hasPeriod = Boolean(
    (r.recur_type === 'yearly' && r.start_month && r.start_day) ||
    (r.recur_type === 'monthly' && r.start_day) ||
    (r.recur_type === 'once' && r.start_date)
  )

  form.value = {
    title: r.title || '',
    description: r.description || '',
    category: r.category || '',
    date_mode: hasPeriod ? 'period' : 'single',
    recur_type: r.recur_type || 'yearly',
    start_month: r.start_month ?? null,
    start_day: r.start_day ?? null,
    recur_month: r.recur_month ?? null,
    recur_day: r.recur_day ?? null,
    start_date: r.start_date ? new Date(r.start_date).toISOString().slice(0, 10) : null,
    due_date: r.due_date ? new Date(r.due_date).toISOString().slice(0, 10) : null,
    remind_days_before: r.remind_days_before ?? 30,
    status: r.status || 'pending',
    action_url: r.action_url || '',
    action_label: r.action_label || ''
  }
  isEditing.value = true
  editingId.value = r.id
  dialogVisible.value = true
}

function buildPayload() {
  const f = form.value
  const isPeriodMode = f.date_mode === 'period'

  return {
    title: f.title.trim(),
    description: f.description?.trim() || null,
    category: f.category?.trim() || null,
    recur_type: f.recur_type,
    start_month: (isPeriodMode && f.recur_type === 'yearly') ? (f.start_month || null) : null,
    start_day: (isPeriodMode && (f.recur_type === 'yearly' || f.recur_type === 'monthly')) ? (f.start_day || null) : null,
    recur_month: f.recur_type === 'yearly' ? (f.recur_month || null) : null,
    recur_day: (f.recur_type === 'yearly' || f.recur_type === 'monthly') ? (f.recur_day || null) : null,
    start_date: (isPeriodMode && f.recur_type === 'once') ? (f.start_date || null) : null,
    due_date: f.recur_type === 'once' ? (f.due_date || null) : null,
    remind_days_before: f.remind_days_before ?? 30,
    status: f.status,
    action_url: f.action_url?.trim() || null,
    action_label: f.action_label?.trim() || null
  }
}

async function save() {
  if (!form.value.title.trim()) return ElMessage.warning('请填写标题')
  saving.value = true
  try {
    if (isEditing.value) {
      await store.updateReminder(editingId.value, buildPayload())
      ElMessage.success('提醒已更新')
    } else {
      await store.addReminder(buildPayload())
      ElMessage.success('提醒已添加')
    }
    dialogVisible.value = false
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function toggleDone(r) {
  try {
    await store.updateReminder(r.id, { status: r.status === 'done' ? 'pending' : 'done' })
  } catch (e) {
    ElMessage.error(e.message || '操作失败')
  }
}

async function remove(r) {
  try {
    await ElMessageBox.confirm(`确定删除"${r.title}"？`, '删除提醒', {
      type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消'
    })
    await store.removeReminder(r.id)
    ElMessage.success('已删除')
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error(e.message || '删除失败')
  }
}

function handleMenu(cmd, r) {
  if (cmd === 'edit') openEdit(r)
  if (cmd === 'delete') remove(r)
  if (cmd === 'toggle') toggleDone(r)
}

function openUrl(url) {
  if (url) window.open(url.startsWith('http') ? url : `https://${url}`, '_blank', 'noopener')
}

onMounted(() => store.fetchReminders())
</script>

<template>
  <div class="page-head">
    <div>
      <p class="eyebrow">REMINDERS</p>
      <h1>提醒 &amp; 待办</h1>
      <p>管理税务合规、周期事项、时间段待办与续费</p>
    </div>
    <div class="heading-actions">
      <el-button class="refresh-btn" plain :loading="loading" @click="store.fetchReminders()">
        <el-icon><Refresh /></el-icon>刷新
      </el-button>
      <el-button type="primary" class="add-reminder-btn" @click="openAdd">
        <el-icon><CirclePlus /></el-icon>添加提醒
      </el-button>
    </div>
  </div>

  <!-- Filter bar -->
  <div class="reminders-toolbar">
    <div class="filter-tabs">
      <button
        v-for="s in statusFilters" :key="s.key"
        :class="{ selected: filterStatus === s.key }"
        @click="filterStatus = s.key"
      >
        <span>{{ s.label }}</span>
        <span class="tab-count">{{ s.count }}</span>
      </button>
    </div>
    <div v-if="categoryList.length > 0" class="cat-filters">
      <span class="cat-filter-label">分类:</span>
      <button
        v-for="c in allCategories" :key="c"
        class="cat-btn"
        :class="{ selected: filterCat === c }"
        @click="filterCat = c"
      >{{ c }}</button>
    </div>
  </div>

  <!-- Reminder cards -->
  <div v-loading="loading" class="reminders-list">
    <div v-if="!loading && !visibleReminders.length" class="reminders-empty">
      <el-icon><Bell /></el-icon>
      <span>暂无提醒，点击右上角"添加提醒"开始</span>
    </div>

    <article
      v-for="r in visibleReminders"
      :key="r.id"
      class="reminder-card"
      :class="[
        `urgency-${getReminderState(r).level}`,
        {
          done: r.status === 'done',
          'in-window': getReminderState(r).isActive,
          'has-long-desc': isLongDesc(r.description),
          'is-expanded': isExpanded(r.id)
        }
      ]"
    >
      <div class="reminder-main">
        <!-- 上半部分：点击可触发展开/折叠 -->
        <div
          class="reminder-top-area"
          :class="{ 'can-toggle': isLongDesc(r.description) }"
          :title="isLongDesc(r.description) ? (isExpanded(r.id) ? '点击顶部区域收起' : '点击顶部区域展开详情') : ''"
          @click="handleTopClick(r, $event)"
        >
          <div class="reminder-head">
          <!-- Checkbox -->
          <button
            type="button"
            class="done-check"
            :class="{ checked: r.status === 'done' }"
            :title="r.status === 'done' ? '标记为待办' : '标记为已完成'"
            @click="toggleDone(r)"
          >
            <el-icon v-if="r.status === 'done'"><Check /></el-icon>
          </button>

          <div class="reminder-title-wrap">
            <h3 class="reminder-title">{{ r.title }}</h3>
            <div class="reminder-tags">
              <span class="tag-status" :class="statusTagInfo(r).className">{{ statusTagInfo(r).label }}</span>
              <span v-if="r.category" class="tag-cat">{{ r.category }}</span>
              <span class="tag-recur">{{ recurLabel(r) }}</span>
            </div>
          </div>

          <!-- Urgency / Window badge -->
          <span class="urgency-badge" :class="getReminderState(r).badgeClass">
            <span v-if="getReminderState(r).isActive" class="pulse-dot"></span>
            <el-icon v-else-if="getReminderState(r).level === 'critical'"><Warning /></el-icon>
            {{ getReminderState(r).label }}
          </span>

          <!-- Menu -->
          <el-dropdown trigger="click" @command="(cmd) => handleMenu(cmd, r)">
            <button class="card-menu" title="更多操作">
              <el-icon class="more"><MoreFilled /></el-icon>
            </button>
            <template #dropdown>
              <el-dropdown-menu class="reminder-action-menu">
                <el-dropdown-item command="toggle">
                  {{ r.status === 'done' ? '标记为待办' : '标记为已完成' }}
                </el-dropdown-item>
                <el-dropdown-item command="edit">编辑</el-dropdown-item>
                <el-dropdown-item command="delete" divided>删除</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>

        <!-- Period / Due info row -->
        <div class="reminder-due-row">
          <el-icon><Calendar /></el-icon>
          <span class="due-text">{{ formatPeriodText(r) }}</span>
          <span v-if="!getReminderState(r).isPeriod" class="due-sep">·</span>
          <span v-if="!getReminderState(r).isPeriod" class="due-sub">提前 {{ r.remind_days_before }} 天提醒</span>
        </div>

        <!-- Period Progress Bar (shown when currently in window) -->
        <div v-if="getReminderState(r).isActive" class="period-progress-wrap">
          <div class="period-progress-bar">
            <div
              class="period-progress-fill"
              :style="{ width: `${getReminderState(r).progress}%` }"
              :class="getReminderState(r).level"
            ></div>
          </div>
          <div class="period-progress-meta">
            <span>窗口已开启 {{ getReminderState(r).elapsedDays }} 天</span>
            <span>共 {{ getReminderState(r).totalDays }} 天 · 距截止还剩 <strong>{{ getReminderState(r).daysToEnd }}</strong> 天</span>
          </div>
        </div>
      </div>

      <!-- 下半部分：描述区（独立，不监听折叠事件，方便用户选词复制） -->
      <div v-if="r.description" class="reminder-desc-container">
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div
          class="reminder-desc markdown-body"
          :class="{ 'is-collapsed': isLongDesc(r.description) && !isExpanded(r.id) }"
          v-html="renderMd(r.description)"
        />
        <button
          v-if="isLongDesc(r.description)"
          type="button"
          class="desc-expand-btn"
          @click.stop="toggleExpand(r.id)"
        >
          <span>{{ isExpanded(r.id) ? '收起详情' : '展开全文' }}</span>
          <el-icon><ArrowUp v-if="isExpanded(r.id)" /><ArrowDown v-else /></el-icon>
        </button>
      </div>

        <!-- Action button -->
        <div v-if="r.action_url" class="reminder-action">
          <button class="action-link-btn" @click="openUrl(r.action_url)">
            <el-icon><Link /></el-icon>
            {{ r.action_label || r.action_url }}
          </button>
        </div>
      </div>
    </article>
  </div>

  <!-- Add / Edit Dialog -->
  <el-dialog
    v-model="dialogVisible"
    :title="isEditing ? '编辑提醒' : '添加提醒'"
    width="580px"
    destroy-on-close
    class="reminder-dialog"
  >
    <div class="reminder-form">
      <div class="form-row">
        <label>标题 <span class="required">*</span></label>
        <el-input v-model="form.title" placeholder="例：IRS 报税、怀俄明年审、域名续费..." maxlength="200" show-word-limit />
      </div>

      <div class="form-row form-row-2">
        <div>
          <label>分类</label>
          <el-input v-model="form.category" placeholder="税务、合规、运维、订阅..." maxlength="50" />
        </div>
        <div>
          <label>状态</label>
          <el-select v-model="form.status" popper-class="homelab-select-popper" class="full-w">
            <el-option label="待办" value="pending" />
            <el-option label="已完成" value="done" />
            <el-option label="已暂缓" value="snoozed" />
          </el-select>
        </div>
      </div>

      <!-- Mode selection: Period vs Single date -->
      <div class="form-row">
        <label>时间模式</label>
        <div class="mode-selector">
          <button
            type="button"
            class="mode-btn"
            :class="{ active: form.date_mode === 'period' }"
            @click="form.date_mode = 'period'"
          >
            <strong>办理时间段（起止范围）</strong>
            <small>有固定窗口期（如 3/15 ~ 4/15 都可以去办）</small>
          </button>
          <button
            type="button"
            class="mode-btn"
            :class="{ active: form.date_mode === 'single' }"
            @click="form.date_mode = 'single'"
          >
            <strong>单一截止日</strong>
            <small>单一特定截止时间点（如 10月1日 到期）</small>
          </button>
        </div>
      </div>

      <div class="form-row">
        <label>重复频率</label>
        <el-select v-model="form.recur_type" popper-class="homelab-select-popper" class="full-w">
          <el-option label="每年重复" value="yearly" />
          <el-option label="每月重复" value="monthly" />
          <el-option label="单次" value="once" />
        </el-select>
      </div>

      <!-- Yearly + Period -->
      <div v-if="form.recur_type === 'yearly' && form.date_mode === 'period'" class="period-box">
        <div class="period-box-title">每年办理时间段设置：</div>
        <div class="form-row form-row-2">
          <div>
            <label>开始办理月份</label>
            <el-input-number v-model="form.start_month" :min="1" :max="12" placeholder="月" class="full-w" />
          </div>
          <div>
            <label>开始办理日期</label>
            <el-input-number v-model="form.start_day" :min="1" :max="31" placeholder="日" class="full-w" />
          </div>
        </div>
        <div class="period-sep-label">至</div>
        <div class="form-row form-row-2">
          <div>
            <label>截止办理月份</label>
            <el-input-number v-model="form.recur_month" :min="1" :max="12" placeholder="月" class="full-w" />
          </div>
          <div>
            <label>截止办理日期</label>
            <el-input-number v-model="form.recur_day" :min="1" :max="31" placeholder="日" class="full-w" />
          </div>
        </div>
        <span class="form-hint">例：填写开始与截止时间，在此期间内系统会显示「办理期中」</span>
      </div>

      <!-- Yearly + Single date -->
      <div v-if="form.recur_type === 'yearly' && form.date_mode === 'single'" class="form-row form-row-2">
        <div>
          <label>截止月份</label>
          <el-input-number v-model="form.recur_month" :min="1" :max="12" placeholder="月" class="full-w" />
        </div>
        <div>
          <label>截止日期</label>
          <el-input-number v-model="form.recur_day" :min="1" :max="31" placeholder="日" class="full-w" />
        </div>
      </div>

      <!-- Monthly + Period -->
      <div v-if="form.recur_type === 'monthly' && form.date_mode === 'period'" class="period-box">
        <div class="period-box-title">每月办理时间段设置：</div>
        <div class="form-row form-row-2">
          <div>
            <label>每月开始日</label>
            <el-input-number v-model="form.start_day" :min="1" :max="31" placeholder="日" class="full-w" />
          </div>
          <div>
            <label>每月截止日</label>
            <el-input-number v-model="form.recur_day" :min="1" :max="31" placeholder="日" class="full-w" />
          </div>
        </div>
        <span class="form-hint">例：每月 1 号至 10 号办理</span>
      </div>

      <!-- Monthly + Single date -->
      <div v-if="form.recur_type === 'monthly' && form.date_mode === 'single'" class="form-row">
        <label>每月截止日期</label>
        <el-input-number v-model="form.recur_day" :min="1" :max="31" placeholder="日" class="full-w" />
      </div>

      <!-- Once + Period -->
      <div v-if="form.recur_type === 'once' && form.date_mode === 'period'" class="form-row form-row-2">
        <div>
          <label>开始日期</label>
          <el-input v-model="form.start_date" type="date" class="full-w" />
        </div>
        <div>
          <label>截止日期</label>
          <el-input v-model="form.due_date" type="date" class="full-w" />
        </div>
      </div>

      <!-- Once + Single date -->
      <div v-if="form.recur_type === 'once' && form.date_mode === 'single'" class="form-row">
        <label>截止日期</label>
        <el-input v-model="form.due_date" type="date" class="full-w" />
      </div>

      <div class="form-row">
        <label>提前提醒（天）</label>
        <el-input-number v-model="form.remind_days_before" :min="0" :max="365" class="full-w" />
        <span class="form-hint">在到达办理时间前多少天开始预警提示</span>
      </div>

      <div class="form-row">
        <label>描述 / 操作步骤 (支持 Markdown)</label>
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="6"
          placeholder="支持 Markdown 语法：**加粗**、`代码`、- 列表、[链接文字](https://...)&#10;直接粘贴网址也会自动变成可点击链接"
          maxlength="2000"
          show-word-limit
        />
        <span class="form-hint">描述中的网址在新标签页直接打开</span>
      </div>

      <div class="form-row form-row-2">
        <div>
          <label>快捷跳转官网/操作页面</label>
          <el-input v-model="form.action_url" placeholder="https://..." maxlength="500" />
        </div>
        <div>
          <label>快捷按钮文字</label>
          <el-input v-model="form.action_label" placeholder="例：登录官网" maxlength="100" />
        </div>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">
          {{ isEditing ? '保存' : '添加' }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style src="../styles/reminders.css"></style>
