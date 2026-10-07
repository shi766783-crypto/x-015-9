<script setup>
import { computed, ref } from 'vue'
import { Archive, Award, Bell, BookOpen, CalendarClock, ChevronRight, CircleAlert, FilePlus2, FolderLock, ImagePlus, ImageUp, LayoutDashboard, LoaderCircle, Menu, Pencil, Plus, RotateCcw, Search, ShieldCheck, Trash2, TrendingUp, UserRound, X } from 'lucide-vue-next'
import { config, days } from './data'
import { useKeeper } from './composables/useKeeper'
import { StorageQuotaError, storageFree } from './services/storage'
import { compressDataUrl, dataUrlBytes, formatBytes, isPhoto, MAX_PHOTO_BYTES, processImageFile } from './services/image'
const { state, add, update, metrics, reset } = useKeeper()
const active = ref('overview'); const query = ref(''); const showForm = ref(false); const mobileOpen = ref(false); const draft = ref({})
const editingId = ref(null); const fileInput = ref(null); const formError = ref(''); const photoBusy = ref(false); const photoError = ref(''); const photoNote = ref('')
const activeNav = computed(() => config.nav.find((x) => x.id === active.value))
const docs = computed(() => state.documents.filter((x) => `${x.name}${x.holder}${x.category}`.toLowerCase().includes(query.value.toLowerCase())))
const alerts = computed(() => state.documents.map((x) => ({ ...x, remaining: days(x.expires) })).filter((x) => x.remaining <= 90).sort((a, b) => a.remaining - b.remaining))
const borrowed = computed(() => state.usages.filter((x) => x.status === '借用中'))
const completion = computed(() => Math.min(100, Math.round((state.documents.filter((x) => x.location && x.copyLocation).length / Math.max(state.documents.length, 1)) * 100)))
const editing = computed(() => (editingId.value ? state.documents.find((x) => x.id === editingId.value) : null))
const hasPhoto = computed(() => isPhoto(draft.value.photo))
const photoBytesNow = computed(() => dataUrlBytes(draft.value.photo))
const photoIsOversized = computed(() => hasPhoto.value && photoBytesNow.value > MAX_PHOTO_BYTES)
const photoLimitText = formatBytes(MAX_PHOTO_BYTES)
const photoHint = computed(() => {
  if (photoBusy.value) return '正在压缩图片…'
  if (!hasPhoto.value) return `支持 JPG、PNG，压缩后单张不超过 ${photoLimitText}，内容仅保存在本机`
  const prefix = editingId.value ? '当前菜谱已有照片' : '照片已就绪'
  return `${prefix}，约 ${formatBytes(photoBytesNow.value)}，保存后占用本机存储`
})
function openCreate() {
  draft.value = Object.fromEntries(config.form.fields.map(([key, , value]) => [key, value || '']))
  editingId.value = null; formError.value = ''; photoError.value = ''; photoNote.value = ''
  showForm.value = true
}
function openEdit(doc) {
  draft.value = { ...doc }
  editingId.value = doc.id; formError.value = ''; photoError.value = ''
  if (isPhoto(doc.photo)) {
    const bytes = dataUrlBytes(doc.photo)
    photoNote.value = bytes > MAX_PHOTO_BYTES
      ? `这张旧照片约 ${formatBytes(bytes)}，超过 ${formatBytes(MAX_PHOTO_BYTES)}，保存时会自动压缩`
      : ''
  } else {
    photoNote.value = ''
  }
  showForm.value = true
}
function triggerPick() { fileInput.value?.click() }
function removePhoto() {
  draft.value.photo = ''; photoError.value = ''
  photoNote.value = editingId.value ? '照片将在保存后移除' : ''
  if (fileInput.value) fileInput.value.value = ''
}
async function pickPhoto(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  photoBusy.value = true; photoError.value = ''; photoNote.value = ''
  try {
    const result = await processImageFile(file)
    draft.value.photo = result.dataUrl
    const free = storageFree()
    photoNote.value = free < result.bytes
      ? `压缩后约 ${formatBytes(result.bytes)}，但本机存储只剩约 ${formatBytes(free)}，保存可能失败，建议先删除其他菜谱的照片`
      : ''
  } catch (error) {
    photoError.value = error.message || '图片处理失败，请换一张试试。'
  } finally {
    photoBusy.value = false
  }
}
async function save() {
  formError.value = ''; photoError.value = ''
  const payload = { ...draft.value }
  // 旧菜谱可能带着未经压缩的超大原图，保存前自动压缩一次
  if (isPhoto(payload.photo) && dataUrlBytes(payload.photo) > MAX_PHOTO_BYTES) {
    photoBusy.value = true
    try {
      const result = await compressDataUrl(payload.photo, MAX_PHOTO_BYTES)
      payload.photo = result.dataUrl
    } catch (error) {
      photoBusy.value = false
      formError.value = `照片压缩失败：${error.message || '请重新选择一张图片'}。`
      return
    } finally {
      photoBusy.value = false
    }
  }
  if (!isPhoto(payload.photo)) payload.photo = ''
  try {
    if (editingId.value) update(config.form.collection, editingId.value, payload)
    else add(config.form.collection, payload)
    showForm.value = false
  } catch (error) {
    if (error instanceof StorageQuotaError) {
      formError.value = error.message
    } else {
      formError.value = `保存失败：${error.message || '本地存储不可用，请检查浏览器隐私模式或存储设置。'}`
    }
  }
}
function markRenewed(doc) { update('documents', doc.id, { expires: `${new Date().getFullYear() + 10}-12-31`, renewed: true }) }
function navTo(id) { active.value = id; mobileOpen.value = false }
</script>
<template>
  <div class="app-shell">
    <aside class="sidebar" :class="{ open: mobileOpen }"><div class="brand"><span class="brand-mark"><FolderLock :size="19" /></span><div><strong>{{ config.brand }}</strong><small>{{ config.subtitle }}</small></div><button class="icon-btn close" @click="mobileOpen = false"><X :size="17" /></button></div><div class="family-chip"><span>林</span><div><b>林家家庭空间</b><small>4 位成员 · 私密存储</small></div><ChevronRight :size="15" /></div><nav><button v-for="item in config.nav" :key="item.id" :class="{ active: active === item.id }" @click="navTo(item.id)"><component :is="item.id === 'overview' ? LayoutDashboard : item.id === 'documents' ? Archive : item.id === 'history' ? CalendarClock : item.id === 'insurance' ? ShieldCheck : Award" :size="17" /><span>{{ item.label }}</span><i v-if="item.id === 'documents' && alerts.length">{{ alerts.length }}</i></button></nav><div class="sidebar-foot"><button><BookOpen :size="17" />使用指南</button><button><UserRound :size="17" />个人中心</button><button class="reset" @click="reset"><RotateCcw :size="15" />恢复演示数据</button></div></aside>
    <main class="main"><header class="topbar"><button class="icon-btn menu" @click="mobileOpen = true"><Menu :size="20" /></button><div><span class="eyebrow">家庭文件空间</span><h1>{{ activeNav.label }}</h1></div><div class="top-actions"><button class="icon-btn"><Bell :size="18" /><em v-if="alerts.length"></em></button><span class="avatar">林</span><b>Lin</b></div></header>
      <div class="page">
        <section class="intro"><div><span class="eyebrow">{{ active === 'overview' ? '星期三 · 2026年9月16日' : '数据随时保存在当前设备' }}</span><h2>{{ active === 'overview' ? config.heroTitle : activeNav.label }}</h2><p>{{ active === 'overview' ? config.heroCopy : '集中查看、编辑和追踪家庭资料。' }}</p></div><button class="primary" @click="openCreate"><Plus :size="16" />{{ config.createLabel || '新建档案' }}</button></section>
        <section v-if="active === 'overview'" class="metric-grid"><article v-for="metric in metrics" :key="metric.label" class="metric"><span class="metric-icon" :class="metric.tone"><Archive v-if="metric.tone === 'green'" :size="17" /><CalendarClock v-else-if="metric.tone === 'peach'" :size="17" /><CircleAlert v-else-if="metric.tone === 'red'" :size="17" /><ShieldCheck v-else :size="17" /></span><div><small>{{ metric.label }}</small><strong>{{ metric.value }}</strong><em>{{ metric.tone === 'red' && metric.value ? '需要尽快处理' : metric.tone === 'peach' && metric.value ? '请提前安排续办' : '较上月稳定' }}</em></div></article></section>
        <section v-if="active === 'overview'" class="content-grid"><article class="panel"><div class="panel-head"><div><span class="eyebrow">到期预警</span><h3>需要你留意的文件</h3></div><button class="text-btn" @click="navTo('documents')">查看全部 <ChevronRight :size="14" /></button></div><div class="alert-list"><div v-for="item in alerts.slice(0, 4)" :key="item.id" class="alert-row"><span class="alert-icon" :class="item.remaining < 0 ? 'danger' : 'warn'"><CircleAlert :size="16" /></span><div><b>{{ item.name }}</b><small>{{ item.holder }} · {{ item.location }}</small></div><span class="date-pill" :class="item.remaining < 0 ? 'danger' : 'warn'">{{ item.remaining < 0 ? `已过期 ${Math.abs(item.remaining)} 天` : `${item.remaining} 天后到期` }}</span><button v-if="item.remaining <= 90" class="tiny-btn" @click="markRenewed(item)">已续办</button></div><div v-if="!alerts.length" class="empty">目前没有临期文件，保持得很好。</div></div></article><article class="panel score"><div class="panel-head"><div><span class="eyebrow">档案完整度</span><h3>家庭资料健康度</h3></div><TrendingUp :size="18" class="accent" /></div><div class="score-ring"><strong>{{ completion }}<small>%</small></strong></div><p>每一份文件都有存放位置和备份位置，家人需要时可以快速找到。</p><div class="progress"><span :style="{ width: `${completion}%` }"></span></div><small class="muted">已完善 {{ state.documents.filter(x => x.location && x.copyLocation).length }} / {{ state.documents.length }} 份</small></article></section>
        <section v-else-if="active === 'documents'" class="panel"><div class="toolbar"><div class="search"><Search :size="16" /><input v-model="query" :placeholder="`搜索${config.entityLabel}`" /></div><select><option>全部类别</option><option v-for="item in config.categories" :key="item">{{ item }}</option></select></div><div class="table-head"><span>{{ config.entityLabel }}</span><span>类别 / 关联人</span><span>{{ config.dateLabel || '有效期' }}</span><span>{{ config.locationLabel || '存放位置' }}</span><span></span></div><div v-for="item in docs" :key="item.id" class="table-row"><div class="item-title"><span v-if="isPhoto(item.photo)" class="file-icon file-thumb"><img :src="item.photo" :alt="item.name" loading="lazy" /></span><span v-else class="file-icon"><Archive :size="16" /></span><div><b>{{ item.name }}</b><small>{{ item.number || '未填写编号' }}</small></div></div><span><b>{{ item.category }}</b><small>{{ item.holder }}</small></span><span><b :class="{ dangerText: days(item.expires) < 0, warnText: days(item.expires) >= 0 && days(item.expires) <= 90 }">{{ item.expires }}</b><small>{{ days(item.expires) < 0 ? '已过期' : `${config.remainingPrefix || '剩余'} ${days(item.expires)} 天` }}</small></span><span><b>{{ item.location || '未填写' }}</b><small>{{ config.copyLabel || '备份位置' }}：{{ item.copyLocation || '未填写' }}</small></span><button class="icon-btn row-edit" title="编辑菜谱 / 照片" @click="openEdit(item)"><Pencil :size="15" /></button></div><div v-if="!docs.length" class="empty">没有匹配的档案。</div></section>
        <section v-else-if="active === 'history'" class="panel"><div class="panel-head"><div><span class="eyebrow">{{ config.historyLabel }}</span><h3>{{ config.historyTitle || `${config.entityLabel}历史` }}</h3></div><span class="count-note">{{ borrowed.length }} 条待处理</span></div><div class="history-grid"><div v-for="entry in state.usages" :key="entry.id" class="history-card"><div class="history-date">{{ entry.date }}<span :class="entry.status === '借用中' ? 'warnText' : 'goodText'">{{ entry.status }}</span></div><b>{{ state.documents.find(x => x.id === entry.documentId)?.name || config.entityLabel }}</b><p>{{ entry.purpose }} · 经办人 {{ entry.borrower }}</p><small>{{ entry.note || '无备注' }}</small></div></div></section>
        <section v-else-if="active === 'insurance'" class="panel"><div class="panel-head"><div><span class="eyebrow">{{ config.secondaryLabel }}</span><h3>{{ config.secondaryTitle || config.secondaryLabel }}</h3></div><button class="text-btn" @click="openCreate">{{ config.secondaryAction || '添加记录' }} <Plus :size="14" /></button></div><div class="policy-grid"><div v-for="item in state.policies" :key="item.id" class="policy-card"><div class="policy-logo"><ShieldCheck :size="20" /></div><div><b>{{ item.type }}</b><small>{{ item.company }} · {{ item.number }}</small></div><span class="policy-date">{{ config.secondaryDatePrefix || '到期' }} {{ item.expires }}</span><strong>{{ item.amount ? `¥${Number(item.amount).toLocaleString()}` : (item.score || '进行中') }} <small>{{ item.payment || item.meta || '' }}</small></strong><p>{{ item.insured || item.description || '已加入家庭计划' }}</p></div></div></section>
        <section v-else class="content-grid"><article class="panel"><div class="panel-head"><div><span class="eyebrow">成长记录</span><h3>成就徽章</h3></div><Award :size="18" class="accent" /></div><div class="badge-grid"><div v-for="(item, index) in config.achievements" :key="item" class="badge" :class="{ unlocked: index < Math.min(5, state.documents.length + 2) }"><span><Award :size="18" /></span><b>{{ item }}</b><small>{{ index < 5 ? '已解锁' : '待解锁' }}</small></div></article><article class="panel"><div class="panel-head"><div><span class="eyebrow">家庭榜单</span><h3>档案管理达人</h3></div></div><div class="rank"><b>01</b><span class="rank-avatar">林</span><div><b>林小满</b><small>建档 {{ state.documents.length }} 份 · 处理率 92%</small></div><strong>98</strong></div><div class="rank"><b>02</b><span class="rank-avatar alt">周</span><div><b>周予安</b><small>建档 8 份 · 处理率 88%</small></div><strong>86</strong></div></article></section>
      </div>
    </main>
    <div v-if="showForm" class="modal-backdrop" @click.self="showForm = false"><form class="modal" @submit.prevent="save"><div class="modal-head"><div><span class="eyebrow">{{ editingId ? '编辑家庭档案' : '建立家庭档案' }}</span><h3>{{ editingId ? `编辑：${editing?.name || config.form.title}` : config.form.title }}</h3></div><button type="button" class="icon-btn" @click="showForm = false"><X :size="17" /></button></div><div class="form-grid"><label v-for="[key, label, placeholder, type] in config.form.fields" :key="key" :class="{ wide: key === 'notes' }">{{ label }}<input v-model="draft[key]" :type="type || 'text'" :placeholder="placeholder" /></label><div class="field wide upload-field"><span class="field-label">照片或扫描件（可选）</span>
      <input ref="fileInput" type="file" accept="image/*" class="upload-input" @change="pickPhoto" />
      <div v-if="photoBusy" class="upload-drop busy"><LoaderCircle :size="20" class="spin" /><span>正在读取并压缩图片…</span></div>
      <div v-else-if="hasPhoto" class="photo-preview"><img :src="draft.photo" alt="菜谱照片预览" /><div class="photo-side"><b>照片预览<i v-if="photoIsOversized" class="size-warn">约 {{ formatBytes(photoBytesNow) }} · 保存时自动压缩</i><i v-else class="size-ok">约 {{ formatBytes(photoBytesNow) }}</i></b><div class="photo-actions"><button type="button" class="secondary" @click="triggerPick"><ImageUp :size="14" />换一张</button><button type="button" class="danger-btn" @click="removePhoto"><Trash2 :size="14" />删除照片</button></div></div></div>
      <button v-else type="button" class="upload-drop" @click="triggerPick"><ImagePlus :size="20" /><span><b>点击上传照片</b><small>JPG / PNG，大图会自动压缩到 {{ formatBytes(MAX_PHOTO_BYTES) }} 以内</small></span></button>
      <small v-if="photoError" class="upload-msg error"><CircleAlert :size="13" />{{ photoError }}</small>
      <small v-else-if="photoNote" class="upload-msg" :class="{ warn: photoIsOversized }"><CircleAlert :size="13" />{{ photoNote }}</small>
      <small v-else class="upload-msg">{{ photoHint }}</small>
    </div></div>
    <p v-if="formError" class="form-error"><CircleAlert :size="15" />{{ formError }}</p>
    <div class="modal-actions"><button type="button" class="secondary" @click="showForm = false">取消</button><button class="primary" type="submit" :disabled="photoBusy"><LoaderCircle v-if="photoBusy" :size="16" class="spin" /><FilePlus2 v-else :size="16" />{{ editingId ? '保存修改' : '保存菜谱' }}</button></div></form></div>
  </div>
</template>
