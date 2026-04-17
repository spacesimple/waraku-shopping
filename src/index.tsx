import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

type Bindings = {
  DB: D1Database
  R2: R2Bucket
  GEMINI_API_KEY?: string
  GEMINI_BASE_URL?: string
  GEMINI_MODEL?: string
}

const app = new Hono<{ Bindings: Bindings }>()

// CORS
app.use('/api/*', cors())

// Static files
app.use('/static/*', serveStatic({ root: './public' }))

// ── ユーティリティ ──────────────────────────────────────────────

function jsonRes(data: unknown, status = 200) {
  return Response.json(data, { status })
}

function uuid() {
  return crypto.randomUUID()
}

function normalizeText(text: string) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseNumber(text: string | null | undefined) {
  if (!text) return null
  const cleaned = String(text).replace(/[^\n0-9.\-]/g, '')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function parseYenToMan(text: string | null | undefined) {
  const value = parseNumber(text)
  if (value === null) return null
  return Math.round(value / 10000)
}

function extractOne(regex: RegExp, text: string) {
  const match = text.match(regex)
  return match ? match[1].trim() : null
}

function localPropertyParse(text: string) {
  const normalized = normalizeText(text)
  const result: Record<string, unknown> = {}

  result.name = extractOne(/(?:物件名|名称)\s*[:：]\s*([^\n]+)/i, normalized)
  result.address = extractOne(/(?:所在地|住所)\s*[:：]\s*([^\n]+)/i, normalized)
  result.station = extractOne(/(?:最寄駅|駅名)\s*[:：]?\s*([^\n,]+)/i, normalized)
  result.walk_minutes = parseNumber(extractOne(/徒歩\s*約?\s*([0-9]{1,3})\s*分/i, normalized))
  result.area = parseNumber(extractOne(/(?:専有面積|面積)\s*[:：]?\s*([0-9.,]+)\s*㎡/i, normalized))
  result.layout = extractOne(/間取り\s*[:：]?\s*([^\n]+)/i, normalized)
  result.structure = extractOne(/構造\s*[:：]?\s*([^\n]+)/i, normalized)
  result.built_year = extractOne(/(?:築年数|築年|建築年)\s*[:：]?\s*([^\n]+)/i, normalized)
  result.parking = extractOne(/駐車場\s*[:：]?\s*([^\n]+)/i, normalized)
  result.pet = extractOne(/ペット\s*[:：]?\s*([^\n]+)/i, normalized)

  const priceText = extractOne(/(?:賃料|価格)\s*[:：]?\s*¥?\s*([0-9,\.]+)/i, normalized)
  const price = parseYenToMan(priceText)
  if (price !== null) {
    result.price = price
    result.price_unit = '万円'
  }

  const managementFeeText = extractOne(/管理費\s*[:：]?\s*¥?\s*([0-9,\.]+)/i, normalized)
  const managementFee = parseYenToMan(managementFeeText)
  if (managementFee !== null) result.kanrihi = managementFee

  const commonServiceFeeText = extractOne(/共益費\s*[:：]?\s*¥?\s*([0-9,\.]+)/i, normalized)
  const commonServiceFee = parseYenToMan(commonServiceFeeText)
  if (commonServiceFee !== null) result.kyoeki = commonServiceFee

  const points = extractOne(/(?:おすすめポイント|PR)\s*[:：]?\s*([^\n]+)/i, normalized)
  if (points) result['おすすめポイント'] = points.split(/[、,\n]/).map(s => s.trim()).filter(Boolean)

  return result
}

async function callGemini(prompt: string, apiKey: string, baseUrl: string, model: string, maxTokens = 2048) {
  const normalizedBase = baseUrl.replace(/\/+$/, '')
  const useQueryKey = apiKey && !apiKey.startsWith('Bearer ') && !apiKey.startsWith('ya29.')
  const url = `${normalizedBase}/models/${model}:generate${useQueryKey ? `?key=${encodeURIComponent(apiKey)}` : ''}`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (!useQueryKey && apiKey) {
    headers.Authorization = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`
  }

  const body = {
    prompt: { text: prompt },
    temperature: 0.1,
    maxOutputTokens: maxTokens,
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  const data = await res.json()
  if (!res.ok) {
    const err = data.error?.message || data.error_description || data.message || `Gemini API error (${res.status})`
    throw new Error(err)
  }

  const candidate = data?.candidates?.[0]
  let text = ''
  if (candidate) {
    if (typeof candidate.outputText === 'string') text = candidate.outputText
    else if (candidate.output?.[0]?.content) {
      const content = candidate.output[0].content
      if (Array.isArray(content)) {
        const textBlock = content.find((item: any) => item.type === 'output_text' || item.type === 'text')
        text = textBlock?.text || ''
      } else if (typeof content === 'string') {
        text = content
      }
    }
  }
  if (!text && typeof data?.outputText === 'string') text = data.outputText
  if (!text) throw new Error('Geminiのレスポンスからテキストを抽出できませんでした')
  return text
}

async function fetchPageText(webUrl: string) {
  const pageRes = await fetch(webUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
    },
    redirect: 'follow',
  })
  const html = await pageRes.text()
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<!--([\s\S]*?)-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function localAnalyze(text: string) {
  return localPropertyParse(text)
}

async function remoteAnalyze(prompt: string, apiKey: string, baseUrl: string, model: string) {
  const text = await callGemini(prompt, apiKey, baseUrl, model, 2048)
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/) || text.match(/(\{[\s\S]+\})/)
  const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text
  try {
    return JSON.parse(jsonStr.trim())
  } catch {
    throw new Error(`AIがJSON形式で返答しませんでした: ${text.substring(0, 150)}`)
  }
}

async function hashPassword(password: string) {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  )
  const hashArr = Array.from(new Uint8Array(bits))
  const saltArr = Array.from(salt)
  return JSON.stringify({ hash: hashArr, salt: saltArr })
}

async function verifyPassword(password: string, stored: string) {
  const { hash, salt } = JSON.parse(stored)
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: new Uint8Array(salt), iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  )
  const newHash = Array.from(new Uint8Array(bits))
  return JSON.stringify(newHash) === JSON.stringify(hash)
}

async function authenticate(c: any): Promise<string | null> {
  const auth = c.req.header('Authorization') || ''
  const sessionId = auth.replace('Bearer ', '')
  if (!sessionId) return null
  const session = await c.env.DB.prepare(
    'SELECT * FROM sessions WHERE id = ? AND expires_at > datetime("now")'
  ).bind(sessionId).first() as any
  return session ? session.user_id : null
}

// ── 認証 ───────────────────────────────────────────────────────

app.post('/api/auth/register', async (c) => {
  const { email, password } = await c.req.json()
  if (!email || !password) return c.json({ error: 'メールとパスワードは必須です' }, 400)
  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()
  if (existing) return c.json({ error: 'このメールアドレスはすでに登録されています' }, 409)
  const id = uuid()
  const hashed = await hashPassword(password)
  await c.env.DB.prepare('INSERT INTO users (id, email, password) VALUES (?, ?, ?)').bind(id, email, hashed).run()
  const sessionId = uuid()
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  await c.env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').bind(sessionId, id, expires).run()
  return c.json({ token: sessionId, userId: id })
})

app.post('/api/auth/login', async (c) => {
  const { email, password } = await c.req.json()
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first() as any
  if (!user) return c.json({ error: 'メールアドレスまたはパスワードが違います' }, 401)
  const ok = await verifyPassword(password, user.password)
  if (!ok) return c.json({ error: 'メールアドレスまたはパスワードが違います' }, 401)
  const sessionId = uuid()
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  await c.env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').bind(sessionId, user.id, expires).run()
  return c.json({ token: sessionId, userId: user.id })
})

app.post('/api/auth/logout', async (c) => {
  const auth = c.req.header('Authorization') || ''
  const sessionId = auth.replace('Bearer ', '')
  if (sessionId) await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run()
  return c.json({ success: true })
})

app.get('/api/auth/me', async (c) => {
  const userId = await authenticate(c)
  if (!userId) return c.json({ error: '未認証' }, 401)
  const user = await c.env.DB.prepare('SELECT id, email, created_at FROM users WHERE id = ?').bind(userId).first()
  return c.json(user)
})

// ── 会社情報 ────────────────────────────────────────────────────

app.get('/api/company', async (c) => {
  const userId = await authenticate(c)
  if (!userId) return c.json({ error: '未認証' }, 401)
  const company = await c.env.DB.prepare('SELECT * FROM companies WHERE user_id = ?').bind(userId).first()
  return c.json(company || {})
})

app.post('/api/company', async (c) => {
  const userId = await authenticate(c)
  if (!userId) return c.json({ error: '未認証' }, 401)
  const data = await c.req.json() as any
  const existing = await c.env.DB.prepare('SELECT id FROM companies WHERE user_id = ?').bind(userId).first()
  if (existing) {
    await c.env.DB.prepare(`
      UPDATE companies SET name=?,tel=?,email=?,address=?,logo_key=?,license_no=?,updated_at=datetime('now')
      WHERE user_id=?
    `).bind(data.name, data.tel, data.email, data.address, data.logo_key || null, data.license_no, userId).run()
  } else {
    await c.env.DB.prepare(`
      INSERT INTO companies (id,user_id,name,tel,email,address,logo_key,license_no) VALUES (?,?,?,?,?,?,?,?)
    `).bind(uuid(), userId, data.name, data.tel, data.email, data.address, data.logo_key || null, data.license_no).run()
  }
  return c.json({ success: true })
})

// ── 物件CRUD ────────────────────────────────────────────────────

app.get('/api/properties', async (c) => {
  const userId = await authenticate(c)
  if (!userId) return c.json({ error: '未認証' }, 401)
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM properties WHERE user_id = ? ORDER BY created_at DESC'
  ).bind(userId).all()
  return c.json(results || [])
})

app.post('/api/properties', async (c) => {
  const userId = await authenticate(c)
  if (!userId) return c.json({ error: '未認証' }, 401)
  const d = await c.req.json() as any
  const id = uuid()
  // extra_data: AI抽出の全項目をJSONで保存
  const extraKeys = ['物件種別','物件名_英語','物件名_フリガナ','部屋番号','間取りタイプ','情報公開日','住居表示',
    '交通1_路線','交通1_駅名','交通1_徒歩分','交通2_路線','交通2_駅名','交通2_徒歩分','交通3_路線','交通3_駅名','交通3_徒歩分',
    '構造','種別','規模_階建','建築時期_和暦','建築時期_西暦','検査済証','総戸数','防火指定','用途地域','建ぺい率','容積率',
    '道路','間口','その他制限','占有面積_㎡','バルコニー面積_㎡','土地_権利','土地_地積','土地_地目',
    '価格_円','保証料率_保証人無_%','保証料率_保証人有_%','継続保証料_月額_円','保証会社_加入',
    '指定保険会社名','保険種別','契約年数','保険料_円','保険_加入',
    '事務所利用','水道','各戸設備','オートロック','ダイヤル錠式郵便ポスト','バルコニー向き','地勢','駐輪場',
    '短期解約_1年未満_違約金','短期解約_2年未満_違約金','退去時日割精算','鍵交換_費用なし時','引渡し条件','複数人入居','外国籍',
    '管理会社名','管理形態','管理費_円','修繕積立金','その他費用',
    '外観写真','室内写真','間取り図','写真枚数','借主_必要書類','連帯保証人_必要書類',
    '取引態様','火災保険_円','日割賃料_円','日割共益費_円','安心サポート_円']
  const extraData: Record<string, unknown> = {}
  for (const k of extraKeys) {
    if (d[k] !== undefined) extraData[k] = d[k]
  }
  await c.env.DB.prepare(`
    INSERT INTO properties
    (id,user_id,name,catch_copy,price,price_unit,layout,area,address,station,walk_minutes,
     built_year,floors,structure,land_area,parking,balcony_area,building_features,surrounding,interior,
     facilities,images,status,
     rent_yen,kanrihi,kyoeki,shikikin,reikin,freerent,keiyaku,genkyo,nyukyobi,pet,gas_type,internet,
     osusume_points,bikou,hoshokin,kasai,kagi,cleaning,total_shokihi,hoshosha,extra_data)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id, userId,
    d.name, d.catch_copy, d.price, d.price_unit || '万円', d.layout, d.area,
    d.address, d.station, d.walk_minutes,
    d.built_year, d.floors, d.structure, d.land_area, d.parking, d.balcony_area,
    d.building_features, d.surrounding, d.interior,
    JSON.stringify(d.facilities || []),
    JSON.stringify(d.images || []),
    'active',
    d['賃料_円'] || null, d['管理費_円月'] || 0, d['共益費_円月'] || 0,
    d['敷金_ヶ月'] || null, d['礼金_ヶ月'] || null,
    d['フリーレント'] || null, d['契約種別'] || null, d['現況'] || null, d['入居日'] || null,
    d['ペット'] || null, d['ガス種別'] || null, d['インターネット'] || null,
    JSON.stringify(d['おすすめポイント'] || []),
    d['備考'] || null,
    d['保証会社保証料_円'] || 0, d['家財保険料_円'] || 0, d['鍵交換費_円'] || 0,
    d['退去時クリーニング_円'] || 0, d['合計目安_円'] || 0,
    d['指定保証会社名'] || null,
    JSON.stringify(extraData)
  ).run()
  return c.json({ id })
})

