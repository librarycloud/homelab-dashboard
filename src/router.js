import { createRouter, createWebHistory } from 'vue-router'
import Dashboard from './views/Dashboard.vue'
import Services from './views/Services.vue'
import Projects from './views/Projects.vue'
import Login from './views/Login.vue'
import { authApi } from './api'
import Settings from './views/Settings.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Dashboard },
    { path: '/services', component: Services },
    { path: '/projects', component: Projects },
    { path: '/settings', component: Settings },
    { path: '/login', component: Login }
  ]
})

router.beforeEach(async (to) => {
  if (to.path === '/login') {
    try { await authApi.me(); return '/' } catch { return true }
  }
  try { await authApi.me(); return true } catch {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
})

export default router
