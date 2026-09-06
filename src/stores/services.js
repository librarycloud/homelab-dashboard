import { defineStore } from 'pinia'
import { serviceApi, systemApi } from '../api'
import { useSettingsStore } from './settings'

export const useServicesStore = defineStore('services', {
  state: () => ({
    services: [],
    loading: false,
    refreshing: false,
    checkingId: null,
    checkingAll: false,
    checkingProgress: 0,
    loaded: false,
    autoCheckTimer: null
  }),
  actions: {
    async fetchServices(force = false) {
      if (this.loaded && !force && this.services.length) {
        return this.services
      }
      this.loading = true
      try {
        this.services = await serviceApi.list()
        this.loaded = true
      } finally {
        this.loading = false
      }
      return this.services
    },
    async refreshStatus({ silent = false } = {}) {
      if (this.refreshing) return this.services
      this.refreshing = true
      if (!silent) this.loading = true
      try {
        this.services = await serviceApi.refresh()
        this.loaded = true
      } finally {
        this.refreshing = false
        if (!silent) this.loading = false
      }
      return this.services
    },
    async checkVersion(serviceId) {
      this.checkingId = serviceId
      try {
        const updated = await serviceApi.checkVersion(serviceId)
        const index = this.services.findIndex((s) => s.id === updated.id)
        if (index >= 0) this.services.splice(index, 1, updated)
        return updated
      } finally {
        this.checkingId = null
      }
    },
    async checkAllVersions(concurrency = 3) {
      if (this.checkingAll || !this.services.length) return { total: 0, success: 0, failed: 0 }
      this.checkingAll = true
      this.checkingProgress = 0
      const targets = [...this.services]
      let failed = 0
      let success = 0

      let currentIndex = 0
      const workers = Array.from({ length: Math.min(concurrency, targets.length) }, async () => {
        while (currentIndex < targets.length) {
          const index = currentIndex++
          const service = targets[index]
          try {
            const updated = await serviceApi.checkVersion(service.id)
            const listIndex = this.services.findIndex((s) => s.id === updated.id)
            if (listIndex >= 0) this.services.splice(listIndex, 1, updated)
            success++
          } catch {
            failed++
          } finally {
            this.checkingProgress++
          }
        }
      })

      try {
        await Promise.all(workers)
      } finally {
        this.checkingAll = false
        this.checkingProgress = 0
      }
      return { total: targets.length, success, failed }
    },
    async createService(payload) {
      const created = await serviceApi.create(payload)
      this.services.push(created)
      return created
    },
    async updateService(id, payload) {
      const updated = await serviceApi.update(id, payload)
      const index = this.services.findIndex((s) => s.id === updated.id)
      if (index >= 0) this.services.splice(index, 1, updated)
      return updated
    },
    async removeService(id) {
      await serviceApi.remove(id)
      this.services = this.services.filter((s) => s.id !== id)
    },
    async reorderServices(ids) {
      const reordered = await serviceApi.reorder(ids)
      this.services = reordered
      return reordered
    },
    async restoreBackup(payload) {
      const res = await systemApi.restore(payload)
      if (res.services) {
        this.services = res.services
        this.loaded = true
      }
      return res
    },
    startAutoCheck() {
      this.stopAutoCheck()
      const settingsStore = useSettingsStore()
      if (!settingsStore.checking) return
      const intervalMinutes = Number(settingsStore.checkInterval) || 30
      const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000
      this.autoCheckTimer = setInterval(() => {
        void this.refreshStatus({ silent: true })
      }, intervalMs)
    },
    stopAutoCheck() {
      if (this.autoCheckTimer) {
        clearInterval(this.autoCheckTimer)
        this.autoCheckTimer = null
      }
    }
  }
})
