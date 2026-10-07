export function createStorage(key, seed) {
  const read = () => { try { return JSON.parse(localStorage.getItem(key)) || structuredClone(seed) } catch { return structuredClone(seed) } }
  // 写入可能因超出 localStorage 配额失败，返回成功与否而不是静默抛错
  const write = (value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true } catch { return false } }
  return { read, write }
}
