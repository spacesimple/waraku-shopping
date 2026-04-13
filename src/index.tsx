import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

type Bindings = {
  DB: D1Database
  R2: R2Bucket
  OPENAI_API_KEY?: string
  OPENAI_BASE_URL?: string
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
  await c.env.DB.prepare(`
    INSERT INTO properties
    (id,user_id,name,catch_copy,price,price_unit,layout,area,address,station,walk_minutes,
     built_year,floors,structure,land_area,parking,balcony_area,building_features,surrounding,interior,facilities,images,status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id, userId,
    d.name, d.catch_copy, d.price, d.price_unit || '万円', d.layout, d.area,
    d.address, d.station, d.walk_minutes,
    d.built_year, d.floors, d.structure, d.land_area, d.parking, d.balcony_area,
    d.building_features, d.surrounding, d.interior,
    JSON.stringify(d.facilities || []),
    JSON.stringify(d.images || []),
    'active'
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
  return c.json(prop)
})

app.put('/api/properties/:id', async (c) => {
  const userId = await authenticate(c)
  if (!userId) return c.json({ error: '未認証' }, 401)
  const id = c.req.param('id')
  const d = await c.req.json() as any
  await c.env.DB.prepare(`
    UPDATE properties SET
    name=?,catch_copy=?,price=?,price_unit=?,layout=?,area=?,address=?,station=?,walk_minutes=?,
    built_year=?,floors=?,structure=?,land_area=?,parking=?,balcony_area=?,
    building_features=?,surrounding=?,interior=?,facilities=?,images=?,updated_at=datetime('now')
    WHERE id=? AND user_id=?
  `).bind(
    d.name, d.catch_copy, d.price, d.price_unit || '万円', d.layout, d.area,
    d.address, d.station, d.walk_minutes,
    d.built_year, d.floors, d.structure, d.land_area, d.parking, d.balcony_area,
    d.building_features, d.surrounding, d.interior,
    JSON.stringify(d.facilities || []),
    JSON.stringify(d.images || []),
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

// ── R2 ファイル操作 ─────────────────────────────────────────────

app.post('/api/upload', async (c) => {
  const userId = await authenticate(c)
  if (!userId) return c.json({ error: '未認証' }, 401)
  const formData = await c.req.formData()
  const file = formData.get('file') as File
  if (!file) return c.json({ error: 'ファイルがありません' }, 400)
  const folder = (formData.get('folder') as string) || 'uploads'
  const ext = file.name.split('.').pop()
  const key = `${userId}/${folder}/${uuid()}.${ext}`
  await c.env.R2.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  })
  const url = `/api/files/${encodeURIComponent(key)}`
  return c.json({ key, url, size: file.size, mimeType: file.type })
})

app.get('/api/files/:key{.+}', async (c) => {
  const key = decodeURIComponent(c.req.param('key'))
  const obj = await c.env.R2.get(key)
  if (!obj) return c.json({ error: 'ファイルが見つかりません' }, 404)
  const headers = new Headers()
  obj.writeHttpMetadata(headers)
  headers.set('Cache-Control', 'public, max-age=3600')
  headers.set('Access-Control-Allow-Origin', '*')
  return new Response(obj.body as any, { headers })
})

app.delete('/api/files/:key{.+}', async (c) => {
  const userId = await authenticate(c)
  if (!userId) return c.json({ error: '未認証' }, 401)
  const key = decodeURIComponent(c.req.param('key'))
  if (!key.startsWith(userId + '/')) return c.json({ error: '権限がありません' }, 403)
  await c.env.R2.delete(key)
  return c.json({ success: true })
})

// ── AI解析 エンドポイント ───────────────────────────────────────
// Node.js AIプロキシ（ポート3001）に転送する

app.post('/api/ai/analyze', async (c) => {
  const userId = await authenticate(c)
  if (!userId) return c.json({ error: '未認証' }, 401)

  const body = await c.req.json() as any

  // クライアントから apiKey が送られた場合、またはサーバー環境変数を使う
  const payload = {
    ...body,
    apiKey: body.apiKey || c.env.OPENAI_API_KEY || undefined,
    baseUrl: body.baseUrl || c.env.OPENAI_BASE_URL || undefined,
  }

  try {
    // ローカル Node.js AI プロキシサーバーに転送
    const proxyRes = await fetch('http://127.0.0.1:3001/ai/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await proxyRes.json()
    return c.json(data, proxyRes.status as any)
  } catch (e: any) {
    // プロキシが起動していない場合
    return c.json({
      error: 'AIプロキシサーバーが起動していません。'
    }, 503)
  }
})

// ── フロントエンド ──────────────────────────────────────────────

app.get('/', (c) => {
  return c.html(getAppHTML())
})

// SPA フォールバック
app.get('*', (c) => {
  return c.html(getAppHTML())
})

function getAppHTML() {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>不動産チラシ生成ツール</title>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;600;700;900&family=Noto+Serif+JP:wght@400;700&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"></script>
  <style>
    * { font-family: 'Noto Sans JP', sans-serif; box-sizing: border-box; }
    /* 印刷スタイル */
    @media print {
      body > *:not(#print-area) { display: none !important; }
      #print-area { display: block !important; }
      #print-area > div { margin: 0; padding: 0; }
      @page { size: A4; margin: 0; }
    }
    .flyer-pattern2 * { font-family: 'Noto Serif JP', serif; }
    .tab-btn { border-bottom: 3px solid transparent; transition: all .15s; }
    .tab-btn.active { border-bottom: 3px solid #1a6b3c; color: #1a6b3c; font-weight: 700; }
    .tab-btn:hover:not(.active) { border-bottom-color: #ccc; color: #555; }
    .prop-card { transition: all .15s; }
    .prop-card:hover { border-color: #1a6b3c; background: #f0faf4; }
    input:focus, textarea:focus, select:focus { border-color: #1a6b3c !important; outline: none; box-shadow: 0 0 0 3px rgba(26,107,60,0.1); }
    .pattern-btn { transition: all .15s; }
    .pattern-btn.active { box-shadow: 0 0 0 3px rgba(26,107,60,0.3); }
    #toast { transition: opacity 0.3s; pointer-events: none; }
    .ai-loading { animation: spin 1s linear infinite; display: inline-block; }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    /* AI ローディングオーバーレイ */
    #ai-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.5);
      display: flex; align-items: center; justify-content: center; z-index: 9998;
    }
    #ai-overlay .box {
      background: #fff; border-radius: 20px; padding: 40px 48px;
      text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    #ai-overlay .spinner {
      width: 48px; height: 48px; border: 4px solid #e9d5ff;
      border-top-color: #7c3aed; border-radius: 50%;
      animation: spin 0.8s linear infinite; margin: 0 auto 16px;
    }
    /* スクロールバー細め */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #f1f1f1; }
    ::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }
  </style>
</head>
<body class="bg-gray-100 min-h-screen">

<!-- Toast -->
<div id="toast" class="fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl font-semibold text-sm shadow-xl hidden"></div>

<!-- Print area (hidden by default) -->
<div id="print-area" style="display:none;"></div>

<!-- App Root -->
<div id="app"></div>

<script>
// ── State ──────────────────────────────────────────────────────
const state = {
  page: 'login',
  user: null,
  company: {},
  properties: [],
  currentProp: null,
  selectedPattern: 1,
  imageUrl: '',
  imageKey: '',
  loading: false,
  aiLoading: false,
  subPage: 'basic', // property form sub-tabs
  userApiKey: localStorage.getItem('chirashi_openai_key') || '',
  showApiKeyModal: false,
}

const API_BASE = ''

// ── API ────────────────────────────────────────────────────────
const api = {
  token: () => localStorage.getItem('chirashi_token'),
  async req(method, path, body, isForm = false) {
    const headers = {}
    if (this.token()) headers['Authorization'] = \`Bearer \${this.token()}\`
    if (!isForm && body) headers['Content-Type'] = 'application/json'
    const res = await fetch(\`\${API_BASE}\${path}\`, {
      method, headers,
      body: isForm ? body : (body ? JSON.stringify(body) : undefined),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'エラーが発生しました')
    return data
  },
  get: (p) => api.req('GET', p),
  post: (p, b) => api.req('POST', p, b),
  put: (p, b) => api.req('PUT', p, b),
  del: (p) => api.req('DELETE', p),
  upload: (p, f) => api.req('POST', p, f, true),
}

// ── Toast ───────────────────────────────────────────────────────
function toast(text, type = 'ok') {
  const el = document.getElementById('toast')
  el.textContent = text
  el.className = \`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl font-semibold text-sm shadow-xl \${
    type === 'err' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
  }\`
  el.style.display = 'block'
  el.style.opacity = '1'
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.style.display = 'none', 300) }, 3000)
}

// ── AI Overlay ─────────────────────────────────────────────────
function showAiOverlay(msg = 'AIが解析中...') {
  let el = document.getElementById('ai-overlay')
  if (!el) {
    el = document.createElement('div')
    el.id = 'ai-overlay'
    document.body.appendChild(el)
  }
  el.innerHTML = \`
  <div class="box">
    <div class="spinner"></div>
    <div style="font-weight:700;font-size:15px;color:#4c1d95;margin-bottom:6px;">\${msg}</div>
    <div style="font-size:12px;color:#888;">しばらくお待ちください...</div>
  </div>
  \`
  el.style.display = 'flex'
}
function hideAiOverlay() {
  const el = document.getElementById('ai-overlay')
  if (el) el.style.display = 'none'
}

// ── API Key Modal ──────────────────────────────────────────────
function renderApiKeyModal() {
  return \`
  <div id="apikey-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;">
    <div style="background:#fff;border-radius:20px;padding:36px 40px;width:460px;max-width:90vw;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
      <div style="text-align:center;margin-bottom:24px;">
        <div style="font-size:40px;margin-bottom:8px;">🔑</div>
        <h2 style="font-size:18px;font-weight:900;color:#1a1a1a;">OpenAI APIキーの設定</h2>
        <p style="font-size:13px;color:#666;margin-top:6px;">AI自動入力機能を使うにはOpenAI APIキーが必要です</p>
      </div>
      <div style="background:#f0f9ff;border:1.5px solid #bae6fd;border-radius:12px;padding:14px 16px;margin-bottom:20px;font-size:12px;color:#0369a1;">
        <strong>取得方法:</strong> <a href="https://platform.openai.com/api-keys" target="_blank" style="color:#0369a1;font-weight:700;">platform.openai.com</a> → API Keys → Create new secret key
      </div>
      <div style="margin-bottom:20px;">
        <label style="display:block;font-size:12px;font-weight:700;color:#555;margin-bottom:8px;">APIキー（sk-... から始まる）</label>
        <input id="apikey-input" type="password" placeholder="sk-proj-..." value="\${esc(state.userApiKey||'')}"
          style="width:100%;padding:12px 14px;border:2px solid #e0e0e0;border-radius:12px;font-size:13px;outline:none;box-sizing:border-box;" />
      </div>
      <div style="background:#fefce8;border:1.5px solid #fde68a;border-radius:10px;padding:10px 14px;margin-bottom:20px;font-size:11px;color:#92400e;">
        <i class="fas fa-shield-alt" style="margin-right:4px;"></i>
        APIキーはブラウザのローカルストレージにのみ保存され、サーバーには送信されません（リクエスト毎に直接OpenAIに送信）
      </div>
      <div style="display:flex;gap:12px;">
        <button onclick="saveApiKey()" style="flex:1;background:#7c3aed;color:#fff;border:none;padding:12px;border-radius:12px;font-weight:700;cursor:pointer;font-size:14px;">
          <i class="fas fa-save" style="margin-right:6px;"></i>保存して続ける
        </button>
        <button onclick="closeApiKeyModal()" style="border:2px solid #e0e0e0;background:#fff;color:#666;padding:12px 18px;border-radius:12px;font-weight:700;cursor:pointer;font-size:14px;">
          キャンセル
        </button>
      </div>
      <div style="text-align:center;margin-top:16px;">
        <button onclick="closeApiKeyModal()" style="font-size:12px;color:#999;background:none;border:none;cursor:pointer;text-decoration:underline;">
          キーなしで手動入力する
        </button>
      </div>
    </div>
  </div>
  \`
}

function saveApiKey() {
  const input = document.getElementById('apikey-input')
  const key = input?.value?.trim()
  if (key) {
    state.userApiKey = key
    localStorage.setItem('chirashi_openai_key', key)
    toast('APIキーを保存しました')
  }
  state.showApiKeyModal = false
  render()
}

function closeApiKeyModal() {
  state.showApiKeyModal = false
  render()
}

// ── Render ─────────────────────────────────────────────────────
function render() {
  const app = document.getElementById('app')
  switch(state.page) {
    case 'login': app.innerHTML = renderLogin(); break
    case 'register': app.innerHTML = renderRegister(); break
    case 'dashboard': app.innerHTML = renderDashboard(); break
    case 'company': app.innerHTML = renderCompany(); break
    case 'property': app.innerHTML = renderProperty(); break
    case 'flyer': app.innerHTML = renderFlyer(); break
  }
  attachEvents()
  // APIキーモーダルを表示
  if (state.showApiKeyModal) {
    const modalEl = document.createElement('div')
    modalEl.innerHTML = renderApiKeyModal()
    document.body.appendChild(modalEl.firstElementChild)
    document.getElementById('apikey-input')?.focus()
  }
}

// ── Nav ────────────────────────────────────────────────────────
function renderNav() {
  return \`
  <nav class="bg-gray-900 h-14 flex items-center justify-between px-6 shadow-lg">
    <button onclick="goTo('dashboard')" class="text-white font-black text-lg flex items-center gap-2 hover:text-green-400 transition">
      <i class="fas fa-home"></i> 不動産チラシ生成
    </button>
    <div class="flex items-center gap-3">
      <span class="text-gray-400 text-sm hidden sm:block">\${state.user?.email || ''}</span>
      <button onclick="goTo('company')" class="text-white border border-gray-600 rounded-lg px-3 py-1.5 text-sm hover:border-green-400 hover:text-green-400 transition">
        <i class="fas fa-building mr-1"></i>会社情報
      </button>
      <button onclick="state.showApiKeyModal=true;render()" class="text-white border border-gray-600 rounded-lg px-3 py-1.5 text-sm hover:border-purple-400 hover:text-purple-400 transition" title="OpenAI APIキー設定">
        <i class="fas fa-key mr-1"></i><span class="hidden sm:inline">AIキー</span>
        \${state.userApiKey ? '<span class="ml-1 text-purple-400 text-xs">●</span>' : ''}
      </button>
      <button onclick="handleLogout()" class="text-white border border-gray-600 rounded-lg px-3 py-1.5 text-sm hover:border-red-400 hover:text-red-400 transition">
        <i class="fas fa-sign-out-alt mr-1"></i>ログアウト
      </button>
    </div>
  </nav>
  \`
}

// ── Login ──────────────────────────────────────────────────────
function renderLogin() {
  return \`
  <div class="min-h-screen bg-gradient-to-br from-green-900 to-gray-900 flex items-center justify-center p-4">
    <div class="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
      <div class="text-center mb-8">
        <div class="text-5xl mb-3">🏠</div>
        <h1 class="text-2xl font-black text-gray-800">不動産チラシ生成</h1>
        <p class="text-gray-400 text-sm mt-1">AI搭載・3パターン自動生成</p>
      </div>
      <form id="login-form" class="space-y-4">
        <div>
          <label class="block text-xs font-semibold text-gray-500 mb-1.5">メールアドレス</label>
          <input name="email" type="email" required placeholder="email@example.com"
            class="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:border-green-500 outline-none transition" />
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-500 mb-1.5">パスワード</label>
          <input name="password" type="password" required placeholder="••••••••"
            class="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:border-green-500 outline-none transition" />
        </div>
        <button type="submit" class="w-full bg-green-700 hover:bg-green-600 text-white font-bold py-3 rounded-xl text-sm transition mt-2">
          \${state.loading ? '<i class="fas fa-spinner ai-loading mr-2"></i>ログイン中...' : '<i class="fas fa-sign-in-alt mr-2"></i>ログイン'}
        </button>
      </form>
      <div class="text-center mt-4 text-sm text-gray-500">
        アカウントをお持ちでない方は
        <button onclick="goTo('register')" class="text-green-700 font-bold hover:underline ml-1">新規登録</button>
      </div>
    </div>
  </div>
  \`
}

function renderRegister() {
  return \`
  <div class="min-h-screen bg-gradient-to-br from-green-900 to-gray-900 flex items-center justify-center p-4">
    <div class="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
      <div class="text-center mb-8">
        <div class="text-5xl mb-3">🏠</div>
        <h1 class="text-2xl font-black text-gray-800">新規登録</h1>
      </div>
      <form id="register-form" class="space-y-4">
        <div>
          <label class="block text-xs font-semibold text-gray-500 mb-1.5">メールアドレス</label>
          <input name="email" type="email" required class="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm outline-none transition" />
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-500 mb-1.5">パスワード（8文字以上）</label>
          <input name="password" type="password" minlength="8" required class="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm outline-none transition" />
        </div>
        <button type="submit" class="w-full bg-green-700 hover:bg-green-600 text-white font-bold py-3 rounded-xl text-sm transition">
          \${state.loading ? '<i class="fas fa-spinner ai-loading mr-2"></i>登録中...' : '<i class="fas fa-user-plus mr-2"></i>登録する'}
        </button>
      </form>
      <div class="text-center mt-4 text-sm">
        <button onclick="goTo('login')" class="text-green-700 font-bold hover:underline">← ログインへ戻る</button>
      </div>
    </div>
  </div>
  \`
}

// ── Dashboard ──────────────────────────────────────────────────
function renderDashboard() {
  const noCompany = !state.company?.name
  const props = state.properties
  return \`
  \${renderNav()}
  <div class="max-w-4xl mx-auto p-6">
    \${noCompany ? \`
    <div class="bg-orange-50 border-2 border-orange-200 rounded-2xl p-4 mb-6 flex justify-between items-center">
      <span class="text-sm text-orange-800"><i class="fas fa-exclamation-triangle mr-2"></i>会社情報が未設定です。チラシに表示する会社情報を登録してください。</span>
      <button onclick="goTo('company')" class="bg-orange-500 text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-orange-600 transition">設定する</button>
    </div>
    \` : ''}

    <div class="flex justify-between items-center mb-6">
      <h1 class="text-2xl font-black text-gray-800"><i class="fas fa-list mr-2 text-green-700"></i>物件一覧</h1>
      <button onclick="newProperty()" class="bg-green-700 hover:bg-green-600 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition shadow">
        <i class="fas fa-plus mr-2"></i>新規物件登録
      </button>
    </div>

    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      \${props.length === 0 ? \`
        <div class="text-center py-16 text-gray-400">
          <div class="text-6xl mb-4">🏡</div>
          <p class="text-base">物件がまだありません</p>
          <p class="text-sm mt-1">「新規物件登録」から始めましょう</p>
        </div>
      \` : props.map(p => \`
        <div class="prop-card border-b border-gray-100 p-4 flex justify-between items-center cursor-pointer transition"
             onclick="openFlyer('\${p.id}')">
          <div>
            <div class="font-bold text-gray-800">\${p.name}</div>
            <div class="text-sm text-gray-500 mt-0.5">
              <span class="text-green-700 font-bold">\${p.price ? Number(p.price).toLocaleString() : '-'}万円</span>
              <span class="mx-2">·</span>\${p.layout || '-'}
              <span class="mx-2">·</span>\${p.address || '-'}
            </div>
          </div>
          <div class="flex gap-2">
            <button onclick="editProperty(event, '\${p.id}')" class="bg-green-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-green-600 transition">
              <i class="fas fa-edit mr-1"></i>編集
            </button>
            <button onclick="deleteProperty(event, '\${p.id}')" class="bg-white text-red-600 border border-red-200 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-red-50 transition">
              <i class="fas fa-trash mr-1"></i>削除
            </button>
          </div>
        </div>
      \`).join('')}
    </div>
  </div>
  \`
}

// ── Company ────────────────────────────────────────────────────
function renderCompany() {
  const co = state.company || {}
  return \`
  \${renderNav()}
  <div class="max-w-2xl mx-auto p-6">
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
      <h1 class="text-xl font-black text-gray-800 mb-6"><i class="fas fa-building mr-2 text-green-700"></i>会社情報</h1>
      <form id="company-form" class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-semibold text-gray-500 mb-1.5">会社名 *</label>
            <input name="name" required value="\${co.name||''}" class="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm outline-none" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-500 mb-1.5">電話番号</label>
            <input name="tel" value="\${co.tel||''}" class="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm outline-none" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-semibold text-gray-500 mb-1.5">メールアドレス</label>
            <input name="email" type="email" value="\${co.email||''}" class="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm outline-none" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-500 mb-1.5">宅建業者番号</label>
            <input name="license_no" value="\${co.license_no||''}" placeholder="国土交通大臣（1）第XXXXX号" class="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm outline-none" />
          </div>
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-500 mb-1.5">住所</label>
          <input name="address" value="\${co.address||''}" class="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm outline-none" />
        </div>
        <div class="flex gap-3 pt-2">
          <button type="submit" class="bg-green-700 text-white font-bold px-6 py-2.5 rounded-xl text-sm hover:bg-green-600 transition">
            \${state.loading ? '<i class="fas fa-spinner ai-loading mr-1"></i>保存中...' : '<i class="fas fa-save mr-1"></i>保存する'}
          </button>
          <button type="button" onclick="goTo('dashboard')" class="border-2 border-green-700 text-green-700 font-bold px-5 py-2.5 rounded-xl text-sm hover:bg-green-50 transition">キャンセル</button>
        </div>
      </form>
    </div>
  </div>
  \`
}

// ── Property Form ──────────────────────────────────────────────
const FACILITIES = ['駐車場','バス・トイレ別','エアコン','システムキッチン','オートロック','フローリング','バルコニー','エレベーター','宅配ボックス','床暖房','ウォークインクローゼット','追い焚き']

function renderProperty() {
  const p = state.currentProp || {}
  const isEdit = !!p.id
  const tab = state.subPage
  return \`
  \${renderNav()}
  <div class="max-w-3xl mx-auto p-6">
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-xl font-black text-gray-800">
          <i class="fas fa-\${isEdit ? 'edit' : 'plus-circle'} mr-2 text-green-700"></i>
          \${isEdit ? '物件を編集' : '物件を新規登録'}
        </h1>
      </div>

      <!-- AI自動入力パネル -->
      <div class="bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-200 rounded-2xl p-5 mb-6">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <span class="text-purple-600 font-black text-sm"><i class="fas fa-magic mr-1"></i>AI自動入力</span>
            <span class="text-xs text-gray-500 hidden sm:block">チラシ画像またはURLから物件情報を自動で読み込みます</span>
          </div>
          <button onclick="loadSampleData()" class="text-xs font-bold px-3 py-1.5 rounded-lg border-2 border-gray-300 text-gray-600 hover:border-green-500 hover:text-green-700 bg-white transition">
            <i class="fas fa-database mr-1"></i>サンプルデータ
          </button>
        </div>
        <div class="flex gap-3 mb-3">
          <button onclick="showAiTab('image')" id="ai-tab-image"
            class="text-xs font-bold px-3 py-1.5 rounded-lg border-2 \${state.aiTab==='url' ? 'border-gray-200 text-gray-500 bg-white' : 'border-purple-500 text-purple-700 bg-purple-50'} transition">
            <i class="fas fa-image mr-1"></i>画像から読み込む
          </button>
          <button onclick="showAiTab('url')" id="ai-tab-url"
            class="text-xs font-bold px-3 py-1.5 rounded-lg border-2 \${state.aiTab==='url' ? 'border-purple-500 text-purple-700 bg-purple-50' : 'border-gray-200 text-gray-500 bg-white'} transition">
            <i class="fas fa-link mr-1"></i>URLから読み込む
          </button>
        </div>
        <div id="ai-panel-image" style="display:\${state.aiTab==='url' ? 'none' : 'block'}">
          <div class="flex gap-3 items-center flex-wrap">
            <input type="file" id="ai-image-file" accept="image/*"
              class="text-xs flex-1 min-w-0 border-2 border-purple-200 rounded-xl px-3 py-2 bg-white cursor-pointer" />
            <button onclick="runAiAnalyzeImage()"
              class="bg-purple-600 text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-purple-700 transition whitespace-nowrap shadow">
              <i class="fas fa-search mr-1"></i>AIで解析
            </button>
          </div>
          <p class="text-xs text-gray-400 mt-2"><i class="fas fa-info-circle mr-1"></i>不動産チラシの画像（JPG/PNG）を選択するとAIが自動で情報を入力します</p>
        </div>
        <div id="ai-panel-url" style="display:\${state.aiTab==='url' ? 'block' : 'none'}">
          <div class="flex gap-3 items-center flex-wrap">
            <input type="text" id="ai-web-url" placeholder="https://suumo.jp/jj/..." value="\${esc(state.webUrlInput||'')}"
              class="flex-1 min-w-0 text-xs border-2 border-purple-200 rounded-xl px-3 py-2 bg-white outline-none" />
            <button onclick="runAiAnalyzeUrl()"
              class="bg-purple-600 text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-purple-700 transition whitespace-nowrap shadow">
              <i class="fas fa-search mr-1"></i>AIで解析
            </button>
          </div>
          <p class="text-xs text-gray-400 mt-2"><i class="fas fa-info-circle mr-1"></i>SUUMO、HOME'S などの物件ページURLを入力してください</p>
        </div>
      </div>

      <form id="property-form" class="space-y-0">
        <!-- タブ -->
        <div class="flex border-b border-gray-200 mb-6 gap-4">
          <button type="button" onclick="setSubPage('basic')" class="tab-btn pb-2 text-sm font-semibold text-gray-500 \${tab==='basic' ? 'active' : ''}">
            基本情報
          </button>
          <button type="button" onclick="setSubPage('detail')" class="tab-btn pb-2 text-sm font-semibold text-gray-500 \${tab==='detail' ? 'active' : ''}">
            詳細・設備
          </button>
          <button type="button" onclick="setSubPage('image')" class="tab-btn pb-2 text-sm font-semibold text-gray-500 \${tab==='image' ? 'active' : ''}">
            物件画像
          </button>
        </div>

        <!-- 基本情報 -->
        <div id="tab-basic" style="display:\${tab==='basic'?'block':'none'}">
          <div class="space-y-4">
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1.5">物件名 *</label>
              <input id="f-name" name="name" required value="\${esc(p.name||'')}" placeholder="緑豊かな住宅街の一戸建て"
                class="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm outline-none" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1.5">キャッチコピー</label>
              <input id="f-catch_copy" name="catch_copy" value="\${esc(p.catch_copy||'')}" placeholder="子育てに最適！閑静な住宅地"
                class="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm outline-none" />
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1.5">価格（万円）</label>
                <input id="f-price" name="price" type="number" value="\${p.price||''}" placeholder="4280"
                  class="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm outline-none" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1.5">間取り</label>
                <input id="f-layout" name="layout" value="\${esc(p.layout||'')}" placeholder="4LDK"
                  class="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm outline-none" />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1.5">専有面積（㎡）</label>
                <input id="f-area" name="area" type="number" step="0.01" value="\${p.area||''}"
                  class="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm outline-none" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1.5">所在地</label>
                <input id="f-address" name="address" value="\${esc(p.address||'')}"
                  class="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm outline-none" />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1.5">最寄り駅</label>
                <input id="f-station" name="station" value="\${esc(p.station||'')}"
                  class="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm outline-none" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1.5">徒歩（分）</label>
                <input id="f-walk_minutes" name="walk_minutes" type="number" value="\${p.walk_minutes||''}"
                  class="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm outline-none" />
              </div>
            </div>
          </div>
        </div>

        <!-- 詳細・設備 -->
        <div id="tab-detail" style="display:\${tab==='detail'?'block':'none'}">
          <div class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1.5">築年月</label>
                <input id="f-built_year" name="built_year" value="\${esc(p.built_year||'')}" placeholder="2015年築"
                  class="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm outline-none" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1.5">階数</label>
                <input id="f-floors" name="floors" value="\${esc(p.floors||'')}" placeholder="2階建て"
                  class="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm outline-none" />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1.5">構造</label>
                <input id="f-structure" name="structure" value="\${esc(p.structure||'')}" placeholder="木造"
                  class="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm outline-none" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1.5">土地面積（㎡）</label>
                <input id="f-land_area" name="land_area" type="number" step="0.01" value="\${p.land_area||''}"
                  class="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm outline-none" />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1.5">駐車場</label>
                <input id="f-parking" name="parking" value="\${esc(p.parking||'')}" placeholder="2台可"
                  class="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm outline-none" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1.5">バルコニー面積（㎡）</label>
                <input id="f-balcony_area" name="balcony_area" type="number" step="0.01" value="\${p.balcony_area||''}"
                  class="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm outline-none" />
              </div>
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1.5">建物の特徴</label>
              <textarea id="f-building_features" name="building_features" rows="2"
                class="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm outline-none resize-none">\${esc(p.building_features||'')}</textarea>
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1.5">周辺環境</label>
              <textarea id="f-surrounding" name="surrounding" rows="2"
                class="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm outline-none resize-none">\${esc(p.surrounding||'')}</textarea>
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1.5">室内の特徴</label>
              <textarea id="f-interior" name="interior" rows="2"
                class="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm outline-none resize-none">\${esc(p.interior||'')}</textarea>
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-3">設備・特徴</label>
              <div class="flex flex-wrap gap-2" id="facilities-list">
                \${FACILITIES.map(f => \`
                  <label class="flex items-center gap-2 cursor-pointer text-sm bg-gray-50 border-2 border-gray-200 rounded-xl px-3 py-2 hover:border-green-400 transition \${(p.facilities||[]).includes(f)?'border-green-500 bg-green-50':''}" id="fl-\${f}">
                    <input type="checkbox" name="facility_\${f}" \${(p.facilities||[]).includes(f)?'checked':''} class="facility-check" data-facility="\${f}" />
                    \${f}
                  </label>
                \`).join('')}
              </div>
            </div>
          </div>
        </div>

        <!-- 物件画像 -->
        <div id="tab-image" style="display:\${tab==='image'?'block':'none'}">
          <div class="space-y-4">
            <div class="border-2 border-dashed border-gray-300 rounded-2xl p-8 text-center hover:border-green-400 transition">
              <div class="text-gray-400 text-4xl mb-3">📸</div>
              <p class="text-sm text-gray-500 mb-3">物件画像をアップロード（R2に保存）</p>
              <input type="file" id="prop-image-upload" accept="image/*" class="hidden" />
              <button type="button" onclick="document.getElementById('prop-image-upload').click()"
                class="bg-green-700 text-white text-sm font-bold px-5 py-2 rounded-xl hover:bg-green-600 transition">
                <i class="fas fa-upload mr-2"></i>画像を選択
              </button>
            </div>
            \${state.imageUrl ? \`
            <div class="rounded-2xl overflow-hidden border-2 border-green-200">
              <img src="\${state.imageUrl}" alt="物件画像" class="w-full max-h-64 object-cover" />
              <div class="p-3 bg-green-50 flex justify-between items-center">
                <span class="text-xs text-green-700 font-semibold"><i class="fas fa-check-circle mr-1"></i>画像がアップロードされました</span>
                <button type="button" onclick="clearImage()" class="text-xs text-red-500 hover:underline">削除</button>
              </div>
            </div>
            \` : ''}
          </div>
        </div>

        <div class="flex gap-3 pt-6 border-t border-gray-100">
          <button type="submit" class="bg-green-700 text-white font-bold px-6 py-3 rounded-xl text-sm hover:bg-green-600 transition shadow">
            \${state.loading ? '<i class="fas fa-spinner ai-loading mr-2"></i>保存中...' : '<i class="fas fa-file-alt mr-2"></i>チラシを生成する →'}
          </button>
          <button type="button" onclick="goTo('dashboard')" class="border-2 border-green-700 text-green-700 font-bold px-5 py-3 rounded-xl text-sm hover:bg-green-50 transition">キャンセル</button>
        </div>
      </form>
    </div>
  </div>
  \`
}

// ── Flyer Page ─────────────────────────────────────────────────
function renderFlyer() {
  const p = state.currentProp || {}
  const co = state.company || {}
  const patterns = [
    { id: 1, name: 'パターン1', desc: 'モダン・シンプル', color: '#1a6b3c' },
    { id: 2, name: 'パターン2', desc: 'ラグジュアリー', color: '#1a2d3d' },
    { id: 3, name: 'パターン3', desc: 'ポップ・明るい', color: '#ff6b35' },
  ]

  return \`
  \${renderNav()}
  <div class="max-w-5xl mx-auto p-6">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-xl font-black text-gray-800"><i class="fas fa-file-image mr-2 text-green-700"></i>チラシ生成 — \${p.name}</h1>
      <div class="flex gap-2">
        <button onclick="goTo('property')" class="border-2 border-green-700 text-green-700 text-sm font-bold px-4 py-2 rounded-xl hover:bg-green-50 transition">
          <i class="fas fa-edit mr-1"></i>物件を編集
        </button>
        <button onclick="goTo('dashboard')" class="border-2 border-gray-300 text-gray-600 text-sm font-bold px-4 py-2 rounded-xl hover:bg-gray-50 transition">
          一覧へ
        </button>
      </div>
    </div>

    <!-- パターン選択 -->
    <div class="grid grid-cols-3 gap-3 mb-5">
      \${patterns.map(pt => \`
        <button onclick="selectPattern(\${pt.id})" class="pattern-btn rounded-2xl border-2 p-4 text-center transition cursor-pointer \${state.selectedPattern===pt.id ? 'active' : 'border-gray-200 bg-white hover:border-gray-300'}"
          style="\${state.selectedPattern===pt.id ? \`border-color:\${pt.color};background:\${pt.color}11\` : ''}">
          <div class="font-black text-sm" style="color:\${pt.color}">\${pt.name}</div>
          <div class="text-xs text-gray-400 mt-1">\${pt.desc}</div>
          \${state.selectedPattern===pt.id ? \`<div class="text-xs font-bold mt-1" style="color:\${pt.color}"><i class="fas fa-check mr-1"></i>選択中</div>\` : ''}
        </button>
      \`).join('')}
    </div>

    <!-- 画像アップロード -->
    <div class="bg-white rounded-2xl border border-gray-200 p-4 mb-5 flex items-center gap-4">
      <span class="text-sm font-semibold text-gray-600"><i class="fas fa-image mr-2 text-green-600"></i>物件画像：</span>
      <input type="file" id="flyer-image-upload" accept="image/*" class="hidden" />
      <button onclick="document.getElementById('flyer-image-upload').click()" class="border-2 border-gray-200 text-sm px-4 py-1.5 rounded-xl hover:border-green-500 transition font-semibold text-gray-600">
        <i class="fas fa-upload mr-1"></i>画像を変更
      </button>
      \${state.imageUrl ? \`<img src="\${state.imageUrl}" class="h-10 rounded-lg object-cover" />\` : '<span class="text-gray-400 text-xs">画像なし</span>'}
    </div>

    <!-- チラシプレビュー -->
    <div class="bg-gray-700 p-8 rounded-2xl overflow-x-auto mb-5">
      <div id="flyer-preview" class="inline-block shadow-2xl">
        \${renderFlyerPattern(state.selectedPattern, p, co, state.imageUrl)}
      </div>
    </div>

    <div class="flex gap-3 justify-center flex-wrap">
      <button onclick="printFlyer()" class="bg-green-700 text-white font-black px-8 py-3 rounded-2xl text-base hover:bg-green-600 transition shadow-lg">
        <i class="fas fa-print mr-2"></i>印刷する
      </button>
      <button onclick="downloadFlyer()" class="bg-blue-600 text-white font-black px-8 py-3 rounded-2xl text-base hover:bg-blue-500 transition shadow-lg">
        <i class="fas fa-download mr-2"></i>PNG保存
      </button>
    </div>
  </div>
  \`
}

// ── Flyer Patterns ─────────────────────────────────────────────
function renderFlyerPattern(id, p, co, imgUrl) {
  if (id === 1) return flyerPattern1(p, co, imgUrl)
  if (id === 2) return flyerPattern2(p, co, imgUrl)
  return flyerPattern3(p, co, imgUrl)
}

function imgHtml(url, placeholder, style='') {
  if (url) return \`<img src="\${url}" alt="物件" style="width:100%;height:100%;object-fit:cover;\${style}" />\`
  return \`<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:48px;opacity:0.4;">\${placeholder}</div>\`
}

function flyerPattern1(p, co, imgUrl) {
  const facs = (p.facilities||[]).slice(0, 10)
  const details = [
    ['築年月', p.built_year], ['階数', p.floors], ['構造', p.structure],
    ['土地面積', p.land_area ? p.land_area+'㎡' : null], ['駐車場', p.parking],
    ['バルコニー', p.balcony_area ? p.balcony_area+'㎡' : null],
  ].filter(([,v])=>v)
  return \`
  <div style="width:794px;min-height:1123px;background:#fff;font-family:'Noto Sans JP',sans-serif;position:relative;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#1a6b3c 0%,#2d9e5f 100%);padding:28px 36px 24px;color:#fff;">
      <div style="display:inline-block;background:#ff6b35;color:#fff;font-size:11px;padding:3px 10px;border-radius:3px;margin-bottom:8px;font-weight:700;">売出中</div>
      <div style="font-size:13px;opacity:0.85;margin-bottom:4px;">\${esc(p.catch_copy||'')}</div>
      <div style="font-size:28px;font-weight:900;line-height:1.3;margin-bottom:16px;">\${esc(p.name||'物件名未設定')}</div>
      <div style="display:flex;align-items:baseline;gap:12px;">
        <span style="font-size:12px;opacity:0.75;">販売価格</span>
        <span style="font-size:44px;font-weight:900;letter-spacing:-1px;">\${p.price ? Number(p.price).toLocaleString() : '-'}</span>
        <span style="font-size:16px;font-weight:700;">\${p.price_unit||'万円'}</span>
      </div>
      <div style="display:flex;gap:24px;margin-top:8px;">
        \${p.layout ? \`<div><span style="font-size:11px;opacity:0.75;display:block;">間取り</span><span style="font-size:14px;font-weight:700;">\${esc(p.layout)}</span></div>\` : ''}
        \${p.area ? \`<div><span style="font-size:11px;opacity:0.75;display:block;">専有面積</span><span style="font-size:14px;font-weight:700;">\${p.area}㎡</span></div>\` : ''}
      </div>
    </div>
    <div style="height:320px;background:#e8f4ed;overflow:hidden;">\${imgHtml(imgUrl,'🏠')}</div>
    <div style="padding:24px 36px;">
      \${p.address || p.station ? \`
      <div style="display:flex;gap:24px;padding:12px 0;border-top:1px solid #eee;border-bottom:1px solid #eee;margin-bottom:20px;">
        \${p.address ? \`<span style="font-size:12px;color:#444;">📍 \${esc(p.address)}</span>\` : ''}
        \${p.station ? \`<span style="font-size:12px;color:#444;">🚃 \${esc(p.station)} 徒歩\${p.walk_minutes||'?'}分</span>\` : ''}
      </div>\` : ''}
      \${details.length ? \`
      <div style="display:grid;grid-template-columns:1fr 1fr;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;margin-bottom:20px;">
        \${details.map(([l,v])=>\`
          <div style="padding:10px 16px;border-bottom:1px solid #e0e0e0;border-right:1px solid #e0e0e0;">
            <span style="font-size:10px;color:#888;display:block;margin-bottom:2px;">\${l}</span>
            <span style="font-size:13px;font-weight:600;color:#1a1a1a;">\${esc(v)}</span>
          </div>
        \`).join('')}
      </div>\` : ''}
      \${facs.length ? \`
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px;">
        \${facs.map(f=>\`<span style="background:#e8f4ed;color:#1a6b3c;font-size:11px;padding:4px 10px;border-radius:99px;font-weight:600;">\${f}</span>\`).join('')}
      </div>\` : ''}
    </div>
    <div style="background:#1a6b3c;padding:16px 36px;display:flex;align-items:center;justify-content:space-between;margin-top:auto;">
      <div style="color:#fff;">
        <div style="font-size:15px;font-weight:700;">\${esc(co?.name||'会社名未設定')}</div>
        <div style="font-size:22px;font-weight:900;letter-spacing:1px;">\${esc(co?.tel||'')}</div>
        <div style="font-size:10px;opacity:0.7;margin-top:2px;">\${esc(co?.license_no||'')}</div>
      </div>
      <div style="color:#fff;text-align:right;font-size:11px;opacity:0.8;">
        <div>\${esc(co?.address||'')}</div>
        <div>\${esc(co?.email||'')}</div>
      </div>
    </div>
  </div>
  \`
}

function flyerPattern2(p, co, imgUrl) {
  const facs = (p.facilities||[]).slice(0, 10)
  const details = [
    ['築年月', p.built_year], ['構造', p.structure], ['階数', p.floors],
    ['土地面積', p.land_area ? p.land_area+'㎡' : null], ['駐車場', p.parking],
    ['バルコニー', p.balcony_area ? p.balcony_area+'㎡' : null],
  ].filter(([,v])=>v)
  return \`
  <div style="width:794px;min-height:1123px;background:#0d1b2a;font-family:'Noto Serif JP',serif;color:#f5f0e8;position:relative;" class="flyer-pattern2">
    <div style="height:4px;background:linear-gradient(90deg,#c9a84c,#e8d48a,#c9a84c);"></div>
    <div style="padding:36px 48px 28px;border-bottom:1px solid rgba(201,168,76,0.3);">
      <div style="font-size:10px;letter-spacing:6px;color:#c9a84c;text-transform:uppercase;margin-bottom:20px;">\${esc(co?.name||'REAL ESTATE')}</div>
      <div style="font-size:30px;font-weight:700;line-height:1.4;margin-bottom:8px;">\${esc(p.name||'物件名未設定')}</div>
      <div style="font-size:13px;color:#c9a84c;font-style:italic;margin-bottom:20px;">\${esc(p.catch_copy||'')}</div>
      <div style="display:flex;align-items:baseline;gap:8px;">
        <span style="font-size:48px;font-weight:900;color:#c9a84c;letter-spacing:-2px;">\${p.price ? Number(p.price).toLocaleString() : '-'}</span>
        <span style="font-size:18px;color:#c9a84c;">\${p.price_unit||'万円'}</span>
      </div>
      <div style="display:flex;gap:32px;margin-top:12px;">
        \${p.layout ? \`<div style="text-align:center;"><span style="font-size:18px;font-weight:700;display:block;">\${esc(p.layout)}</span><span style="font-size:10px;color:#c9a84c;letter-spacing:2px;">間取り</span></div>\` : ''}
        \${p.area ? \`<div style="text-align:center;"><span style="font-size:18px;font-weight:700;display:block;">\${p.area}㎡</span><span style="font-size:10px;color:#c9a84c;letter-spacing:2px;">専有面積</span></div>\` : ''}
      </div>
    </div>
    <div style="padding:24px 48px 0;">
      <div style="height:300px;border-radius:4px;overflow:hidden;position:relative;">
        \${imgHtml(imgUrl,'🏛','opacity:0.9')}
        <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(13,27,42,0.5) 0%,transparent 60%);"></div>
      </div>
    </div>
    <div style="padding:28px 48px;">
      <hr style="border:none;border-top:1px solid rgba(201,168,76,0.3);margin:0 0 24px;" />
      \${p.address || p.station ? \`
      <div style="display:flex;gap:32px;margin-bottom:24px;">
        \${p.address ? \`<div><span style="font-size:10px;color:#c9a84c;letter-spacing:2px;display:block;margin-bottom:4px;">所在地</span><span style="font-size:12px;">\${esc(p.address)}</span></div>\` : ''}
        \${p.station ? \`<div><span style="font-size:10px;color:#c9a84c;letter-spacing:2px;display:block;margin-bottom:4px;">アクセス</span><span style="font-size:12px;">\${esc(p.station)} 徒歩\${p.walk_minutes||'?'}分</span></div>\` : ''}
      </div>\` : ''}
      \${details.length ? \`
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:12px;">
        <tbody>
          \${details.map(([l,v])=>\`<tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.08);color:#c9a84c;width:100px;letter-spacing:1px;">\${l}</td><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.08);">\${esc(v)}</td></tr>\`).join('')}
        </tbody>
      </table>\` : ''}
      \${facs.length ? \`
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px;">
        \${facs.map(f=>\`<span style="border:1px solid rgba(201,168,76,0.5);color:#c9a84c;font-size:11px;padding:4px 12px;letter-spacing:1px;">\${f}</span>\`).join('')}
      </div>\` : ''}
    </div>
    <div style="border-top:1px solid rgba(201,168,76,0.3);padding:20px 48px;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-size:16px;font-weight:700;letter-spacing:2px;">\${esc(co?.name||'会社名未設定')}</div>
        <div style="font-size:11px;color:#888;margin-top:4px;">\${esc(co?.address||'')}</div>
        <div style="font-size:11px;color:#888;">\${esc(co?.license_no||'')}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:22px;color:#c9a84c;font-weight:900;letter-spacing:2px;">\${esc(co?.tel||'')}</div>
        <div style="font-size:11px;color:#888;margin-top:4px;">\${esc(co?.email||'')}</div>
      </div>
    </div>
    <div style="height:4px;background:linear-gradient(90deg,#c9a84c,#e8d48a,#c9a84c);"></div>
  </div>
  \`
}

function flyerPattern3(p, co, imgUrl) {
  const facs = (p.facilities||[]).slice(0, 10)
  const details = [
    ['築年月', p.built_year], ['構造', p.structure], ['階数', p.floors],
    ['土地面積', p.land_area ? p.land_area+'㎡' : null], ['駐車場', p.parking],
    ['バルコニー', p.balcony_area ? p.balcony_area+'㎡' : null],
  ].filter(([,v])=>v)
  return \`
  <div style="width:794px;min-height:1123px;background:#fffbf7;font-family:'Noto Sans JP',sans-serif;position:relative;">
    <div style="background:#ff6b35;height:8px;"></div>
    <div style="padding:32px 40px 0;">
      <div style="display:inline-block;background:#ff6b35;color:#fff;font-weight:900;font-size:12px;padding:5px 14px;border-radius:99px;margin-bottom:12px;">🏡 売出中</div>
      <div style="font-size:32px;font-weight:900;color:#1a1a1a;line-height:1.3;margin-bottom:8px;">\${esc(p.name||'物件名未設定')}</div>
      <div style="font-size:15px;color:#ff6b35;font-weight:700;margin-bottom:20px;">\${esc(p.catch_copy||'')}</div>
      <div style="background:#fff3ee;border:2px solid #ff6b35;border-radius:12px;padding:16px 24px;display:inline-flex;align-items:baseline;gap:8px;margin-bottom:20px;">
        <span style="font-size:52px;font-weight:900;color:#ff6b35;line-height:1;">\${p.price ? Number(p.price).toLocaleString() : '-'}</span>
        <span style="font-size:18px;color:#ff6b35;font-weight:700;">\${p.price_unit||'万円'}</span>
      </div>
      <div style="display:flex;gap:12px;margin-bottom:24px;">
        \${p.layout ? \`<div style="background:#fff;border:2px solid #e0e0e0;border-radius:10px;padding:10px 18px;text-align:center;"><span style="font-size:18px;font-weight:900;color:#1a1a1a;display:block;">\${esc(p.layout)}</span><span style="font-size:10px;color:#888;">間取り</span></div>\` : ''}
        \${p.area ? \`<div style="background:#fff;border:2px solid #e0e0e0;border-radius:10px;padding:10px 18px;text-align:center;"><span style="font-size:18px;font-weight:900;color:#1a1a1a;display:block;">\${p.area}㎡</span><span style="font-size:10px;color:#888;">専有面積</span></div>\` : ''}
        \${p.station ? \`<div style="background:#fff;border:2px solid #e0e0e0;border-radius:10px;padding:10px 18px;text-align:center;"><span style="font-size:18px;font-weight:900;color:#1a1a1a;display:block;">徒歩\${p.walk_minutes||'?'}分</span><span style="font-size:10px;color:#888;">\${esc(p.station)}</span></div>\` : ''}
      </div>
    </div>
    <div style="margin:0 40px;height:300px;border-radius:16px;overflow:hidden;background:#ffe8dc;">\${imgHtml(imgUrl,'🏠')}</div>
    <div style="padding:24px 40px;">
      \${p.address || p.station ? \`
      <div style="background:#fff;border:1px solid #ffe0d0;border-radius:12px;padding:14px 20px;margin-bottom:20px;display:flex;gap:24px;">
        \${p.address ? \`<span style="font-size:12px;color:#333;display:flex;align-items:center;gap:6px;">📍 \${esc(p.address)}</span>\` : ''}
        \${p.station ? \`<span style="font-size:12px;color:#333;display:flex;align-items:center;gap:6px;">🚃 \${esc(p.station)} 徒歩\${p.walk_minutes||'?'}分</span>\` : ''}
      </div>\` : ''}
      \${details.length ? \`
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px;">
        \${details.map(([l,v])=>\`
          <div style="background:#fff;border:1px solid #eee;border-radius:10px;padding:10px 14px;">
            <span style="font-size:10px;color:#aaa;display:block;margin-bottom:4px;">\${l}</span>
            <span style="font-size:13px;font-weight:700;color:#333;">\${esc(v)}</span>
          </div>
        \`).join('')}
      </div>\` : ''}
      \${facs.length ? \`
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px;">
        \${facs.map(f=>\`<span style="background:#fff3ee;color:#ff6b35;border:1px solid #ffd5c0;font-size:12px;padding:5px 12px;border-radius:99px;font-weight:600;">\${f}</span>\`).join('')}
      </div>\` : ''}
    </div>
    <div style="margin:0 40px 32px;background:#1a1a1a;border-radius:16px;padding:20px 28px;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="color:#fff;font-weight:900;font-size:16px;">\${esc(co?.name||'会社名未設定')}</div>
        <div style="color:#888;font-size:10px;margin-top:4px;">\${esc(co?.address||'')}</div>
        <div style="color:#888;font-size:10px;">\${esc(co?.license_no||'')}</div>
      </div>
      <div style="text-align:right;">
        <div style="color:#ff6b35;font-weight:900;font-size:24px;letter-spacing:1px;">\${esc(co?.tel||'')}</div>
        <div style="color:#888;font-size:10px;margin-top:4px;">\${esc(co?.email||'')}</div>
      </div>
    </div>
  </div>
  \`
}

// ── Helper ─────────────────────────────────────────────────────
function esc(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function goTo(page) {
  state.page = page
  render()
}

function setSubPage(sub) {
  state.subPage = sub
  render()
}

function showAiTab(tab) {
  state.aiTab = tab
  document.getElementById('ai-tab-image').className = \`text-xs font-bold px-3 py-1.5 rounded-lg border-2 \${tab==='image' ? 'border-purple-500 text-purple-700 bg-purple-50' : 'border-gray-200 text-gray-500'} transition\`
  document.getElementById('ai-tab-url').className = \`text-xs font-bold px-3 py-1.5 rounded-lg border-2 \${tab==='url' ? 'border-purple-500 text-purple-700 bg-purple-50' : 'border-gray-200 text-gray-500'} transition\`
  document.getElementById('ai-panel-image').style.display = tab==='image' ? 'block' : 'none'
  document.getElementById('ai-panel-url').style.display = tab==='url' ? 'block' : 'none'
}

function selectPattern(id) {
  state.selectedPattern = id
  const preview = document.getElementById('flyer-preview')
  if (preview) preview.innerHTML = renderFlyerPattern(id, state.currentProp, state.company, state.imageUrl)
  document.querySelectorAll('.pattern-btn').forEach((btn, i) => {
    const pt = [{id:1,color:'#1a6b3c'},{id:2,color:'#1a2d3d'},{id:3,color:'#ff6b35'}][i]
    if (pt.id === id) {
      btn.style.borderColor = pt.color
      btn.style.backgroundColor = pt.color + '11'
      btn.classList.add('active')
    } else {
      btn.style.borderColor = '#e5e7eb'
      btn.style.backgroundColor = '#fff'
      btn.classList.remove('active')
    }
    btn.innerHTML = \`<div class="font-black text-sm" style="color:\${pt.color}">\${['パターン1','パターン2','パターン3'][i]}</div><div class="text-xs text-gray-400 mt-1">\${['モダン・シンプル','ラグジュアリー','ポップ・明るい'][i]}</div>\${pt.id===id?'<div class="text-xs font-bold mt-1" style="color:'+pt.color+'"><i class=\\"fas fa-check mr-1\\"></i>選択中</div>':''}\`
  })
}

function clearImage() {
  state.imageUrl = ''
  state.imageKey = ''
  render()
}

function newProperty() {
  state.currentProp = {}
  state.imageUrl = ''
  state.imageKey = ''
  state.subPage = 'basic'
  state.aiTab = 'image'
  goTo('property')
}

// ── サンプルデータ ──────────────────────────────────────────────
function loadSampleData() {
  const samples = [
    {
      name: '緑ヶ丘シティレジデンス 302号室',
      catch_copy: '都心へ直通15分！緑豊かな閑静な住宅地',
      price: 4280, price_unit: '万円', layout: '3LDK',
      area: 78.5, address: '東京都世田谷区緑ヶ丘1-23-45',
      station: '自由が丘駅', walk_minutes: 8,
      built_year: '2018年築', floors: '10階建て 3階', structure: 'RC造',
      land_area: null, parking: '空きあり（月額15,000円）', balcony_area: 12.3,
      building_features: '全室南向き・採光良好。リノベーション済みで設備新品。',
      surrounding: 'スーパー徒歩3分、小学校徒歩5分、公園隣接。',
      interior: 'システムキッチン・浴室乾燥機・床暖房完備。',
      facilities: ['バス・トイレ別', 'エアコン', 'システムキッチン', 'オートロック', 'フローリング', 'バルコニー', 'エレベーター', '宅配ボックス', '床暖房'],
    },
    {
      name: 'パークビュー麻布十番',
      catch_copy: '希少な低層マンション。都心のオアシス。',
      price: 12800, price_unit: '万円', layout: '2LDK',
      area: 92.0, address: '東京都港区麻布十番2-10-8',
      station: '麻布十番駅', walk_minutes: 3,
      built_year: '2020年築', floors: '5階建て 4階', structure: 'SRC造',
      land_area: null, parking: '有（月額55,000円）', balcony_area: 18.0,
      building_features: '天井高2.7m、大理石フロア、輸入キッチン。',
      surrounding: '六本木ヒルズ徒歩10分、商店街徒歩1分。',
      interior: 'デザイナーズ仕様。ビルトインガレージ付き。',
      facilities: ['バス・トイレ別', 'エアコン', 'システムキッチン', 'オートロック', 'フローリング', 'バルコニー', 'エレベーター', '宅配ボックス', '床暖房', 'ウォークインクローゼット', '追い焚き'],
    },
    {
      name: '虹ヶ丘ファミリータウン 中古戸建て',
      catch_copy: '子育て世代に人気！広々4LDK・駐車2台可',
      price: 3580, price_unit: '万円', layout: '4LDK',
      area: 105.2, address: '神奈川県横浜市緑区虹ヶ丘1-5-12',
      station: '中山駅', walk_minutes: 12,
      built_year: '2010年築', floors: '2階建て', structure: '木造',
      land_area: 148.5, parking: '2台可', balcony_area: 8.0,
      building_features: '2024年外壁塗装・屋根修繕済。太陽光パネル搭載。',
      surrounding: '小学校まで徒歩2分。大型ショッピングモール車5分。',
      interior: 'リビング22帖・対面キッチン。全室収納完備。',
      facilities: ['駐車場', 'バス・トイレ別', 'エアコン', 'システムキッチン', 'フローリング', 'バルコニー', '床暖房', 'ウォークインクローゼット'],
    },
  ]
  const sample = samples[Math.floor(Math.random() * samples.length)]
  state.currentProp = { ...(state.currentProp || {}), ...sample }
  state.subPage = 'basic'
  render()
  toast('サンプルデータを読み込みました！内容を確認・修正してください')
}

// ── AI 解析 ────────────────────────────────────────────────────
async function runAiAnalyzeImage() {
  const fileInput = document.getElementById('ai-image-file')
  if (!fileInput?.files?.[0]) { toast('画像ファイルを選択してください', 'err'); return }
  const file = fileInput.files[0]

  // ファイルをBase64に変換
  const reader = new FileReader()
  reader.onload = async (e) => {
    const base64 = e.target.result
    showAiOverlay('チラシ画像を解析中...')
    try {
      const payload = { imageUrl: base64 }
      if (state.userApiKey) payload.apiKey = state.userApiKey
      const res = await api.post('/api/ai/analyze', payload)
      hideAiOverlay()
      if (res.needApiKey) {
        state.showApiKeyModal = true; render()
        return
      }
      if (res.data) {
        fillFormFromAI(res.data)
        toast('✨ AIが物件情報を読み込みました！内容を確認・修正してください')
      }
    } catch(err) {
      hideAiOverlay()
      if (err.message.includes('503') || err.message.includes('APIキー') || err.message.includes('needApiKey')) {
        state.showApiKeyModal = true; render()
      } else {
        toast('AI解析エラー: ' + err.message, 'err')
      }
    }
  }
  reader.readAsDataURL(file)
}

async function runAiAnalyzeUrl() {
  const urlInput = document.getElementById('ai-web-url')
  const webUrl = urlInput?.value?.trim()
  if (!webUrl) { toast('URLを入力してください', 'err'); return }
  if (!webUrl.startsWith('http')) { toast('http または https から始まるURLを入力してください', 'err'); return }
  state.webUrlInput = webUrl
  showAiOverlay('Webページを解析中...')
  try {
    const payload = { webUrl }
    if (state.userApiKey) payload.apiKey = state.userApiKey
    const res = await api.post('/api/ai/analyze', payload)
    hideAiOverlay()
    if (res.needApiKey) {
      state.showApiKeyModal = true; render()
      return
    }
    if (res.data) {
      fillFormFromAI(res.data)
      toast('✨ AIがWebページから物件情報を読み込みました！内容を確認してください')
    }
  } catch(err) {
    hideAiOverlay()
    if (err.message.includes('503') || err.message.includes('APIキー')) {
      state.showApiKeyModal = true; render()
    } else {
      toast('AI解析エラー: ' + err.message, 'err')
    }
  }
}

function fillFormFromAI(data) {
  // nullを除外してstateにマージ
  const cleaned = {}
  for (const [k, v] of Object.entries(data)) {
    if (v !== null && v !== undefined && v !== '') cleaned[k] = v
  }
  state.currentProp = { ...(state.currentProp || {}), ...cleaned }
  state.subPage = 'basic'
  render()
  // ページ上部にスクロール
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// ── Auth ───────────────────────────────────────────────────────
async function handleLogout() {
  try { await api.post('/api/auth/logout') } catch {}
  localStorage.removeItem('chirashi_token')
  state.user = null
  state.company = {}
  state.properties = []
  goTo('login')
}

async function loadDashboard() {
  const [comp, props] = await Promise.all([
    api.get('/api/company').catch(() => ({})),
    api.get('/api/properties').catch(() => []),
  ])
  state.company = comp || {}
  state.properties = Array.isArray(props) ? props : []
}

// ── Property Actions ───────────────────────────────────────────
async function openFlyer(id) {
  try {
    const prop = await api.get('/api/properties/'+id)
    state.currentProp = prop
    // 最初の画像があればセット
    if (prop.images && prop.images.length > 0) {
      state.imageUrl = '/api/files/'+encodeURIComponent(prop.images[0])
      state.imageKey = prop.images[0]
    } else {
      state.imageUrl = ''
      state.imageKey = ''
    }
    goTo('flyer')
  } catch(e) { toast(e.message, 'err') }
}

async function editProperty(e, id) {
  e.stopPropagation()
  try {
    const prop = await api.get('/api/properties/'+id)
    state.currentProp = prop
    if (prop.images && prop.images.length > 0) {
      state.imageUrl = '/api/files/'+encodeURIComponent(prop.images[0])
      state.imageKey = prop.images[0]
    } else { state.imageUrl = ''; state.imageKey = '' }
    state.subPage = 'basic'
    state.aiTab = 'image'
    goTo('property')
  } catch(e) { toast(e.message, 'err') }
}

async function deleteProperty(e, id) {
  e.stopPropagation()
  if (!confirm('この物件を削除しますか？')) return
  try {
    await api.del('/api/properties/'+id)
    await loadDashboard()
    render()
    toast('物件を削除しました')
  } catch(err) { toast(err.message, 'err') }
}

// ── Print ──────────────────────────────────────────────────────
function printFlyer() {
  const preview = document.getElementById('flyer-preview')
  if (!preview) return
  const printArea = document.getElementById('print-area')
  printArea.innerHTML = \`<div id="flyer-print-wrapper">\${preview.innerHTML}</div>\`
  printArea.style.display = 'block'
  window.print()
  setTimeout(() => { printArea.style.display = 'none' }, 100)
}

async function downloadFlyer() {
  const preview = document.getElementById('flyer-preview')
  if (!preview || typeof html2canvas === 'undefined') {
    toast('ダウンロード機能を読み込み中です。しばらくお待ちください。', 'err')
    return
  }
  toast('PNG画像を生成中...')
  try {
    const canvas = await html2canvas(preview, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
    })
    const link = document.createElement('a')
    const propName = (state.currentProp?.name || 'chirashi').replace(/[/\\\\:*?"<>|]/g, '_').substring(0, 30)
    link.download = \`\${propName}_pattern\${state.selectedPattern}.png\`
    link.href = canvas.toDataURL('image/png')
    link.click()
    toast('PNGを保存しました')
  } catch(e) {
    toast('PNG生成エラー: ' + e.message, 'err')
  }
}

// ── Events ─────────────────────────────────────────────────────
function attachEvents() {
  // Login
  const loginForm = document.getElementById('login-form')
  if (loginForm) loginForm.addEventListener('submit', async e => {
    e.preventDefault()
    const fd = new FormData(e.target)
    state.loading = true; render()
    try {
      const res = await api.post('/api/auth/login', { email: fd.get('email'), password: fd.get('password') })
      localStorage.setItem('chirashi_token', res.token)
      const u = await api.get('/api/auth/me')
      state.user = u
      await loadDashboard()
      state.loading = false
      goTo('dashboard')
    } catch(err) { state.loading = false; render(); toast(err.message, 'err') }
  })

  // Register
  const regForm = document.getElementById('register-form')
  if (regForm) regForm.addEventListener('submit', async e => {
    e.preventDefault()
    const fd = new FormData(e.target)
    state.loading = true; render()
    try {
      const res = await api.post('/api/auth/register', { email: fd.get('email'), password: fd.get('password') })
      localStorage.setItem('chirashi_token', res.token)
      const u = await api.get('/api/auth/me')
      state.user = u
      state.loading = false
      goTo('company')
    } catch(err) { state.loading = false; render(); toast(err.message, 'err') }
  })

  // Company
  const coForm = document.getElementById('company-form')
  if (coForm) coForm.addEventListener('submit', async e => {
    e.preventDefault()
    const fd = new FormData(e.target)
    const data = Object.fromEntries(fd.entries())
    state.loading = true; render()
    try {
      await api.post('/api/company', data)
      state.company = data
      await loadDashboard()
      state.loading = false
      toast('会社情報を保存しました')
      goTo('dashboard')
    } catch(err) { state.loading = false; render(); toast(err.message, 'err') }
  })

  // Property form submit
  const propForm = document.getElementById('property-form')
  if (propForm) propForm.addEventListener('submit', async e => {
    e.preventDefault()
    const fd = new FormData(e.target)
    const data = {
      name: fd.get('name'),
      catch_copy: fd.get('catch_copy'),
      price: Number(fd.get('price')) || null,
      price_unit: '万円',
      layout: fd.get('layout'),
      area: Number(fd.get('area')) || null,
      address: fd.get('address'),
      station: fd.get('station'),
      walk_minutes: Number(fd.get('walk_minutes')) || null,
      built_year: fd.get('built_year'),
      floors: fd.get('floors'),
      structure: fd.get('structure'),
      land_area: Number(fd.get('land_area')) || null,
      parking: fd.get('parking'),
      balcony_area: Number(fd.get('balcony_area')) || null,
      building_features: fd.get('building_features'),
      surrounding: fd.get('surrounding'),
      interior: fd.get('interior'),
      facilities: FACILITIES.filter(f => fd.get('facility_'+f) === 'on'),
      images: state.imageKey ? [state.imageKey] : (state.currentProp?.images || []),
    }
    state.loading = true; render()
    try {
      if (state.currentProp?.id) {
        await api.put('/api/properties/'+state.currentProp.id, data)
        toast('物件情報を更新しました')
      } else {
        const res = await api.post('/api/properties', data)
        data.id = res.id
        toast('物件を登録しました')
      }
      await loadDashboard()
      state.currentProp = { ...(state.currentProp||{}), ...data }
      state.loading = false
      goTo('flyer')
    } catch(err) { state.loading = false; render(); toast(err.message, 'err') }
  })

  // Property image upload (in form)
  const propImg = document.getElementById('prop-image-upload')
  if (propImg) propImg.addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return
    const fd = new FormData(); fd.append('file', file); fd.append('folder', 'properties')
    try {
      const res = await api.upload('/api/upload', fd)
      state.imageUrl = '/api/files/'+encodeURIComponent(res.key)
      state.imageKey = res.key
      toast('画像をアップロードしました')
      // 画像タブに切り替え
      state.subPage = 'image'
      render()
    } catch(err) { toast(err.message, 'err') }
  })

  // Flyer image upload
  const flyerImg = document.getElementById('flyer-image-upload')
  if (flyerImg) flyerImg.addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return
    const fd = new FormData(); fd.append('file', file); fd.append('folder', 'properties')
    try {
      const res = await api.upload('/api/upload', fd)
      state.imageUrl = '/api/files/'+encodeURIComponent(res.key)
      state.imageKey = res.key
      toast('画像をアップロードしました')
      const preview = document.getElementById('flyer-preview')
      if (preview) preview.innerHTML = renderFlyerPattern(state.selectedPattern, state.currentProp, state.company, state.imageUrl)
      // サムネイル更新
      const imgEl = document.querySelector('#flyer-image-upload ~ img')
      if (!imgEl) {
        const span = document.querySelector('#flyer-image-upload ~ span')
        if (span) span.outerHTML = \`<img src="\${state.imageUrl}" class="h-10 rounded-lg object-cover" />\`
      } else {
        imgEl.src = state.imageUrl
      }
    } catch(err) { toast(err.message, 'err') }
  })

  // Facility checkbox style
  document.querySelectorAll('.facility-check').forEach(cb => {
    cb.addEventListener('change', () => {
      const label = document.getElementById('fl-'+cb.dataset.facility)
      if (label) {
        if (cb.checked) { label.style.borderColor = '#22c55e'; label.style.backgroundColor = '#f0fdf4' }
        else { label.style.borderColor = '#e5e7eb'; label.style.backgroundColor = '#f9fafb' }
      }
    })
  })
}

// ── Init ───────────────────────────────────────────────────────
state.aiTab = 'image'
const savedToken = localStorage.getItem('chirashi_token')
if (savedToken) {
  api.get('/api/auth/me').then(async u => {
    state.user = u
    await loadDashboard()
    goTo('dashboard')
  }).catch(() => {
    localStorage.removeItem('chirashi_token')
    render()
  })
} else {
  render()
}
</script>
</body>
</html>`
}

export default app
