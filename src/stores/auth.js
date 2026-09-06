import { defineStore } from 'pinia'
import { authApi } from '../api'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    isAuthenticated: false,
    checked: false,
    loading: false
  }),
  actions: {
    async checkAuth(force = false) {
      if (this.checked && !force) {
        return this.isAuthenticated
      }
      this.loading = true
      try {
        const res = await authApi.me()
        this.user = res.user
        this.isAuthenticated = true
      } catch {
        this.user = null
        this.isAuthenticated = false
      } finally {
        this.checked = true
        this.loading = false
      }
      return this.isAuthenticated
    },
    async login(credentials) {
      this.loading = true
      try {
        const res = await authApi.login(credentials)
        this.user = res.user
        this.isAuthenticated = true
        this.checked = true
        return res
      } finally {
        this.loading = false
      }
    },
    async logout() {
      try {
        await authApi.logout()
      } finally {
        this.user = null
        this.isAuthenticated = false
        this.checked = true
      }
    },
    setUnauthenticated() {
      this.user = null
      this.isAuthenticated = false
      this.checked = true
    }
  }
})
