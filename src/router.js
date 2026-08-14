import { createRouter, createWebHistory } from 'vue-router'
import { authApi } from './api'

const Dashboard = () => import('./views/Dashboard.vue')
const Services = () => import('./views/Services.vue')
const Projects = () => import('./views/Projects.vue')
const Login = () => import('./views/Login.vue')
const Settings = () => import('./views/Settings.vue')

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
