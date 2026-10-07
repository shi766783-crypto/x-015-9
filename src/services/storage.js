import { formatBytes } from './image.js'

export class StorageQuotaError extends Error {
  constructor(detail) {
    super(detail?.message || '本地存储空间不足')
    this.name = 'StorageQuotaError'
    this.needed = detail?.needed
    this.available = detail?.available
  }
}

// 单域名 localStorage 通常为 5MB 左右；保守按 4.5MB 规划，给其他键留余量
export const STORAGE_BUDGET = 4.5 * 1024 * 1024

function isQuotaError(error) {
  return error && (
    error.name === 'QuotaExceededError' ||
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    error.code === 22 ||
    error.code === 1014
  )
}

// 当前 localStorage 全部数据占用的字节数（UTF-16 两个字节一个字符）
export function storageUsage() {
  let total = 0
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    total += (key.length + localStorage.getItem(key).length) * 2
  }
  return total
}

export function storageFree() {
  return Math.max(0, STORAGE_BUDGET - storageUsage())
}

export function createStorage(key, seed) {
  const read = () => {
    try {
      return JSON.parse(localStorage.getItem(key)) || structuredClone(seed)
    } catch {
      return structuredClone(seed)
    }
  }

  // 写入前先预演一次：能算出占用、还能在浏览器真正拒绝前给出明确提示
  const write = (value) => {
    const serialized = JSON.stringify(value)
    const previousSize = localStorage.getItem(key) ? (key.length + localStorage.getItem(key).length) * 2 : 0
    const projected = storageUsage() - previousSize + (key.length + serialized.length) * 2
    if (projected > STORAGE_BUDGET) {
      throw new StorageQuotaError({
        message:
          `保存后照片将占用约 ${formatBytes((key.length + serialized.length) * 2)}，` +
          `本机存储空间只剩约 ${formatBytes(storageFree())}，已超出上限。请删除或更换其他菜谱的照片后再保存。`
      })
    }
    try {
      localStorage.setItem(key, serialized)
    } catch (error) {
      if (isQuotaError(error)) {
        throw new StorageQuotaError({
          message:
            '浏览器本地存储空间已满，照片没有保存。可以换一张更小的图片，或删除其他菜谱的照片后重试。'
        })
      }
      throw error
    }
  }

  return { read, write }
}
