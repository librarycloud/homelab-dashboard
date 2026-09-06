import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from './stores/auth'

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
  const authStore = useAuthStore()
  if (!authStore.checked) {
    await authStore.checkAuth()
  }

  if (to.path === '/login') {
    if (authStore.isAuthenticated) return '/'
    return true
  }

  if (!authStore.isAuthenticated) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  return true
})

export default router
