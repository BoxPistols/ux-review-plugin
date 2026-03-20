// ═══════════════════════════════════════════════════════════════
// UX Review AI — Cloudflare Workers Proxy
// Deploy: wrangler deploy
// Env vars (set in Cloudflare dashboard):
//   OPENAI_API_KEY  = sk-...
//   ALLOWED_ORIGIN  = * (or your domain)
// ═══════════════════════════════════════════════════════════════

const DAILY_LIMIT = 50          // calls per user per day
const KV_TTL      = 86400       // 24h in seconds

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '*'

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-User-ID',
          'Access-Control-Max-Age': '86400',
        },
      })
    }

    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, origin)
    }

    // ── Rate limiting ────────────────────────────────────────
    const userId  = request.headers.get('X-User-ID') || 'anonymous'
    const today   = new Date().toISOString().slice(0, 10)   // YYYY-MM-DD
    const kvKey   = `ratelimit:${userId}:${today}`

    let count = 0
    if (env.KV) {
      const stored = await env.KV.get(kvKey)
      count = stored ? parseInt(stored) : 0
    }

    if (count >= DAILY_LIMIT) {
      return json({
        error: `1日の使用上限（${DAILY_LIMIT}回）に達しました。明日またご利用ください。`,
        remaining: 0,
        limit: DAILY_LIMIT,
      }, 429, origin)
    }

    // ── Parse & validate body ────────────────────────────────
    let body
    try {
      body = await request.json()
    } catch {
      return json({ error: 'Invalid JSON' }, 400, origin)
    }

    const { model, messages, response_format, max_tokens, max_completion_tokens, temperature } = body

    if (!model || !messages?.length) {
      return json({ error: 'model と messages は必須です' }, 400, origin)
    }

    // Whitelist models
    const ALLOWED_MODELS = [
      'gpt-5.4-nano', 'gpt-5.4-mini',
      'gpt-5.4-nano-2026-03-17', 'gpt-5.4-mini-2026-03-17',  // pinned snapshots
    ]
    if (!ALLOWED_MODELS.includes(model)) {
      return json({ error: `モデル "${model}" は許可されていません` }, 400, origin)
    }

    // ── Forward to OpenAI ────────────────────────────────────
    const isGpt5 = model.startsWith('gpt-5')  // gpt-5.4-nano/mini 含む
    const oaiBody = { model, messages }
    if (response_format) oaiBody.response_format = response_format
    if (!isGpt5) {
      oaiBody.temperature = temperature ?? 0.2
      oaiBody.max_tokens  = max_tokens ?? 2800
    } else {
      oaiBody.max_completion_tokens = max_completion_tokens ?? 2800
    }

    let oaiRes
    try {
      oaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify(oaiBody),
      })
    } catch (e) {
      return json({ error: `OpenAI接続エラー: ${e.message}` }, 502, origin)
    }

    // ── Increment counter after successful call ───────────────
    if (oaiRes.ok && env.KV) {
      await env.KV.put(kvKey, String(count + 1), { expirationTtl: KV_TTL })
    }

    const remaining = DAILY_LIMIT - count - 1
    const oaiData = await oaiRes.json()

    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'X-RateLimit-Limit':     String(DAILY_LIMIT),
      'X-RateLimit-Remaining': String(Math.max(0, remaining)),
    }

    return new Response(JSON.stringify({ ...oaiData, _remaining: Math.max(0, remaining) }), {
      status: oaiRes.status,
      headers,
    })
  }
}

function json(data, status = 200, origin = '*') {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
    },
  })
}
