// 图片处理：读取后在本地用 canvas 压缩，避免把整张原图（可能几 MB～几十 MB）
// 以 base64 形式直接塞进 localStorage。

export class ImageProcessError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ImageProcessError'
  }
}

// 压缩后的单张照片上限（base64 存入 localStorage 前的字节数）
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024
// 原图兜底上限，防止解码过大的图片导致页面卡死
const SOURCE_LIMIT = 20 * 1024 * 1024
const MAX_EDGE = 1280
const MIN_EDGE = 480
const OUTPUT_TYPE = 'image/jpeg'

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// data URL 实际占用的字节数（base64 解码后大小）
export function dataUrlBytes(dataUrl) {
  if (typeof dataUrl !== 'string') return 0
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return dataUrl.length
  const head = dataUrl.slice(0, comma)
  const body = dataUrl.slice(comma + 1)
  if (!head.includes('base64')) return body.length
  const padding = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((body.length * 3) / 4) - padding)
}

export const photoBytes = dataUrlBytes

export function isPhoto(value) {
  return typeof value === 'string' && /^data:image\/|^blob:|^https?:\/\//.test(value)
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new ImageProcessError('图片读取失败，文件可能已损坏或不是有效图片。'))
    img.src = url
  })
}

function drawToCanvas(img, edge) {
  const scale = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight))
  const width = Math.max(1, Math.round(img.naturalWidth * scale))
  const height = Math.max(1, Math.round(img.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  // JPEG 不支持透明，先铺白底（PNG 透明图不会变黑）
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)
  return canvas
}

// 核心压缩流程：先降质量，仍超限时再缩小尺寸，直到满足上限或无法继续
async function compressImageUrl(url, maxBytes) {
  const img = await loadImage(url)
  let edge = MAX_EDGE
  let quality = 0.85
  let canvas = drawToCanvas(img, edge)
  let output = canvas.toDataURL(OUTPUT_TYPE, quality)
  let guard = 0
  while (dataUrlBytes(output) > maxBytes && guard < 12) {
    guard += 1
    if (quality > 0.4) {
      quality -= 0.15
    } else if (edge > MIN_EDGE) {
      edge = Math.round(edge * 0.8)
      quality = 0.7
      canvas = drawToCanvas(img, edge)
    } else {
      break
    }
    output = canvas.toDataURL(OUTPUT_TYPE, quality)
  }
  const bytes = dataUrlBytes(output)
  if (bytes > maxBytes) {
    throw new ImageProcessError(
      `图片压缩后仍有约 ${formatBytes(bytes)}，超过单张 ${formatBytes(maxBytes)} 的上限，请换一张内容更简单或尺寸更小的图片。`
    )
  }
  return { dataUrl: output, bytes, width: canvas.width, height: canvas.height }
}

export async function processImageFile(file, maxBytes = MAX_PHOTO_BYTES) {
  if (!file || file.size === 0) throw new ImageProcessError('图片内容为空，请重新选择。')
  if (!file.type.startsWith('image/')) {
    throw new ImageProcessError('请选择图片文件（支持 JPG、PNG、WebP 等格式）。')
  }
  if (file.size > SOURCE_LIMIT) {
    throw new ImageProcessError(
      `原图过大（${formatBytes(file.size)}），为避免浏览器卡顿，请选择 20MB 以内的图片。`
    )
  }
  const objectUrl = URL.createObjectURL(file)
  try {
    return await compressImageUrl(objectUrl, maxBytes)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

// 用于压缩旧菜谱里已经保存的超大照片（历史数据可能是未经压缩的原图 data URL）
export function compressDataUrl(dataUrl, maxBytes = MAX_PHOTO_BYTES) {
  return compressImageUrl(dataUrl, maxBytes)
}
