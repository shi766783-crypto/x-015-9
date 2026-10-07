import { computed, reactive } from 'vue'
import { createStorage } from '../services/storage'
import { config, seed } from '../data'

const storage = createStorage(config.storageKey, seed)
export function useKeeper() {
  const state = reactive(storage.read())
  const persist = () => storage.write(state)
  // 先改内存再持久化；一旦写入失败（如超出存储上限），回滚到修改前的状态，
  // 避免界面显示“已保存”但刷新后丢失
  const commit = (mutate) => {
    const snapshot = structuredClone(state)
    mutate()
    try {
      persist()
    } catch (error) {
      Object.assign(state, snapshot)
      throw error
    }
  }
  const add = (collection, item) => commit(() => {
    state[collection].unshift({ id: `${collection}-${Date.now()}`, createdAt: new Date().toISOString(), ...item })
  })
  const update = (collection, id, patch) => commit(() => {
    const item = state[collection].find((entry) => entry.id === id)
    if (item) Object.assign(item, patch)
  })
  const remove = (collection, id) => commit(() => {
    state[collection] = state[collection].filter((entry) => entry.id !== id)
  })
  const reset = () => commit(() => { Object.assign(state, structuredClone(seed)) })
  const metrics = computed(() => config.metrics.map((metric) => ({ ...metric, value: metric.value ? metric.value(state) : state[metric.collection]?.length || 0 })))
  return { state, add, update, remove, reset, persist, metrics }
}