app.get('/api/properties/:id', async (c) => {
  const userId = await authenticate(c)
  if (!userId) return c.json({ error: '未認証' }, 401)
  const id = c.req.param('id')
  const prop = await c.env.DB.prepare('SELECT * FROM properties WHERE id = ? AND user_id = ?').bind(id, userId).first() as any
  if (!prop) return c.json({ error: '物件が見つかりません' }, 404)
  prop.facilities = JSON.parse(prop.facilities || '[]')
  prop.images = JSON.parse(prop.images || '[]')
  prop['おすすめポイント'] = JSON.parse(prop.osusume_points || '[]')
  // extra_dataを展開
  const extra = JSON.parse(prop.extra_data || '{}')
  Object.assign(prop, extra)
  // DBカラム名をdata-rule.mdキー名にマッピング
  prop['賃料_円'] = prop.rent_yen
  prop['管理費_円月'] = prop.kanrihi
  prop['共益費_円月'] = prop.kyoeki
  prop['敷金_ヶ月'] = prop.shikikin
  prop['礼金_ヶ月'] = prop.reikin
  prop['フリーレント'] = prop.freerent
  prop['契約種別'] = prop.keiyaku
  prop['現況'] = prop.genkyo
  prop['入居日'] = prop.nyukyobi
  prop['ペット'] = prop.pet
  prop['ガス種別'] = prop.gas_type
  prop['インターネット'] = prop.internet
  prop['備考'] = prop.bikou
  prop['保証会社保証料_円'] = prop.hoshokin
  prop['家財保険料_円'] = prop.kasai
  prop['鍵交換費_円'] = prop.kagi
  prop['退去時クリーニング_円'] = prop.cleaning
  prop['合計目安_円'] = prop.total_shokihi
  prop['指定保証会社名'] = prop.hoshosha
  return c.json(prop)
})

