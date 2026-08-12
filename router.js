import { createRouter, createWebHistory } from 'vue-router'
import Dashboard from './views/Dashboard.vue'
import Services from './views/Services.vue'
import Projects from './views/Projects.vue'
import Login from './views/Login.vue'

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Dashboard },
    { path: '/services', component: Services },
    { path: '/projects', component: Projects },
    { path: '/login', component: Login }
  ]
})
