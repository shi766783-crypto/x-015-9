// 照片存储：图片统一存进 IndexedDB（容量远大于 localStorage 的约 5MB 上限），
// 菜谱记录本身只保留文本字段，避免超长 base64 撑爆本地存储。
const DB_NAME = 'family-recipe-keeper-photos'
const STORE = 'photos'

export const PHOTO_MAX_DIM = 1280 // 最长边像素，超出会等比压缩
export const PHOTO_QUALITY = 0.85 // JPEG 压缩质量
export const PHOTO_SKIP_BYTES = 300 * 1024 // 小于该体积的原图直接使用，不再压缩
export const PHOTO_WARN_BYTES = 1024 * 1024 // 超过该体积给出“偏大”提示
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024 // 压缩后仍超过该体积则拒绝保存

let dbPromise
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

function run(mode, action) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const req = action(tx.objectStore(STORE))
    tx.oncomplete = () => resolve(req && req.result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new Error('照片写入被中止'))
  }))
}

export const savePhoto = (id, dataUrl) => run('readwrite', (store) => store.put(dataUrl, id))
export const deletePhoto = (id) => run('readwrite', (store) => store.delete(id))
export const clearPhotos = () => run('readwrite', (store) => store.clear())

export function loadPhotos() {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    const keysReq = store.getAllKeys()
    const valuesReq = store.getAll()
    tx.oncomplete = () => {
      const map = {}
      keysReq.result.forEach((key, i) => { map[key] = valuesReq.result[i] })
      resolve(map)
    }
    tx.onerror = () => reject(tx.error)
  }))
}

// 估算 base64 照片的实际字节数
export function dataUrlBytes(dataUrl) {
  const i = dataUrl.indexOf(',')
  return Math.max(0, Math.round((dataUrl.length - i - 1) * 3 / 4))
}

export function formatSize(bytes) {
  if (!bytes) return '0 KB'
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

// 读取用户选择的图片：小图直接用原图，大图等比压缩成 JPEG。
// 返回 { dataUrl, bytes }；压缩后仍超限会抛出 too-large，由界面提示用户。
export async function processPhotoFile(file) {
  if (!file.type.startsWith('image/')) throw new Error('not-image')
  if (file.size <= PHOTO_SKIP_BYTES) {
    const dataUrl = await readAsDataUrl(file)
    return { dataUrl, bytes: file.size }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('bad-image'))
      image.src = url
    })
    if (!img.width || !img.height) throw new Error('bad-image')
    const scale = Math.min(1, PHOTO_MAX_DIM / Math.max(img.width, img.height))
    const width = Math.max(1, Math.round(img.width * scale))
    const height = Math.max(1, Math.round(img.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)
    const dataUrl = canvas.toDataURL('image/jpeg', PHOTO_QUALITY)
    const bytes = dataUrlBytes(dataUrl)
    if (bytes > PHOTO_MAX_BYTES) throw new Error('too-large')
    return { dataUrl, bytes }
  } finally {
    URL.revokeObjectURL(url)
  }
}
