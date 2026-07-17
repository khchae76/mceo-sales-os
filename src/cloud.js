import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const workspaceKey = 'sales-os-v1'

const loginBox = document.getElementById('cloud-login')
const accountBox = document.getElementById('cloud-account')
const emailInput = document.getElementById('auth-email')
const sendButton = document.getElementById('auth-send')
const signoutButton = document.getElementById('auth-signout')
const saveButton = document.getElementById('cloud-save')
const loadButton = document.getElementById('cloud-load')
const userLabel = document.getElementById('auth-user')
const statusLabel = document.getElementById('cloud-status')

let supabase = null
let currentUser = null
let saveTimer = null

function setStatus(message) {
  statusLabel.textContent = message
}

function snapshotLocalData() {
  const data = {}
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (key && key.startsWith('mceo-')) data[key] = localStorage.getItem(key)
  }
  return data
}

function hasMeaningfulLocalData() {
  return ['mceo-atass-v1', 'mceo-clv-builder-v1', 'mceo-closer-disc-v1', 'mceo-objection-disc-v1']
    .some((key) => localStorage.getItem(key))
}

async function getWorkspace() {
  if (!currentUser) return null
  const { data, error } = await supabase
    .from('student_workspaces')
    .select('data, updated_at')
    .eq('user_id', currentUser.id)
    .eq('workspace_key', workspaceKey)
    .maybeSingle()
  if (error) throw error
  return data
}

async function saveSnapshot(options = {}) {
  if (!currentUser) {
    if (!options.silent) setStatus('请先使用Email登录，才能保存到云端。')
    return false
  }
  const { error } = await supabase.from('student_workspaces').upsert({
    user_id: currentUser.id,
    workspace_key: workspaceKey,
    data: snapshotLocalData(),
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id,workspace_key' })
  if (error) throw error
  if (!options.silent) setStatus('已保存到云端。你可以在其他电脑登录后继续。')
  return true
}

function scheduleSave() {
  if (!currentUser) return
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    saveSnapshot({ silent: true })
      .then(() => setStatus('资料已自动同步到云端。'))
      .catch(() => setStatus('云端自动保存失败，请点击“保存到云端”重试。'))
  }, 900)
}

async function loadSnapshot(options = {}) {
  if (!currentUser) {
    setStatus('请先使用Email登录。')
    return false
  }
  const workspace = await getWorkspace()
  if (!workspace || !workspace.data) {
    setStatus('这个账号暂时没有云端记录。')
    return false
  }
  Object.entries(workspace.data).forEach(([key, value]) => {
    if (key.startsWith('mceo-') && typeof value === 'string') localStorage.setItem(key, value)
  })
  if (!options.silent) setStatus('云端记录已载入，页面正在更新。')
  window.setTimeout(() => window.location.reload(), 500)
  return true
}

async function getAccessToken() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || null
}

async function handleSession(session) {
  currentUser = session?.user || null
  loginBox.style.display = currentUser ? 'none' : 'grid'
  accountBox.classList.toggle('show', Boolean(currentUser))
  userLabel.textContent = currentUser?.email || ''
  if (!currentUser) {
    setStatus('请先使用Email登录，才能使用AI与跨电脑云端存档。')
    return
  }

  try {
    const workspace = await getWorkspace()
    if (!workspace) {
      await saveSnapshot({ silent: true })
      setStatus('登录成功；当前资料已建立云端存档。')
    } else if (!hasMeaningfulLocalData()) {
      await loadSnapshot({ silent: true })
    } else {
      const updated = workspace.updated_at ? new Date(workspace.updated_at).toLocaleString('zh-MY') : '较早时间'
      setStatus(`登录成功。云端有记录（${updated}）；如需覆盖本机资料，请点击“载入云端记录”。`)
    }
  } catch (error) {
    setStatus(`登录成功，但读取云端记录失败：${error.message}`)
  }
}

async function sendMagicLink() {
  const email = emailInput.value.trim()
  if (!email) {
    emailInput.focus()
    setStatus('请输入Email。')
    return
  }
  sendButton.disabled = true
  sendButton.textContent = '发送中…'
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin }
  })
  sendButton.disabled = false
  sendButton.textContent = '发送登录链接'
  setStatus(error ? `发送失败：${error.message}` : '登录链接已发送，请检查Email并点击Magic Link。')
}

if (!supabaseUrl || !publishableKey) {
  setStatus('云端尚未配置：请在Vercel加入Supabase环境变量。')
  sendButton.disabled = true
} else {
  supabase = createClient(supabaseUrl, publishableKey)
  window.MCEOCloud = { saveSnapshot, loadSnapshot, scheduleSave, getAccessToken }

  sendButton.addEventListener('click', sendMagicLink)
  emailInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') sendMagicLink() })
  saveButton.addEventListener('click', () => saveSnapshot().catch((error) => setStatus(`保存失败：${error.message}`)))
  loadButton.addEventListener('click', () => loadSnapshot().catch((error) => setStatus(`载入失败：${error.message}`)))
  signoutButton.addEventListener('click', async () => {
    await supabase.auth.signOut()
    currentUser = null
    handleSession(null)
  })

  supabase.auth.onAuthStateChange((_event, session) => {
    window.setTimeout(() => handleSession(session), 0)
  })
  const { data } = await supabase.auth.getSession()
  await handleSession(data.session)
}
