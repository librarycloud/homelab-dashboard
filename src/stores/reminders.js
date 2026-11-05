import { defineStore } from 'pinia'
import { ref } from 'vue'
import { reminderApi } from '../api'

export const useRemindersStore = defineStore('reminders', () => {
  const reminders = ref([])
  const loading = ref(false)

  async function fetchReminders() {
    loading.value = true
    try {
      reminders.value = await reminderApi.list()
    } finally {
      loading.value = false
    }
  }

  async function addReminder(payload) {
    const data = await reminderApi.create(payload)
    reminders.value.push(data)
    return data
  }

  async function updateReminder(id, payload) {
    const data = await reminderApi.update(id, payload)
    const idx = reminders.value.findIndex((r) => r.id === id)
    if (idx !== -1) reminders.value[idx] = data
    return data
  }

  async function removeReminder(id) {
    await reminderApi.remove(id)
    reminders.value = reminders.value.filter((r) => r.id !== id)
  }

  async function reorder(ids) {
    reminders.value = await reminderApi.reorder(ids)
  }

  return { reminders, loading, fetchReminders, addReminder, updateReminder, removeReminder, reorder }
})