app.put('/api/properties/:id', async (c) => {
  const userId = await authenticate(c)
  if (!userId) return c.json({ error: '未認証' }, 401)
  const id = c.req.param('id')
  const d = await c.req.json() as any
  const extraKeys = ['物件種別','物件名_英語','物件名_フリガナ','部屋番号','間取りタイプ','情報公開日','住居表示',
    '交通1_路線','交通1_駅名','交通1_徒歩分','交通2_路線','交通2_駅名','交通2_徒歩分','交通3_路線','交通3_駅名','交通3_徒歩分',
    '構造','種別','規模_階建','建築時期_和暦','建築時期_西暦','検査済証','総戸数','防火指定','用途地域','建ぺい率','容積率',
    '道路','間口','その他制限','占有面積_㎡','バルコニー面積_㎡','土地_権利','土地_地積','土地_地目',
    '価格_円','保証料率_保証人無_%','保証料率_保証人有_%','継続保証料_月額_円','保証会社_加入',
    '指定保険会社名','保険種別','契約年数','保険料_円','保険_加入',
    '事務所利用','水道','各戸設備','オートロック','ダイヤル錠式郵便ポスト','バルコニー向き','地勢','駐輪場',
    '短期解約_1年未満_違約金','短期解約_2年未満_違約金','退去時日割精算','鍵交換_費用なし時','引渡し条件','複数人入居','外国籍',
    '管理会社名','管理形態','管理費_円','修繕積立金','その他費用',
    '外観写真','室内写真','間取り図','写真枚数','借主_必要書類','連帯保証人_必要書類',
    '取引態様','火災保険_円','日割賃料_円','日割共益費_円','安心サポート_円']
  const extraData: Record<string, unknown> = {}
  for (const k of extraKeys) {
    if (d[k] !== undefined) extraData[k] = d[k]
  }
  await c.env.DB.prepare(`
    UPDATE properties SET
    name=?,catch_copy=?,price=?,price_unit=?,layout=?,area=?,address=?,station=?,walk_minutes=?,
    built_year=?,floors=?,structure=?,land_area=?,parking=?,balcony_area=?,
    building_features=?,surrounding=?,interior=?,facilities=?,images=?,
    rent_yen=?,kanrihi=?,kyoeki=?,shikikin=?,reikin=?,freerent=?,keiyaku=?,genkyo=?,nyukyobi=?,
    pet=?,gas_type=?,internet=?,osusume_points=?,bikou=?,
    hoshokin=?,kasai=?,kagi=?,cleaning=?,total_shokihi=?,hoshosha=?,extra_data=?,
    updated_at=datetime('now')
    WHERE id=? AND user_id=?
  `).bind(
    d.name, d.catch_copy, d.price, d.price_unit || '万円', d.layout, d.area,
    d.address, d.station, d.walk_minutes,
    d.built_year, d.floors, d.structure, d.land_area, d.parking, d.balcony_area,
    d.building_features, d.surrounding, d.interior,
    JSON.stringify(d.facilities || []),
    JSON.stringify(d.images || []),
    d['賃料_円'] || null, d['管理費_円月'] || 0, d['共益費_円月'] || 0,
    d['敷金_ヶ月'] || null, d['礼金_ヶ月'] || null,
    d['フリーレント'] || null, d['契約種別'] || null, d['現況'] || null, d['入居日'] || null,
    d['ペット'] || null, d['ガス種別'] || null, d['インターネット'] || null,
    JSON.stringify(d['おすすめポイント'] || []),
    d['備考'] || null,
    d['保証会社保証料_円'] || 0, d['家財保険料_円'] || 0, d['鍵交換費_円'] || 0,
    d['退去時クリーニング_円'] || 0, d['合計目安_円'] || 0,
    d['指定保証会社名'] || null,
    JSON.stringify(extraData),
    id, userId
  ).run()
  return c.json({ success: true })
})

