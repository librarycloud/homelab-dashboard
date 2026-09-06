import { defineStore } from 'pinia'
import { settingsApi } from '../api'
import { DEFAULT_SETTINGS, applySettings } from '../appSettings'
import { applyPrimaryColor, normalizePrimary } from '../theme'

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    settings: { ...DEFAULT_SETTINGS },
    loaded: false,
    loading: false
  }),
  getters: {
    siteName: (state) => state.settings.siteName,
    siteSubtitle: (state) => state.settings.siteSubtitle,
    primaryColor: (state) => state.settings.primaryColor,
    checking: (state) => state.settings.checking,
    checkInterval: (state) => state.settings.checkInterval,
    versionChecking: (state) => state.settings.versionChecking,
    versionCheckInterval: (state) => state.settings.versionCheckInterval,
    sessionTtlHours: (state) => state.settings.sessionTtlHours,
    notifications: (state) => state.settings.notifications,
    categories: (state) => state.settings.categories
  },
  actions: {
    async fetchSettings(force = false) {
      if (this.loaded && !force) return this.settings
      this.loading = true
      try {
        const data = await settingsApi.get()
        this.settings = applySettings(data)
        this.loaded = true
      } catch (error) {
        console.error('Failed to load settings:', error)
      } finally {
        this.loading = false
      }
      return this.settings
    },
    async updateSettings(changes) {
      this.loading = true
      try {
        const updated = await settingsApi.update(changes)
        this.settings = applySettings(updated)
        this.loaded = true
        window.dispatchEvent(new CustomEvent('homelab-settings-changed', { detail: this.settings }))
        return this.settings
      } finally {
        this.loading = false
      }
    },
    previewPrimary(color) {
      const normalized = normalizePrimary(color)
      this.settings.primaryColor = normalized
      applyPrimaryColor(normalized)
    }
  }
})
