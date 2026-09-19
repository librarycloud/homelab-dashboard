import { defineStore } from 'pinia'
import { domainApi } from '../api'

export const useDomainsStore = defineStore('domains', {
  state: () => ({
    domains: [],
    dict: { registrars: [], dnsProviders: [] },
    loading: false
  }),

  actions: {
    async fetchDomains() {
      this.loading = true
      try {
        const data = await domainApi.list()
        this.domains = data
      } catch (error) {
        console.error('Failed to fetch domains', error)
      } finally {
        this.loading = false
      }
    },

    async fetchDict() {
      try {
        const data = await domainApi.getDict()
        this.dict = data
      } catch (error) {
        console.error('Failed to fetch dicts', error)
      }
    },

    async saveDict(dictPayload) {
      await domainApi.updateDict(dictPayload)
      this.dict = dictPayload
    },

    async renameCategory(oldName, newName) {
      await domainApi.renameCategory(oldName, newName)
      this.domains.forEach(d => {
        if (d.category === oldName) d.category = newName
      })
    },

    async deleteCategory(name) {
      await domainApi.deleteCategory(name)
      this.domains.forEach(d => {
        if (d.category === name) d.category = null
      })
    },

    async addDomain(domainData) {
      const data = await domainApi.create(domainData)
      this.domains.push(data)
      return data
    },

    async updateDomain(id, domainData) {
      const data = await domainApi.update(id, domainData)
      const index = this.domains.findIndex((d) => d.id === id)
      if (index !== -1) {
        this.domains[index] = data
      }
      return data
    },

    async deleteDomain(id) {
      await domainApi.remove(id)
      this.domains = this.domains.filter((d) => d.id !== id)
    },

    async refreshDomain(id) {
      const data = await domainApi.refresh(id)
      const index = this.domains.findIndex((d) => d.id === id)
      if (index !== -1) {
        this.domains[index] = data
      }
      return data
    },

    async reorderDomains(ids) {
      const original = [...this.domains]
      try {
        // Optimistic update
        this.domains.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
        const data = await domainApi.reorder(ids)
        this.domains = data
      } catch (error) {
        this.domains = original
        throw error
      }
    }
  }
})