app.delete('/api/properties/:id', async (c) => {
  const userId = await authenticate(c)
  if (!userId) return c.json({ error: '未認証' }, 401)
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM properties WHERE id = ? AND user_id = ?').bind(id, userId).run()
  return c.json({ success: true })
})


// ── 画像アップロード / ファイル取得 ─────────────────────────────────
app.post('/api/upload', async (c) => {
  try {
    const form = await c.req.formData()
    const file = form.get('file')
    if (!file || !(file instanceof File)) return c.json({ error: 'ファイルが必要です' }, 400)
    const folder = String(form.get('folder') || 'uploads').replace(/[^a-zA-Z0-9_-]/g, '') || 'uploads'
    const ext = (file.name?.split('.').pop() || 'bin').replace(/[^a-zA-Z0-9]/g, '') || 'bin'
    const key = `${folder}/${crypto.randomUUID()}.${ext}`
    const arrayBuffer = await file.arrayBuffer()
    await c.env.R2.put(key, arrayBuffer, {
      httpMetadata: { contentType: file.type || 'application/octet-stream' }
    })
    return c.json({ success: true, key })
  } catch (e: any) {
    return c.json({ error: e.message || 'アップロードエラー' }, 500)
  }
})

app.get('/api/files/*', async (c) => {
  const key = c.req.param('*')
  if (!key) return c.json({ error: 'ファイルキーが必要です' }, 400)
  const object = await c.env.R2.get(decodeURIComponent(key))
  if (!object || !object.body) return c.json({ error: 'ファイルが見つかりませんでした' }, 404)
  const headers = new Headers()
  headers.set('Content-Type', object.httpMetadata?.contentType || object.metadata?.contentType || 'application/octet-stream')
  return new Response(object.body, { headers })
})

