import { computed, reactive, ref } from 'vue'
import { createStorage } from '../services/storage'
import { config, seed } from '../data'
import { clearPhotos, deletePhoto, loadPhotos, savePhoto } from '../services/photos'

const storage = createStorage(config.storageKey, seed)
export function useKeeper() {
  const state = reactive(storage.read())
  const photos = reactive({})
  const persistError = ref('')
  const persist = () => {
    const ok = storage.write(state)
    persistError.value = ok ? '' : '保存失败：浏览器本地存储空间不足，本次修改刷新后可能丢失。可以删除一些旧菜谱照片，或清理浏览器存储后重试。'
    return ok
  }
  // 启动时把照片从 IndexedDB 读进内存，并把旧版本直接塞在菜谱记录里的
  // base64 照片迁移过去；迁移失败则保留原样，photoOf 依然能显示。
  ;(async () => {
    try {
      Object.assign(photos, await loadPhotos())
    } catch {
      return // IndexedDB 不可用时，旧的内联照片照常显示
    }
    let migrated = false
    for (const doc of state.documents) {
      if (typeof doc.photo === 'string' && doc.photo.startsWith('data:')) {
        try {
          await savePhoto(doc.id, doc.photo)
          photos[doc.id] = doc.photo
          delete doc.photo
          migrated = true
        } catch { /* 空间不足时保留内联数据，下次启动再迁移 */ }
      }
    }
    if (migrated) persist()
  })()
  const photoOf = (item) => photos[item?.id] || (typeof item?.photo === 'string' && item.photo.startsWith('data:') ? item.photo : '')
  const setPhoto = async (id, dataUrl) => { await savePhoto(id, dataUrl); photos[id] = dataUrl }
  const removePhoto = async (id) => { try { await deletePhoto(id) } catch { /* 忽略，内存中同样移除 */ } delete photos[id] }
  const add = (collection, item) => { state[collection].unshift({ id: `${collection}-${Date.now()}`, createdAt: new Date().toISOString(), ...item }); return persist() }
  const update = (collection, id, patch) => { const item = state[collection].find((entry) => entry.id === id); if (item) Object.assign(item, patch); return persist() }
  const remove = (collection, id) => { state[collection] = state[collection].filter((entry) => entry.id !== id); removePhoto(id); return persist() }
  const reset = () => { Object.assign(state, structuredClone(seed)); Object.keys(photos).forEach((key) => delete photos[key]); clearPhotos().catch(() => {}); return persist() }
  const metrics = computed(() => config.metrics.map((metric) => ({ ...metric, value: metric.value ? metric.value(state) : state[metric.collection]?.length || 0 })))
  return { state, photos, photoOf, setPhoto, removePhoto, persistError, add, update, remove, reset, persist, metrics }
}
