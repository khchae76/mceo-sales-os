import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const promptFiles = {
  atass: 'atass.txt',
  closer_disc: 'closer-disc.txt',
  objection_disc: 'objection-disc.txt'
}

function reply(response, status, payload) {
  response.status(status)
  response.setHeader('Cache-Control', 'no-store')
  response.json(payload)
}

function extractOutput(decoded) {
  if (typeof decoded.output_text === 'string' && decoded.output_text) return decoded.output_text
  let output = ''
  for (const item of decoded.output || []) {
    if (item.type !== 'message') continue
    for (const content of item.content || []) {
      if (content.type === 'output_text') output += content.text || ''
    }
  }
  return output
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return reply(response, 405, { ok: false, error: 'Only POST is allowed.' })

  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const openaiApiKey = process.env.OPENAI_API_KEY
  if (!supabaseUrl || !serviceRoleKey || !openaiApiKey) {
    return reply(response, 503, { ok: false, error: 'AI后台环境变量尚未配置完整。' })
  }

  const authorization = request.headers.authorization || ''
  const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!accessToken) return reply(response, 401, { ok: false, error: '请先使用Email登录。' })

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  })
  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(accessToken)
  const user = authData?.user
  if (authError || !user) return reply(response, 401, { ok: false, error: '登录已失效，请重新登录。' })

  let body
  try {
    body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : (request.body || {})
  } catch {
    return reply(response, 400, { ok: false, error: 'Invalid JSON.' })
  }
  const engine = String(body.engine || '')
  const mode = String(body.mode || 'build')
  if (!promptFiles[engine] || mode !== 'build') return reply(response, 400, { ok: false, error: 'Unknown AI Engine or mode.' })

  const contextJson = JSON.stringify(body.context || {}, null, 2)
  if (contextJson.length > 120000) return reply(response, 413, { ok: false, error: '资料太长，请缩短后重试。' })

  const perMinuteLimit = Number(process.env.MCEO_AI_PER_MINUTE_LIMIT || 12)
  const dailyLimit = Number(process.env.MCEO_AI_DAILY_LIMIT || 100)
  const minuteAgo = new Date(Date.now() - 60000).toISOString()
  const dayAgo = new Date(Date.now() - 86400000).toISOString()
  const [minuteUsage, dailyUsage] = await Promise.all([
    supabaseAdmin.from('ai_usage').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', minuteAgo),
    supabaseAdmin.from('ai_usage').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', dayAgo)
  ])
  if (minuteUsage.error || dailyUsage.error) return reply(response, 503, { ok: false, error: 'AI用量系统尚未准备好。' })
  const minuteCount = minuteUsage.count
  const dailyCount = dailyUsage.count
  if ((minuteCount || 0) >= perMinuteLimit) return reply(response, 429, { ok: false, error: '请求太频密，请一分钟后再试。' })
  if ((dailyCount || 0) >= dailyLimit) return reply(response, 429, { ok: false, error: '今天的课堂AI使用次数已经达到上限。' })

  const { data: usageRow, error: usageError } = await supabaseAdmin.from('ai_usage').insert({
    user_id: user.id,
    engine,
    status: 'started'
  }).select('id').single()
  if (usageError || !usageRow) return reply(response, 503, { ok: false, error: '无法建立AI使用记录。' })

  let instructions
  try {
    instructions = readFileSync(join(process.cwd(), 'private', promptFiles[engine]), 'utf8')
  } catch {
    return reply(response, 500, { ok: false, error: 'AI Engine Prompt无法读取。' })
  }

  const payload = {
    model: process.env.OPENAI_MODEL || 'gpt-5.6-sol',
    instructions,
    input: `运行模式：${mode}\n\n以下是学生与企业资料（JSON）：\n${contextJson}`,
    reasoning: { effort: 'low' },
    max_output_tokens: 5000,
    store: false
  }

  try {
    const openaiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const decoded = await openaiResponse.json()
    if (!openaiResponse.ok) throw new Error(decoded?.error?.message || 'AI service returned an error.')
    const output = extractOutput(decoded)
    if (!output) throw new Error('AI returned no readable output.')
    if (usageRow?.id) {
      await supabaseAdmin.from('ai_usage').update({ status: 'succeeded', output_chars: output.length }).eq('id', usageRow.id)
    }
    return reply(response, 200, { ok: true, output })
  } catch (error) {
    if (usageRow?.id) await supabaseAdmin.from('ai_usage').update({ status: 'failed' }).eq('id', usageRow.id)
    return reply(response, 502, { ok: false, error: error.message || 'Unable to reach the AI service.' })
  }
}