// ── AI解析 ────────────────────────────────────────────────────
app.post('/api/ai/analyze', async (c) => {
  try {
    const body = await c.req.json() as any
    const { imageUrl, webUrl, pdfText, apiKey: userApiKey, baseUrl: userBaseUrl } = body
    const apiKey = userApiKey || c.env.GEMINI_API_KEY || ''
    const baseUrl = userBaseUrl || c.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta2'
    const model = c.env.GEMINI_MODEL || 'gemini-1.5-mini'

    let data: any = {}
    let localFallback = false

    if (imageUrl) {
      if (!apiKey) {
        return c.json({ error: '画像解析にはGemini APIキーが必要です。', needApiKey: true }, 400)
      }
      const prompt = `以下は不動産チラシの画像を表すBase64文字列です。できる限り物件情報を抽出し、次のJSONスキーマに従ってJSONのみを返してください。\n${FULL_PROPERTY_SCHEMA}\n\n画像データ(Base64):\n${imageUrl}`
      data = await remoteAnalyze(prompt, apiKey, baseUrl, model)
    } else if (pdfText) {
      if (apiKey) {
        try {
          const prompt = `以下の不動産チラシPDF抽出テキストから物件情報を抽出し、次のJSONスキーマに従ってJSONのみを返してください。\n${FULL_PROPERTY_SCHEMA}\n\n--- PDFテキスト ---\n${pdfText.substring(0, 20000)}`
          data = await remoteAnalyze(prompt, apiKey, baseUrl, model)
        } catch (e: any) {
          data = await localAnalyze(pdfText)
          localFallback = true
        }
      } else {
        data = await localAnalyze(pdfText)
        localFallback = true
      }
    } else if (webUrl) {
      const pageText = await fetchPageText(webUrl)
      if (apiKey) {
        try {
          const prompt = `以下の不動産Webページテキストから物件情報を抽出し、次のJSONスキーマに従ってJSONのみを返してください。\n${FULL_PROPERTY_SCHEMA}\n\n--- Webページテキスト ---\n${pageText.substring(0, 20000)}`
          data = await remoteAnalyze(prompt, apiKey, baseUrl, model)
        } catch (e: any) {
          data = await localAnalyze(pageText)
          localFallback = true
        }
      } else {
        data = await localAnalyze(pageText)
        localFallback = true
      }
    } else {
      return c.json({ error: 'imageUrl, pdfText, または webUrl が必要です' }, 400)
    }

    return c.json({ success: true, data, localFallback })
  } catch (e: any) {
    return c.json({ error: e.message || 'AI解析エラー' }, 500)
  }
})

