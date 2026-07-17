export default function handler(_request, response) {
  const checks = {
    supabase_url: Boolean(process.env.SUPABASE_URL),
    supabase_service_role: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    openai_api_key: Boolean(process.env.OPENAI_API_KEY),
    openai_model: process.env.OPENAI_MODEL || 'gpt-5.6-sol'
  }
  const ok = checks.supabase_url && checks.supabase_service_role && checks.openai_api_key
  response.status(ok ? 200 : 503)
  response.setHeader('Cache-Control', 'no-store')
  response.json({ ok, checks })
}
