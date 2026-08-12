<script setup>
import { ref } from 'vue'
import { Lock, User, ArrowRight } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { authApi } from '../api'

const router = useRouter()
const route = useRoute()
const username = ref('admin')
const password = ref('')
const loading = ref(false)

async function submit() {
  if (!username.value.trim() || !password.value) {
    ElMessage.warning('请输入用户名和密码')
    return
  }
  loading.value = true
  try {
    await authApi.login({ username: username.value.trim(), password: password.value })
    ElMessage.success('登录成功')
    await router.replace(typeof route.query.redirect === 'string' ? route.query.redirect : '/')
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    loading.value = false
  }
}
</script>
<template>
  <div class="login-page">
    <div class="login-orbit"></div>
    <div class="login-box">
      <div class="brand login-brand"><div class="brand-mark">H</div><div><strong>HomeLab</strong><span>CONTROL CENTER</span></div></div>
      <h1>欢迎回来</h1>
      <p>登录你的家庭实验室控制中心</p>
      <el-form @submit.prevent="submit">
        <el-form-item><el-input v-model="username" size="large" placeholder="用户名" autocomplete="username"><template #prefix><el-icon><User /></el-icon></template></el-input></el-form-item>
        <el-form-item><el-input v-model="password" size="large" type="password" placeholder="密码" autocomplete="current-password" show-password @keyup.enter="submit"><template #prefix><el-icon><Lock /></el-icon></template></el-input></el-form-item>
        <el-button native-type="submit" type="primary" size="large" class="login-btn" :loading="loading">登录控制台 <el-icon><ArrowRight /></el-icon></el-button>
      </el-form>
      <span class="login-note">本地环境 · 会话有效期 24 小时</span>
    </div>
  </div>
</template>