// ── フロントエンドSPAルート ─────────────────────────────────
app.get('/', (c) => c.html(getAppHTML()))
app.get('*', (c) => c.html(getAppHTML()))

function getAppHTML() {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>不動産チラシ生成ツール</title>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;600;700;900&family=Noto+Serif+JP:wght@400;700&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"><\/script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"><\/script>
  <style>
    * { font-family: 'Noto Sans JP', sans-serif; box-sizing: border-box; }
    @media print {
      body > *:not(#print-area) { display: none !important; }
      #print-area { display: block !important; }
      #print-area > div { margin: 0; padding: 0; }
      @page { size: A4 portrait; margin: 0; }
      @page.landscape { size: A4 landscape; }
    }
    .flyer-pattern2 * { font-family: 'Noto Serif JP', serif; }
    .tab-btn { border-bottom: 3px solid transparent; transition: all .15s; }
    .tab-btn.active { border-bottom: 3px solid #1a6b3c; color: #1a6b3c; font-weight: 700; }
    input:focus, textarea:focus, select:focus { border-color: #1a6b3c !important; outline: none; box-shadow: 0 0 0 3px rgba(26,107,60,0.1); }
    .prop-card { transition: all .15s; }
    .prop-card:hover { border-color: #1a6b3c; background: #f0faf4; }
    .pattern-btn { transition: all .15s; cursor: pointer; }
    #toast { transition: opacity 0.3s; pointer-events: none; }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    #ai-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.55); display: flex; align-items: center; justify-content: center; z-index: 9998; }
    #ai-overlay .box { background: #fff; border-radius: 20px; padding: 40px 48px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
    #ai-overlay .spinner { width: 48px; height: 48px; border: 4px solid #e9d5ff; border-top-color: #7c3aed; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 16px; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #f1f1f1; }
    ::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }
    .ai-tab-btn { transition: all .15s; }
  </style>
</head>
<body class="bg-gray-100 min-h-screen">

<div id="toast" class="fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl font-semibold text-sm shadow-xl hidden"></div>
<div id="print-area" style="display:none;"></div>
<div id="app"></div>

<script src="/static/app.js"><\/script>
</body>
</html>`
}

export default app
