<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Bell, Box, CircleCheck, Clock, Connection, DataAnalysis, Folder, Grid, House, Moon, Search, Setting, Sunny, User } from '@element-plus/icons-vue'

const route = useRoute(); const router = useRouter(); const dark = ref(true); const search = ref('')
const nav = [
  { label: '总览', path: '/', icon: House },
  { label: '我的服务', path: '/services', icon: Grid },
  { label: '项目管理', path: '/projects', icon: Folder }
]
const pageTitle = computed(() => route.path === '/' ? '总览' : route.path === '/services' ? '我的服务' : route.path === '/projects' ? '项目管理' : '登录')
function go(path) { router.push(path) }
</script>

<template>
  <div class="app-shell" :class="{ light: !dark }">
    <aside class="sidebar">
      <div class="brand"><div class="brand-mark">H</div><div><strong>HomeLab</strong><span>CONTROL CENTER</span></div></div>
      <div class="workspace-label">WORKSPACE</div>
      <nav>
        <button v-for="item in nav" :key="item.path" class="nav-item" :class="{ active: route.path === item.path }" @click="go(item.path)"><el-icon><component :is="item.icon" /></el-icon><span>{{ item.label }}</span></button>
      </nav>
      <div class="sidebar-bottom"><button class="nav-item"><el-icon><Setting /></el-icon><span>系统设置</span></button><div class="system-state"><i></i><span>系统运行正常</span><small>v0.1.0</small></div></div>
    </aside>
    <main class="main-area">
      <header class="topbar"><div class="mobile-brand"><div class="brand-mark">H</div><strong>HomeLab</strong></div><div class="crumb"><span>HomeLab</span><b>/</b><strong>{{ pageTitle }}</strong></div><div class="top-actions"><div class="search-box"><el-icon><Search /></el-icon><input v-model="search" placeholder="搜索服务..." /><kbd>⌘ K</kbd></div><button class="icon-btn" title="通知"><el-icon><Bell /></el-icon><i class="notice-dot"></i></button><button class="icon-btn" title="切换主题" @click="dark = !dark"><el-icon><Sunny v-if="dark" /><Moon v-else /></el-icon></button><div class="user-chip"><div class="avatar">A</div><div class="user-copy"><strong>admin</strong><span>管理员</span></div></div></div></header>
      <div class="mobile-tabs"><button v-for="item in nav" :key="item.path" :class="{ active: route.path === item.path }" @click="go(item.path)"><el-icon><component :is="item.icon" /></el-icon>{{ item.label }}</button></div>
      <div class="content"><router-view /></div>
    </main>
  </div>
</template>
