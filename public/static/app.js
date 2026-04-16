// ══════════════════════════════════════════
// STATE
// ══════════════════════════════════════════
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
  subPage: 'basic',
  aiTab: 'image',
  webUrlInput: '',
  userApiKey: localStorage.getItem('chirashi_openai_key') || '',
  showApiKeyModal: false,
}

// ══════════════════════════════════════════
// API CLIENT
// ══════════════════════════════════════════
const api = {
  token: () => localStorage.getItem('chirashi_token'),
  async req(method, path, body, isForm = false) {
    const headers = {}
    if (this.token()) headers['Authorization'] = `Bearer ${this.token()}`
    if (!isForm && body) headers['Content-Type'] = 'application/json'
    const res = await fetch(path, {
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

// ══════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════
function esc(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}
function num(v) { return v !== null && v !== undefined && v !== '' ? Number(v) : null }
function fmt(v) { return v != null ? Number(v).toLocaleString() : '-' }

function toast(text, type = 'ok') {
  const el = document.getElementById('toast')
  el.textContent = text
  el.className = `fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl font-semibold text-sm shadow-xl ${type==='err' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`
  el.style.display = 'block'; el.style.opacity = '1'
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.style.display = 'none', 300) }, 3500)
}

function showAiOverlay(msg = 'AIが解析中...') {
  let el = document.getElementById('ai-overlay')
  if (!el) { el = document.createElement('div'); el.id = 'ai-overlay'; document.body.appendChild(el) }
  el.innerHTML = `<div class="box"><div class="spinner"></div><div style="font-weight:700;font-size:15px;color:#4c1d95;margin-bottom:6px;">${msg}</div><div style="font-size:12px;color:#888;">しばらくお待ちください...</div></div>`
  el.style.display = 'flex'
}
function hideAiOverlay() { const el = document.getElementById('ai-overlay'); if(el) el.style.display='none' }

function goTo(page) { state.page = page; render() }
function setSubPage(sub) { state.subPage = sub; render() }

function render() {
  const app = document.getElementById('app')
  switch(state.page) {
    case 'login':     app.innerHTML = renderLogin(); break
    case 'register':  app.innerHTML = renderRegister(); break
    case 'dashboard': app.innerHTML = renderDashboard(); break
    case 'company':   app.innerHTML = renderCompany(); break
    case 'property':  app.innerHTML = renderProperty(); break
    case 'flyer':     app.innerHTML = renderFlyer(); break
  }
  attachEvents()
  if (state.showApiKeyModal) {
    const m = document.createElement('div')
    m.innerHTML = renderApiKeyModal()
    document.body.appendChild(m.firstElementChild)
    document.getElementById('apikey-input')?.focus()
  }
}

// ══════════════════════════════════════════
// NAV
// ══════════════════════════════════════════
function renderNav() {
  return `
  <nav class="bg-gray-900 h-14 flex items-center justify-between px-4 shadow-lg sticky top-0 z-40">
    <button onclick="goTo('dashboard')" class="text-white font-black text-base flex items-center gap-2 hover:text-green-400 transition">
      <i class="fas fa-home-alt"></i><span class="hidden sm:inline">不動産チラシ生成</span>
    </button>
    <div class="flex items-center gap-2">
      <span class="text-gray-400 text-xs hidden md:block">${esc(state.user?.email||'')}</span>
      <button onclick="goTo('company')" class="text-white border border-gray-600 rounded-lg px-2.5 py-1.5 text-xs hover:border-green-400 hover:text-green-400 transition">
        <i class="fas fa-building mr-1"></i>会社情報
      </button>
      <button onclick="state.showApiKeyModal=true;render()" class="text-white border border-gray-600 rounded-lg px-2.5 py-1.5 text-xs hover:border-purple-400 hover:text-purple-400 transition" title="OpenAI APIキー設定">
        <i class="fas fa-key mr-1"></i>AIキー
        ${state.userApiKey ? '<span class="text-purple-400">●</span>' : ''}
      </button>
      <button onclick="handleLogout()" class="text-white border border-gray-600 rounded-lg px-2.5 py-1.5 text-xs hover:border-red-400 hover:text-red-400 transition">
        <i class="fas fa-sign-out-alt"></i>
      </button>
    </div>
  </nav>`
}

// ══════════════════════════════════════════
// API KEY MODAL
// ══════════════════════════════════════════
function renderApiKeyModal() {
  return `
  <div id="apikey-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;">
    <div style="background:#fff;border-radius:20px;padding:36px 40px;width:460px;max-width:92vw;">
      <div style="text-align:center;margin-bottom:20px;">
        <div style="font-size:36px;margin-bottom:8px;">🔑</div>
        <h2 style="font-size:18px;font-weight:900;">OpenAI APIキーの設定</h2>
        <p style="font-size:12px;color:#666;margin-top:4px;">AI自動入力機能を使うには有効なAPIキーが必要です</p>
      </div>
      <div style="background:#fff3e0;border:1.5px solid #ffcc80;border-radius:10px;padding:12px;margin-bottom:12px;font-size:11px;color:#e65100;">
        ⚠️ システムのAPIキーが無効または期限切れのため、お手持ちのOpenAI APIキーが必要です。
      </div>
      <div style="background:#f0f9ff;border:1.5px solid #bae6fd;border-radius:10px;padding:12px;margin-bottom:16px;font-size:11px;color:#0369a1;">
        取得方法：<a href="https://platform.openai.com/api-keys" target="_blank" style="font-weight:700;">platform.openai.com</a> → API Keys → Create new secret key<br>
        入力したキーはブラウザのローカルストレージに保存され、サーバーには送信されません。
      </div>
      <input id="apikey-input" type="password" placeholder="sk-proj-..." value="${esc(state.userApiKey||'')}"
        style="width:100%;padding:12px;border:2px solid #e0e0e0;border-radius:12px;font-size:13px;margin-bottom:16px;box-sizing:border-box;" />
      <div style="display:flex;gap:10px;">
        <button onclick="saveApiKey()" style="flex:1;background:#7c3aed;color:#fff;border:none;padding:12px;border-radius:12px;font-weight:700;cursor:pointer;">保存</button>
        <button onclick="closeApiKeyModal()" style="border:2px solid #e0e0e0;background:#fff;color:#666;padding:12px 18px;border-radius:12px;font-weight:700;cursor:pointer;">閉じる</button>
      </div>
    </div>
  </div>`
}
function saveApiKey() {
  const k = document.getElementById('apikey-input')?.value?.trim()
  if (k) { state.userApiKey = k; localStorage.setItem('chirashi_openai_key', k); toast('APIキーを保存しました') }
  state.showApiKeyModal = false; render()
}
function closeApiKeyModal() { state.showApiKeyModal = false; render() }

// ══════════════════════════════════════════
// LOGIN / REGISTER
// ══════════════════════════════════════════
function renderLogin() {
  return `
  <div class="min-h-screen bg-gradient-to-br from-green-900 to-gray-900 flex items-center justify-center p-4">
    <div class="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
      <div class="text-center mb-8">
        <div class="text-5xl mb-3">🏠</div>
        <h1 class="text-2xl font-black text-gray-800">不動産チラシ生成</h1>
        <p class="text-gray-400 text-sm mt-1">AI搭載・4パターン自動生成</p>
      </div>
      <form id="login-form" class="space-y-4">
        <div><label class="block text-xs font-semibold text-gray-500 mb-1.5">メールアドレス</label>
          <input name="email" type="email" required placeholder="email@example.com" class="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
        <div><label class="block text-xs font-semibold text-gray-500 mb-1.5">パスワード</label>
          <input name="password" type="password" required placeholder="••••••••" class="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
        <button type="submit" class="w-full bg-green-700 hover:bg-green-600 text-white font-bold py-3 rounded-xl text-sm transition">
          ${state.loading ? '<i class="fas fa-spinner" style="animation:spin 1s linear infinite;display:inline-block"></i> ログイン中...' : '<i class="fas fa-sign-in-alt mr-2"></i>ログイン'}
        </button>
      </form>
      <div class="text-center mt-4 text-sm text-gray-500">
        アカウントをお持ちでない方は
        <button onclick="goTo('register')" class="text-green-700 font-bold hover:underline ml-1">新規登録</button>
      </div>
    </div>
  </div>`
}

function renderRegister() {
  return `
  <div class="min-h-screen bg-gradient-to-br from-green-900 to-gray-900 flex items-center justify-center p-4">
    <div class="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
      <div class="text-center mb-8"><div class="text-5xl mb-3">🏠</div><h1 class="text-2xl font-black text-gray-800">新規登録</h1></div>
      <form id="register-form" class="space-y-4">
        <div><label class="block text-xs font-semibold text-gray-500 mb-1.5">メールアドレス</label>
          <input name="email" type="email" required class="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
        <div><label class="block text-xs font-semibold text-gray-500 mb-1.5">パスワード（8文字以上）</label>
          <input name="password" type="password" minlength="8" required class="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
        <button type="submit" class="w-full bg-green-700 hover:bg-green-600 text-white font-bold py-3 rounded-xl text-sm transition">
          ${state.loading ? '登録中...' : '<i class="fas fa-user-plus mr-2"></i>登録する'}
        </button>
      </form>
      <div class="text-center mt-4 text-sm">
        <button onclick="goTo('login')" class="text-green-700 font-bold hover:underline">← ログインへ戻る</button>
      </div>
    </div>
  </div>`
}

// ══════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════
function renderDashboard() {
  const props = state.properties
  const noCompany = !state.company?.name
  return `
  ${renderNav()}
  <div class="max-w-4xl mx-auto p-4">
    ${noCompany ? `<div class="bg-orange-50 border-2 border-orange-200 rounded-2xl p-3 mb-4 flex justify-between items-center">
      <span class="text-sm text-orange-800"><i class="fas fa-exclamation-triangle mr-2"></i>会社情報が未設定です</span>
      <button onclick="goTo('company')" class="bg-orange-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg">設定する</button>
    </div>` : ''}
    <div class="flex justify-between items-center mb-4">
      <h1 class="text-xl font-black text-gray-800"><i class="fas fa-list mr-2 text-green-700"></i>物件一覧</h1>
      <button onclick="newProperty()" class="bg-green-700 hover:bg-green-600 text-white font-bold px-4 py-2 rounded-xl text-sm transition">
        <i class="fas fa-plus mr-1"></i>新規物件登録
      </button>
    </div>
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100">
      ${props.length === 0 ? `<div class="text-center py-16 text-gray-400"><div class="text-5xl mb-3">🏡</div><p>物件がまだありません</p><p class="text-sm mt-1">「新規物件登録」から始めましょう</p></div>`
      : props.map(p => `
        <div class="prop-card border-b border-gray-100 p-4 flex justify-between items-center cursor-pointer" onclick="openFlyer('${p.id}')">
          <div>
            <div class="font-bold text-gray-800">${esc(p.name||'無題')}</div>
            <div class="text-sm text-gray-500 mt-0.5">
              <span class="text-green-700 font-bold">${p.price ? fmt(p.price) : '-'}万円</span>
              <span class="mx-2">·</span>${esc(p.layout||'-')}
              <span class="mx-2">·</span>${esc(p.address||'-')}
            </div>
          </div>
          <div class="flex gap-2">
            <button onclick="editProperty(event,'${p.id}')" class="bg-green-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-green-600"><i class="fas fa-edit mr-1"></i>編集</button>
            <button onclick="deleteProperty(event,'${p.id}')" class="bg-white text-red-600 border border-red-200 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-red-50"><i class="fas fa-trash"></i></button>
          </div>
        </div>
      `).join('')}
    </div>
  </div>`
}

// ══════════════════════════════════════════
// COMPANY
// ══════════════════════════════════════════
function renderCompany() {
  const co = state.company || {}
  return `
  ${renderNav()}
  <div class="max-w-2xl mx-auto p-4">
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h1 class="text-xl font-black text-gray-800 mb-6"><i class="fas fa-building mr-2 text-green-700"></i>会社情報</h1>
      <form id="company-form" class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div><label class="block text-xs font-semibold text-gray-500 mb-1">会社名 *</label>
            <input name="name" required value="${esc(co.name||'')}" class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
          <div><label class="block text-xs font-semibold text-gray-500 mb-1">電話番号</label>
            <input name="tel" value="${esc(co.tel||'')}" class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="block text-xs font-semibold text-gray-500 mb-1">メールアドレス</label>
            <input name="email" type="email" value="${esc(co.email||'')}" class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
          <div><label class="block text-xs font-semibold text-gray-500 mb-1">宅建業者番号</label>
            <input name="license_no" value="${esc(co.license_no||'')}" placeholder="国土交通大臣（1）第XXXXX号" class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
        </div>
        <div><label class="block text-xs font-semibold text-gray-500 mb-1">住所</label>
          <input name="address" value="${esc(co.address||'')}" class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
        <div class="flex gap-3 pt-2">
          <button type="submit" class="bg-green-700 text-white font-bold px-6 py-2.5 rounded-xl text-sm hover:bg-green-600">${state.loading ? '保存中...' : '<i class="fas fa-save mr-1"></i>保存する'}</button>
          <button type="button" onclick="goTo('dashboard')" class="border-2 border-green-700 text-green-700 font-bold px-5 py-2.5 rounded-xl text-sm">キャンセル</button>
        </div>
      </form>
    </div>
  </div>`
}

// ══════════════════════════════════════════
// FACILITIES LIST
// ══════════════════════════════════════════
const FACILITIES = [
  '駐車場','バス・トイレ別','エアコン','システムキッチン','オートロック','フローリング',
  'バルコニー','エレベーター','宅配ボックス','床暖房','ウォークインクローゼット','追い焚き',
  'インターネット無料','BS/CS','浴室乾燥機','洗面台独立','室内洗濯機置場','モニター付インターホン','24時間ゴミ出し可'
]

// ══════════════════════════════════════════
// PROPERTY FORM
// ══════════════════════════════════════════
function renderProperty() {
  const p = state.currentProp || {}
  const isEdit = !!p.id
  const tab = state.subPage
  const aiTab = state.aiTab || 'image'
  return `
  ${renderNav()}
  <div class="max-w-3xl mx-auto p-4">
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div class="flex justify-between items-center mb-5">
        <h1 class="text-lg font-black text-gray-800"><i class="fas fa-${isEdit?'edit':'plus-circle'} mr-2 text-green-700"></i>${isEdit?'物件を編集':'物件を新規登録'}</h1>
      </div>

      <!-- AI自動入力パネル -->
      <div class="bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-200 rounded-2xl p-4 mb-5">
        <div class="flex items-center justify-between mb-3">
          <span class="text-purple-700 font-black text-sm"><i class="fas fa-magic mr-1"></i>AI自動入力</span>
          <button onclick="loadSampleData()" class="text-xs font-bold px-3 py-1.5 rounded-lg border-2 border-gray-300 text-gray-600 hover:border-green-500 bg-white">
            <i class="fas fa-database mr-1"></i>サンプル
          </button>
        </div>
        <!-- AIタブ -->
        <div class="flex gap-2 mb-3 flex-wrap">
          <button onclick="switchAiTab('image')" class="ai-tab-btn text-xs font-bold px-3 py-1.5 rounded-lg border-2 ${aiTab==='image'?'border-purple-500 text-purple-700 bg-purple-50':'border-gray-200 text-gray-500 bg-white'}">
            <i class="fas fa-image mr-1"></i>画像
          </button>
          <button onclick="switchAiTab('pdf')" class="ai-tab-btn text-xs font-bold px-3 py-1.5 rounded-lg border-2 ${aiTab==='pdf'?'border-purple-500 text-purple-700 bg-purple-50':'border-gray-200 text-gray-500 bg-white'}">
            <i class="fas fa-file-pdf mr-1"></i>PDF
          </button>
          <button onclick="switchAiTab('csv')" class="ai-tab-btn text-xs font-bold px-3 py-1.5 rounded-lg border-2 ${aiTab==='csv'?'border-purple-500 text-purple-700 bg-purple-50':'border-gray-200 text-gray-500 bg-white'}">
            <i class="fas fa-file-csv mr-1"></i>CSV
          </button>
          <button onclick="switchAiTab('url')" class="ai-tab-btn text-xs font-bold px-3 py-1.5 rounded-lg border-2 ${aiTab==='url'?'border-purple-500 text-purple-700 bg-purple-50':'border-gray-200 text-gray-500 bg-white'}">
            <i class="fas fa-link mr-1"></i>URL
          </button>
        </div>
        <!-- 画像タブ -->
        <div id="ai-panel-image" style="display:${aiTab==='image'?'block':'none'}">
          <div class="flex gap-2 items-center flex-wrap">
            <input type="file" id="ai-image-file" accept="image/*,application/pdf" class="text-xs flex-1 min-w-0 border-2 border-purple-200 rounded-xl px-3 py-2 bg-white cursor-pointer" />
            <button onclick="runAiAnalyzeImage()" class="bg-purple-600 text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-purple-700 whitespace-nowrap">
              <i class="fas fa-search mr-1"></i>AIで解析
            </button>
          </div>
          <p class="text-xs text-gray-400 mt-2"><i class="fas fa-info-circle mr-1"></i>不動産チラシの画像（JPG/PNG）を選択するとAIが全項目を自動入力します</p>
        </div>
        <!-- PDFタブ -->
        <div id="ai-panel-pdf" style="display:${aiTab==='pdf'?'block':'none'}">
          <div class="flex gap-2 items-center flex-wrap">
            <input type="file" id="ai-pdf-file" accept="application/pdf" class="text-xs flex-1 min-w-0 border-2 border-purple-200 rounded-xl px-3 py-2 bg-white cursor-pointer" />
            <button onclick="runAiAnalyzePdf()" class="bg-purple-600 text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-purple-700 whitespace-nowrap">
              <i class="fas fa-search mr-1"></i>PDFを解析
            </button>
          </div>
          <p class="text-xs text-gray-400 mt-2"><i class="fas fa-info-circle mr-1"></i>募集図面などのPDFから全項目をAIが自動抽出します（pdf.js使用）</p>
          <div id="pdf-page-preview" class="mt-3 hidden">
            <p class="text-xs text-gray-500 mb-2">PDFプレビュー（1ページ目）:</p>
            <canvas id="pdf-canvas" style="max-width:100%;border:1px solid #ddd;border-radius:8px;"></canvas>
          </div>
        </div>
        <!-- CSVタブ -->
        <div id="ai-panel-csv" style="display:${aiTab==='csv'?'block':'none'}">
          <div class="flex gap-2 items-center flex-wrap">
            <input type="file" id="ai-csv-file" accept=".csv,text/csv" class="text-xs flex-1 min-w-0 border-2 border-purple-200 rounded-xl px-3 py-2 bg-white cursor-pointer" />
            <button onclick="runCsvImport()" class="bg-purple-600 text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-purple-700 whitespace-nowrap">
              <i class="fas fa-table mr-1"></i>CSVを取り込む
            </button>
          </div>
          <p class="text-xs text-gray-400 mt-2"><i class="fas fa-info-circle mr-1"></i>data-rule.md 準拠のCSVファイルから全項目を一括転記します</p>
          <div id="csv-preview" class="mt-3 hidden">
            <p class="text-xs text-gray-500 mb-1">読み取りプレビュー:</p>
            <div id="csv-preview-content" class="text-xs bg-gray-50 p-2 rounded-lg max-h-32 overflow-auto font-mono"></div>
          </div>
        </div>
        <!-- URLタブ -->
        <div id="ai-panel-url" style="display:${aiTab==='url'?'block':'none'}">
          <div class="flex gap-2 items-center flex-wrap">
            <input type="text" id="ai-web-url" placeholder="https://suumo.jp/..." value="${esc(state.webUrlInput||'')}"
              class="flex-1 min-w-0 text-xs border-2 border-purple-200 rounded-xl px-3 py-2 bg-white outline-none" />
            <button onclick="runAiAnalyzeUrl()" class="bg-purple-600 text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-purple-700 whitespace-nowrap">
              <i class="fas fa-search mr-1"></i>AIで解析
            </button>
          </div>
          <p class="text-xs text-gray-400 mt-2"><i class="fas fa-info-circle mr-1"></i>SUUMO、HOME'S などの物件ページURLから情報を抽出します</p>
        </div>
      </div>

      <!-- フォームタブ -->
      <form id="property-form">
        <div class="flex border-b border-gray-200 mb-5 gap-4 overflow-x-auto">
          <button type="button" onclick="setSubPage('basic')" class="tab-btn pb-2 text-sm font-semibold text-gray-500 whitespace-nowrap ${tab==='basic'?'active':''}">基本情報</button>
          <button type="button" onclick="setSubPage('rental')" class="tab-btn pb-2 text-sm font-semibold text-gray-500 whitespace-nowrap ${tab==='rental'?'active':''}">賃貸条件</button>
          <button type="button" onclick="setSubPage('detail')" class="tab-btn pb-2 text-sm font-semibold text-gray-500 whitespace-nowrap ${tab==='detail'?'active':''}">建物・設備</button>
          <button type="button" onclick="setSubPage('extra')" class="tab-btn pb-2 text-sm font-semibold text-gray-500 whitespace-nowrap ${tab==='extra'?'active':''}">特約・備考</button>
          <button type="button" onclick="setSubPage('image')" class="tab-btn pb-2 text-sm font-semibold text-gray-500 whitespace-nowrap ${tab==='image'?'active':''}">物件画像</button>
        </div>

        <!-- 基本情報タブ -->
        <div id="tab-basic" style="display:${tab==='basic'?'block':'none'}">
          <div class="space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <div class="col-span-2"><label class="block text-xs font-semibold text-gray-500 mb-1">物件名 *</label>
                <input id="f-name" name="name" required value="${esc(p.name||'')}" placeholder="パークシティ〇〇 402号室"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
              <div class="col-span-2"><label class="block text-xs font-semibold text-gray-500 mb-1">キャッチコピー</label>
                <input id="f-catch_copy" name="catch_copy" value="${esc(p.catch_copy||'')}" placeholder="駅徒歩3分！角部屋・南向き"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
            </div>
            <div class="grid grid-cols-3 gap-3">
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">物件種別</label>
                <input id="f-物件種別" name="物件種別" value="${esc(p['物件種別']||'')}" placeholder="賃貸マンション"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">間取り</label>
                <input id="f-layout" name="layout" value="${esc(p.layout||p['間取りタイプ']||'')}" placeholder="2LDK"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">部屋番号</label>
                <input id="f-部屋番号" name="部屋番号" value="${esc(p['部屋番号']||'')}" placeholder="402号室"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">所在地</label>
                <input id="f-address" name="address" value="${esc(p.address||p['所在地']||'')}"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">住居表示</label>
                <input id="f-住居表示" name="住居表示" value="${esc(p['住居表示']||'')}"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
            </div>
            <div class="grid grid-cols-3 gap-3">
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">路線①</label>
                <input id="f-交通1_路線" name="交通1_路線" value="${esc(p['交通1_路線']||'')}" placeholder="JR山手線"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">駅名①</label>
                <input id="f-station" name="station" value="${esc(p.station||p['交通1_駅名']||'')}" placeholder="渋谷駅"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">徒歩①（分）</label>
                <input id="f-walk_minutes" name="walk_minutes" type="number" value="${p.walk_minutes||p['交通1_徒歩分']||''}"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
            </div>
            <div class="grid grid-cols-3 gap-3">
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">路線②</label>
                <input id="f-交通2_路線" name="交通2_路線" value="${esc(p['交通2_路線']||'')}"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">駅名②</label>
                <input id="f-交通2_駅名" name="交通2_駅名" value="${esc(p['交通2_駅名']||'')}"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">徒歩②（分）</label>
                <input id="f-交通2_徒歩分" name="交通2_徒歩分" type="number" value="${p['交通2_徒歩分']||''}"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">現況</label>
                <input id="f-現況" name="現況" value="${esc(p['現況']||'')}" placeholder="空室"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">入居可能日</label>
                <input id="f-入居日" name="入居日" value="${esc(p['入居日']||'')}" placeholder="即入居可"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
            </div>
          </div>
        </div>

        <!-- 賃貸条件タブ -->
        <div id="tab-rental" style="display:${tab==='rental'?'block':'none'}">
          <div class="space-y-3">
            <div class="grid grid-cols-3 gap-3">
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">賃料（円）</label>
                <input id="f-賃料_円" name="賃料_円" type="number" value="${p['賃料_円']||p.price||''}" placeholder="58000"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">管理費（円/月）</label>
                <input id="f-管理費_円月" name="管理費_円月" type="number" value="${p['管理費_円月']||''}" placeholder="3000"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">共益費（円/月）</label>
                <input id="f-共益費_円月" name="共益費_円月" type="number" value="${p['共益費_円月']||''}" placeholder="0"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
            </div>
            <div class="grid grid-cols-4 gap-3">
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">礼金（ヶ月）</label>
                <input id="f-礼金_ヶ月" name="礼金_ヶ月" type="number" step="0.5" value="${p['礼金_ヶ月']??''}" placeholder="1"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">敷金（ヶ月）</label>
                <input id="f-敷金_ヶ月" name="敷金_ヶ月" type="number" step="0.5" value="${p['敷金_ヶ月']??''}" placeholder="1"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">契約期間（年）</label>
                <input id="f-契約期間_年" name="契約期間_年" type="number" value="${p['契約期間_年']||''}" placeholder="2"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">契約更新</label>
                <input id="f-契約更新" name="契約更新" value="${esc(p['契約更新']||'')}" placeholder="自動"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">フリーレント</label>
                <input id="f-フリーレント" name="フリーレント" value="${esc(p['フリーレント']||'')}" placeholder="3月分賃料共益費"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">契約種別</label>
                <input id="f-契約種別" name="契約種別" value="${esc(p['契約種別']||'')}" placeholder="普通建物賃貸借"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
            </div>
            <hr class="border-gray-200 my-2" />
            <p class="text-xs font-bold text-gray-600">■ 初期費用</p>
            <div class="grid grid-cols-3 gap-3">
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">保証会社保証料（円）</label>
                <input id="f-保証会社保証料_円" name="保証会社保証料_円" type="number" value="${p['保証会社保証料_円']||''}"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">鍵交換費（円）</label>
                <input id="f-鍵交換費_円" name="鍵交換費_円" type="number" value="${p['鍵交換費_円']||''}"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">退去クリーニング（円）</label>
                <input id="f-退去時クリーニング_円" name="退去時クリーニング_円" type="number" value="${p['退去時クリーニング_円']||''}"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
            </div>
            <div class="grid grid-cols-3 gap-3">
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">家財保険料（円）</label>
                <input id="f-家財保険料_円" name="家財保険料_円" type="number" value="${p['家財保険料_円']||''}"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">合計目安（円）</label>
                <input id="f-合計目安_円" name="合計目安_円" type="number" value="${p['合計目安_円']||''}"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">安心サポート（円）</label>
                <input id="f-安心サポート_円" name="安心サポート_円" type="number" value="${p['安心サポート_円']||''}"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
            </div>
            <hr class="border-gray-200 my-2" />
            <p class="text-xs font-bold text-gray-600">■ 保証会社</p>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">保証会社名</label>
                <input id="f-指定保証会社名" name="指定保証会社名" value="${esc(p['指定保証会社名']||'')}"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">加入</label>
                <input id="f-保証会社加入" name="保証会社加入" value="${esc(p['保証会社加入']||'')}" placeholder="必須"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
            </div>
          </div>
        </div>

        <!-- 建物・設備タブ -->
        <div id="tab-detail" style="display:${tab==='detail'?'block':'none'}">
          <div class="space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">専有面積（㎡）</label>
                <input id="f-area" name="area" type="number" step="0.01" value="${p.area||p['占有面積_㎡']||''}"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">バルコニー面積（㎡）</label>
                <input id="f-balcony_area" name="balcony_area" type="number" step="0.01" value="${p.balcony_area||p['バルコニー面積_㎡']||''}"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
            </div>
            <div class="grid grid-cols-3 gap-3">
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">構造</label>
                <input id="f-structure" name="structure" value="${esc(p.structure||p['構造']||'')}" placeholder="RC造"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">階建</label>
                <input id="f-規模_階建" name="規模_階建" type="number" value="${p['規模_階建']||''}" placeholder="10"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">所在階</label>
                <input id="f-floors" name="floors" value="${esc(p.floors||'')}" placeholder="3階"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
            </div>
            <div class="grid grid-cols-3 gap-3">
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">築年月（和暦）</label>
                <input id="f-建築時期_和暦" name="建築時期_和暦" value="${esc(p['建築時期_和暦']||p.built_year||'')}" placeholder="平成30年6月"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">築年月（西暦）</label>
                <input id="f-建築時期_西暦" name="建築時期_西暦" value="${esc(p['建築時期_西暦']||'')}" placeholder="2018年6月"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">総戸数</label>
                <input id="f-総戸数" name="総戸数" type="number" value="${p['総戸数']||''}" placeholder="48"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">駐車場</label>
                <input id="f-parking" name="parking" value="${esc(p.parking||p['駐車場']||'')}" placeholder="有り（月額10,000円）"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">駐輪場</label>
                <input id="f-駐輪場" name="駐輪場" value="${esc(p['駐輪場']||'')}" placeholder="有り"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">ガス種別</label>
                <input id="f-ガス種別" name="ガス種別" value="${esc(p['ガス種別']||'')}" placeholder="都市ガス"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">インターネット</label>
                <input id="f-インターネット" name="インターネット" value="${esc(p['インターネット']||'')}" placeholder="光ファイバー完備"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">ペット</label>
                <input id="f-ペット" name="ペット" value="${esc(p['ペット']||'')}" placeholder="相談"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">バルコニー向き</label>
                <input id="f-バルコニー向き" name="バルコニー向き" value="${esc(p['バルコニー向き']||'')}" placeholder="南向き"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
            </div>
            <div><label class="block text-xs font-semibold text-gray-500 mb-1">建物の特徴・おすすめポイント</label>
              <textarea id="f-building_features" name="building_features" rows="2"
                class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none resize-none">${esc(p.building_features||'')}</textarea></div>
            <div><label class="block text-xs font-semibold text-gray-500 mb-1">周辺環境</label>
              <textarea id="f-surrounding" name="surrounding" rows="2"
                class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none resize-none">${esc(p.surrounding||'')}</textarea></div>
            <div><label class="block text-xs font-semibold text-gray-500 mb-1">室内の特徴</label>
              <textarea id="f-interior" name="interior" rows="2"
                class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none resize-none">${esc(p.interior||'')}</textarea></div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-2">設備・特徴</label>
              <div class="flex flex-wrap gap-2">
                ${FACILITIES.map(f => `
                  <label id="fl-${f}" class="flex items-center gap-1.5 cursor-pointer text-xs bg-gray-50 border-2 ${(p.facilities||[]).includes(f)?'border-green-500 bg-green-50':'border-gray-200'} rounded-xl px-2.5 py-1.5">
                    <input type="checkbox" name="facility_${f}" ${(p.facilities||[]).includes(f)?'checked':''} class="facility-check" data-facility="${f}" />${f}
                  </label>
                `).join('')}
              </div>
            </div>
          </div>
        </div>

        <!-- 特約・備考タブ -->
        <div id="tab-extra" style="display:${tab==='extra'?'block':'none'}">
          <div class="space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">短期解約違約金（1年未満）</label>
                <input id="f-短期解約_1年未満_違約金" name="短期解約_1年未満_違約金" value="${esc(p['短期解約_1年未満_違約金']||'')}" placeholder="賃料2ヶ月分"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">短期解約違約金（2年未満）</label>
                <input id="f-短期解約_2年未満_違約金" name="短期解約_2年未満_違約金" value="${esc(p['短期解約_2年未満_違約金']||'')}" placeholder="賃料1ヶ月分"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">複数人入居</label>
                <input id="f-複数人入居" name="複数人入居" value="${esc(p['複数人入居']||'')}" placeholder="可"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">外国籍</label>
                <input id="f-外国籍" name="外国籍" value="${esc(p['外国籍']||'')}" placeholder="歓迎"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">退去時日割精算</label>
                <input id="f-退去時日割精算" name="退去時日割精算" value="${esc(p['退去時日割精算']||'')}" placeholder="あり"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">引渡し条件</label>
                <input id="f-引渡し条件" name="引渡し条件" value="${esc(p['引渡し条件']||'')}" placeholder="リフォーム済み"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">管理会社</label>
                <input id="f-管理会社名" name="管理会社名" value="${esc(p['管理会社名']||'')}"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
              <div><label class="block text-xs font-semibold text-gray-500 mb-1">管理形態</label>
                <input id="f-管理形態" name="管理形態" value="${esc(p['管理形態']||'')}" placeholder="委託管理"
                  class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
            </div>
            <div><label class="block text-xs font-semibold text-gray-500 mb-1">取引態様</label>
              <input id="f-取引態様" name="取引態様" value="${esc(p['取引態様']||'')}" placeholder="媒介"
                class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none" /></div>
            <div><label class="block text-xs font-semibold text-gray-500 mb-1">おすすめポイント（改行区切り）</label>
              <textarea id="f-おすすめポイント" name="おすすめポイント" rows="3"
                class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none resize-none" placeholder="駅近&#10;南向き角部屋&#10;新築同様リノベ済">${esc((Array.isArray(p['おすすめポイント'])?p['おすすめポイント'].join('\n'):p['おすすめポイント'])||'')}</textarea></div>
            <div><label class="block text-xs font-semibold text-gray-500 mb-1">備考・特記事項</label>
              <textarea id="f-備考" name="備考" rows="3"
                class="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none resize-none">${esc(p['備考']||'')}</textarea></div>
          </div>
        </div>

        <!-- 物件画像タブ -->
        <div id="tab-image" style="display:${tab==='image'?'block':'none'}">
          <div class="space-y-4">
            <div class="border-2 border-dashed border-gray-300 rounded-2xl p-8 text-center hover:border-green-400">
              <div class="text-4xl mb-3">📸</div>
              <p class="text-sm text-gray-500 mb-3">物件画像をアップロード（R2に保存）</p>
              <input type="file" id="prop-image-upload" accept="image/*" class="hidden" />
              <button type="button" onclick="document.getElementById('prop-image-upload').click()"
                class="bg-green-700 text-white text-sm font-bold px-5 py-2 rounded-xl hover:bg-green-600">
                <i class="fas fa-upload mr-2"></i>画像を選択
              </button>
            </div>
            ${state.imageUrl ? `
            <div class="rounded-2xl overflow-hidden border-2 border-green-200">
              <img src="${state.imageUrl}" alt="物件画像" class="w-full max-h-64 object-cover" />
              <div class="p-3 bg-green-50 flex justify-between items-center">
                <span class="text-xs text-green-700 font-semibold"><i class="fas fa-check-circle mr-1"></i>画像がアップロードされました</span>
                <button type="button" onclick="clearImage()" class="text-xs text-red-500 hover:underline">削除</button>
              </div>
            </div>` : ''}
          </div>
        </div>

        <div class="flex gap-3 pt-5 border-t border-gray-100 mt-5">
          <button type="submit" class="bg-green-700 text-white font-bold px-6 py-3 rounded-xl text-sm hover:bg-green-600">
            ${state.loading ? '保存中...' : '<i class="fas fa-file-alt mr-2"></i>チラシを生成する →'}
          </button>
          <button type="button" onclick="goTo('dashboard')" class="border-2 border-green-700 text-green-700 font-bold px-5 py-3 rounded-xl text-sm">キャンセル</button>
        </div>
      </form>
    </div>
  </div>`
}

// ══════════════════════════════════════════
// FLYER PAGE
// ══════════════════════════════════════════
function renderFlyer() {
  const p = state.currentProp || {}
  const co = state.company || {}
  const patterns = [
    { id: 1, name: 'パターン1', desc: 'モダン・縦（A4）', color: '#1a6b3c' },
    { id: 2, name: 'パターン2', desc: 'ラグジュアリー縦', color: '#1a2d3d' },
    { id: 3, name: 'パターン3', desc: 'ポップ・縦', color: '#ff6b35' },
    { id: 4, name: 'パターン4', desc: '横長（A4 landscape）', color: '#2563eb' },
  ]
  return `
  ${renderNav()}
  <div class="max-w-5xl mx-auto p-4">
    <div class="flex justify-between items-center mb-4">
      <h1 class="text-lg font-black text-gray-800"><i class="fas fa-file-image mr-2 text-green-700"></i>チラシ生成 — ${esc(p.name||'')}</h1>
      <div class="flex gap-2">
        <button onclick="goTo('property')" class="border-2 border-green-700 text-green-700 text-sm font-bold px-3 py-1.5 rounded-xl hover:bg-green-50">
          <i class="fas fa-edit mr-1"></i>編集
        </button>
        <button onclick="goTo('dashboard')" class="border-2 border-gray-300 text-gray-600 text-sm font-bold px-3 py-1.5 rounded-xl hover:bg-gray-50">一覧へ</button>
      </div>
    </div>

    <!-- パターン選択 -->
    <div class="grid grid-cols-4 gap-2 mb-4">
      ${patterns.map(pt => `
        <button onclick="selectPattern(${pt.id})" class="pattern-btn rounded-xl border-2 p-3 text-center"
          style="${state.selectedPattern===pt.id ? `border-color:${pt.color};background:${pt.color}11` : 'border-color:#e5e7eb;background:#fff'}">
          <div class="font-black text-xs" style="color:${pt.color}">${pt.name}</div>
          <div class="text-xs text-gray-400 mt-0.5">${pt.desc}</div>
          ${state.selectedPattern===pt.id ? `<div class="text-xs font-bold mt-1" style="color:${pt.color}">✓ 選択中</div>` : ''}
        </button>
      `).join('')}
    </div>

    <!-- 画像アップロード -->
    <div class="bg-white rounded-xl border border-gray-200 p-3 mb-4 flex items-center gap-3">
      <span class="text-sm font-semibold text-gray-600"><i class="fas fa-image mr-1 text-green-600"></i>物件画像：</span>
      <input type="file" id="flyer-image-upload" accept="image/*" class="hidden" />
      <button onclick="document.getElementById('flyer-image-upload').click()" class="border-2 border-gray-200 text-sm px-3 py-1 rounded-xl hover:border-green-500 font-semibold text-gray-600">
        <i class="fas fa-upload mr-1"></i>変更
      </button>
      ${state.imageUrl ? `<img src="${state.imageUrl}" class="h-10 rounded-lg object-cover" />` : '<span class="text-gray-400 text-xs">画像なし</span>'}
    </div>

    <!-- チラシプレビュー -->
    <div class="bg-gray-700 p-6 rounded-2xl overflow-x-auto mb-4">
      <div id="flyer-preview" class="inline-block shadow-2xl">
        ${renderFlyerPattern(state.selectedPattern, p, co, state.imageUrl)}
      </div>
    </div>

    <!-- アクションボタン -->
    <div class="flex gap-3 justify-center flex-wrap">
      <button onclick="printFlyer()" class="bg-green-700 text-white font-black px-6 py-3 rounded-2xl hover:bg-green-600 shadow-lg">
        <i class="fas fa-print mr-2"></i>印刷
      </button>
      <button onclick="downloadPNG()" class="bg-blue-600 text-white font-black px-6 py-3 rounded-2xl hover:bg-blue-500 shadow-lg">
        <i class="fas fa-image mr-2"></i>PNG保存
      </button>
      <button onclick="downloadPDF()" class="bg-red-600 text-white font-black px-6 py-3 rounded-2xl hover:bg-red-500 shadow-lg">
        <i class="fas fa-file-pdf mr-2"></i>PDF保存
      </button>
    </div>
  </div>`
}

// ══════════════════════════════════════════
// FLYER PATTERN ROUTER
// ══════════════════════════════════════════
function renderFlyerPattern(id, p, co, imgUrl) {
  if (id === 1) return flyerPattern1(p, co, imgUrl)
  if (id === 2) return flyerPattern2(p, co, imgUrl)
  if (id === 3) return flyerPattern3(p, co, imgUrl)
  return flyerPattern4(p, co, imgUrl)
}

function imgHtml(url, placeholder, style='') {
  if (url) return `<img src="${url}" alt="物件" style="width:100%;height:100%;object-fit:cover;${style}" />`
  return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:48px;opacity:0.3;">${placeholder}</div>`
}

function priceDisplay(p) {
  if (p['賃料_円'] && p['賃料_円'] > 0) {
    return { main: fmt(p['賃料_円']), unit: '円/月' }
  }
  if (p.price) return { main: fmt(p.price), unit: p.price_unit || '万円' }
  return { main: '-', unit: '' }
}

function transportInfo(p) {
  const lines = []
  if (p.station || p['交通1_駅名']) {
    const st = p.station || p['交通1_駅名']
    const min = p.walk_minutes || p['交通1_徒歩分']
    const line = p['交通1_路線'] ? p['交通1_路線'] + ' ' : ''
    lines.push(`${line}${esc(st)} 徒歩${min||'?'}分`)
  }
  if (p['交通2_駅名']) {
    const line = p['交通2_路線'] ? p['交通2_路線'] + ' ' : ''
    lines.push(`${line}${esc(p['交通2_駅名'])} 徒歩${p['交通2_徒歩分']||'?'}分`)
  }
  return lines
}

// ── パターン1: モダン・グリーン（A4縦） ──────────────────────────
function flyerPattern1(p, co, imgUrl) {
  const facs = (p.facilities||[]).slice(0, 12)
  const pd = priceDisplay(p)
  const trans = transportInfo(p)
  const details = [
    ['間取り', p.layout||p['間取りタイプ']],
    ['専有面積', p.area||p['占有面積_㎡'] ? (p.area||p['占有面積_㎡'])+'㎡' : null],
    ['構造', p.structure||p['構造']],
    ['築年月', p['建築時期_西暦']||p['建築時期_和暦']||p.built_year],
    ['所在階', p.floors],
    ['階建', p['規模_階建'] ? p['規模_階建']+'階建' : null],
    ['駐車場', p.parking||p['駐車場']],
    ['バルコニー', (p.balcony_area||p['バルコニー面積_㎡']) ? (p.balcony_area||p['バルコニー面積_㎡'])+'㎡' : null],
    ['敷金', p['敷金_ヶ月'] != null ? p['敷金_ヶ月']+'ヶ月' : null],
    ['礼金', p['礼金_ヶ月'] != null ? p['礼金_ヶ月']+'ヶ月' : null],
    ['管理費', p['管理費_円月'] ? fmt(p['管理費_円月'])+'円' : null],
    ['ペット', p['ペット']],
    ['ガス', p['ガス種別']],
    ['契約期間', p['契約期間_年'] ? p['契約期間_年']+'年' : null],
  ].filter(([,v])=>v)
  const points = Array.isArray(p['おすすめポイント']) ? p['おすすめポイント'] :
    (p['おすすめポイント'] ? p['おすすめポイント'].split(/[\n,、]/).filter(Boolean) : [])
  return `
  <div style="width:794px;min-height:1123px;background:#fff;font-family:'Noto Sans JP',sans-serif;position:relative;display:flex;flex-direction:column;">
    <div style="background:linear-gradient(135deg,#1a6b3c 0%,#2d9e5f 100%);padding:24px 32px 20px;color:#fff;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div style="flex:1;">
          ${p['物件種別']?'<div style="display:inline-block;background:rgba(255,255,255,0.2);color:#fff;font-size:10px;padding:2px 10px;border-radius:3px;margin-bottom:6px;font-weight:700;">'+esc(p['物件種別'])+'</div>':''}
          <div style="font-size:11px;opacity:0.85;margin-bottom:4px;">${esc(p.catch_copy||'')}</div>
          <div style="font-size:26px;font-weight:900;line-height:1.3;margin-bottom:12px;">${esc(p.name||'物件名未設定')}</div>
          <div style="display:flex;align-items:baseline;gap:8px;">
            <span style="font-size:11px;opacity:0.75;">${pd.unit==='円/月'?'月額賃料':'販売価格'}</span>
            <span style="font-size:40px;font-weight:900;letter-spacing:-1px;">${pd.main}</span>
            <span style="font-size:15px;font-weight:700;">${pd.unit}</span>
          </div>
          ${p['管理費_円月'] ? '<div style="font-size:11px;opacity:0.8;margin-top:2px;">管理費 '+fmt(p['管理費_円月'])+'円/月</div>' : ''}
        </div>
        ${p['フリーレント'] ? '<div style="background:#ff6b35;color:#fff;font-size:10px;font-weight:900;padding:6px 10px;border-radius:8px;text-align:center;white-space:nowrap;">🎉 フリーレント<br>'+esc(p['フリーレント'])+'</div>' : ''}
      </div>
      <div style="display:flex;gap:20px;margin-top:10px;">
        ${(p.layout||p['間取りタイプ']) ? '<div><span style="font-size:10px;opacity:0.75;display:block;">間取り</span><span style="font-size:13px;font-weight:700;">'+esc(p.layout||p['間取りタイプ'])+'</span></div>' : ''}
        ${(p.area||p['占有面積_㎡']) ? '<div><span style="font-size:10px;opacity:0.75;display:block;">専有面積</span><span style="font-size:13px;font-weight:700;">'+(p.area||p['占有面積_㎡'])+'㎡</span></div>' : ''}
        ${p['現況'] ? '<div><span style="font-size:10px;opacity:0.75;display:block;">現況</span><span style="font-size:13px;font-weight:700;">'+esc(p['現況'])+'</span></div>' : ''}
        ${p['入居日'] ? '<div><span style="font-size:10px;opacity:0.75;display:block;">入居</span><span style="font-size:13px;font-weight:700;">'+esc(p['入居日'])+'</span></div>' : ''}
      </div>
    </div>
    <div style="height:290px;background:#e8f4ed;overflow:hidden;">${imgHtml(imgUrl,'🏠')}</div>
    <div style="padding:16px 32px;flex:1;">
      ${trans.length ? '<div style="display:flex;flex-wrap:wrap;gap:12px;padding:10px 0;border-top:1px solid #eee;border-bottom:1px solid #eee;margin-bottom:14px;">'+
        (p.address||p['所在地'] ? '<span style="font-size:11px;color:#444;">📍 '+esc(p.address||p['所在地'])+'</span>' : '')+
        trans.map(t=>'<span style="font-size:11px;color:#444;">🚃 '+t+'</span>').join('')+
      '</div>' : ''}
      ${points.length ? '<div style="background:#f0fdf4;border-left:4px solid #1a6b3c;padding:8px 12px;margin-bottom:14px;border-radius:0 8px 8px 0;">'+
        points.map(pt=>'<div style="font-size:11px;color:#1a6b3c;font-weight:600;">✓ '+esc(pt)+'</div>').join('')+
      '</div>' : ''}
      ${details.length ? '<div style="display:grid;grid-template-columns:1fr 1fr;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;margin-bottom:14px;">'+
        details.map(([l,v])=>'<div style="padding:7px 12px;border-bottom:1px solid #e8e8e8;border-right:1px solid #e8e8e8;"><span style="font-size:9px;color:#888;display:block;">'+l+'</span><span style="font-size:12px;font-weight:600;color:#1a1a1a;">'+esc(v)+'</span></div>').join('')+
      '</div>' : ''}
      ${facs.length ? '<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:14px;">'+
        facs.map(f=>'<span style="background:#e8f4ed;color:#1a6b3c;font-size:10px;padding:3px 8px;border-radius:99px;font-weight:600;">'+f+'</span>').join('')+
      '</div>' : ''}
      ${p['備考'] ? '<div style="background:#fff8e1;border:1px solid #fde68a;border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:10px;color:#666;">'+esc(p['備考'])+'</div>' : ''}
    </div>
    <div style="background:#1a6b3c;padding:14px 32px;display:flex;align-items:center;justify-content:space-between;">
      <div style="color:#fff;">
        <div style="font-size:14px;font-weight:700;">${esc(co?.name||'会社名未設定')}</div>
        <div style="font-size:20px;font-weight:900;letter-spacing:1px;">${esc(co?.tel||'')}</div>
        <div style="font-size:9px;opacity:0.7;margin-top:2px;">${esc(co?.license_no||'')}</div>
      </div>
      <div style="color:#fff;text-align:right;font-size:10px;opacity:0.85;">
        <div>${esc(co?.address||'')}</div>
        <div>${esc(co?.email||'')}</div>
        ${p['取引態様'] ? '<div style="margin-top:4px;font-weight:700;">取引態様: '+esc(p['取引態様'])+'</div>' : ''}
      </div>
    </div>
  </div>`
}

// ── パターン2: ラグジュアリー（A4縦） ──────────────────────────
function flyerPattern2(p, co, imgUrl) {
  const facs = (p.facilities||[]).slice(0, 10)
  const pd = priceDisplay(p)
  const trans = transportInfo(p)
  const details = [
    ['築年月', p['建築時期_西暦']||p['建築時期_和暦']||p.built_year],
    ['構造', p.structure||p['構造']],
    ['所在階', p.floors],
    ['土地面積', p.land_area||p['土地_地積'] ? (p.land_area||p['土地_地積'])+'㎡' : null],
    ['駐車場', p.parking||p['駐車場']],
    ['バルコニー', (p.balcony_area||p['バルコニー面積_㎡']) ? (p.balcony_area||p['バルコニー面積_㎡'])+'㎡' : null],
    ['敷金', p['敷金_ヶ月'] != null ? p['敷金_ヶ月']+'ヶ月' : null],
    ['礼金', p['礼金_ヶ月'] != null ? p['礼金_ヶ月']+'ヶ月' : null],
    ['管理費', p['管理費_円月'] ? fmt(p['管理費_円月'])+'円' : null],
  ].filter(([,v])=>v)
  return `
  <div style="width:794px;min-height:1123px;background:#0d1b2a;font-family:'Noto Serif JP',serif;color:#f5f0e8;position:relative;display:flex;flex-direction:column;" class="flyer-pattern2">
    <div style="height:4px;background:linear-gradient(90deg,#c9a84c,#e8d48a,#c9a84c);"></div>
    <div style="padding:32px 44px 24px;border-bottom:1px solid rgba(201,168,76,0.3);">
      <div style="font-size:9px;letter-spacing:6px;color:#c9a84c;text-transform:uppercase;margin-bottom:16px;">${esc(co?.name||'REAL ESTATE')}</div>
      ${p['物件種別'] ? '<div style="font-size:10px;color:#888;margin-bottom:8px;">'+esc(p['物件種別'])+'</div>' : ''}
      <div style="font-size:28px;font-weight:700;line-height:1.4;margin-bottom:8px;">${esc(p.name||'物件名未設定')}</div>
      <div style="font-size:12px;color:#c9a84c;font-style:italic;margin-bottom:18px;">${esc(p.catch_copy||'')}</div>
      <div style="display:flex;align-items:baseline;gap:8px;">
        <span style="font-size:42px;font-weight:900;color:#c9a84c;letter-spacing:-2px;">${pd.main}</span>
        <span style="font-size:16px;color:#c9a84c;">${pd.unit}</span>
      </div>
      ${p['管理費_円月'] ? '<div style="font-size:11px;color:#888;margin-top:4px;">管理費 '+fmt(p['管理費_円月'])+'円/月</div>' : ''}
      <div style="display:flex;gap:28px;margin-top:12px;">
        ${(p.layout||p['間取りタイプ']) ? '<div style="text-align:center;"><span style="font-size:17px;font-weight:700;display:block;">'+esc(p.layout||p['間取りタイプ'])+'</span><span style="font-size:9px;color:#c9a84c;letter-spacing:2px;">間取り</span></div>' : ''}
        ${(p.area||p['占有面積_㎡']) ? '<div style="text-align:center;"><span style="font-size:17px;font-weight:700;display:block;">'+(p.area||p['占有面積_㎡'])+'㎡</span><span style="font-size:9px;color:#c9a84c;letter-spacing:2px;">専有面積</span></div>' : ''}
      </div>
    </div>
    <div style="padding:20px 44px 0;">
      <div style="height:280px;border-radius:4px;overflow:hidden;position:relative;">
        ${imgHtml(imgUrl,'🏛','opacity:0.9')}
        <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(13,27,42,0.5) 0%,transparent 60%);"></div>
      </div>
    </div>
    <div style="padding:20px 44px;flex:1;">
      <hr style="border:none;border-top:1px solid rgba(201,168,76,0.3);margin:0 0 18px;" />
      ${trans.length ? '<div style="display:flex;flex-wrap:wrap;gap:24px;margin-bottom:18px;">'+
        (p.address||p['所在地'] ? '<div><span style="font-size:9px;color:#c9a84c;letter-spacing:2px;display:block;margin-bottom:3px;">所在地</span><span style="font-size:11px;">'+esc(p.address||p['所在地'])+'</span></div>' : '')+
        trans.map(t=>'<div><span style="font-size:9px;color:#c9a84c;letter-spacing:2px;display:block;margin-bottom:3px;">アクセス</span><span style="font-size:11px;">'+t+'</span></div>').join('')+
      '</div>' : ''}
      ${details.length ? '<table style="width:100%;border-collapse:collapse;margin-bottom:18px;font-size:11px;"><tbody>'+
        details.map(([l,v])=>'<tr><td style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.07);color:#c9a84c;width:90px;letter-spacing:1px;">'+l+'</td><td style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.07);">'+esc(v)+'</td></tr>').join('')+
      '</tbody></table>' : ''}
      ${facs.length ? '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:18px;">'+
        facs.map(f=>'<span style="border:1px solid rgba(201,168,76,0.5);color:#c9a84c;font-size:10px;padding:3px 10px;letter-spacing:1px;">'+f+'</span>').join('')+
      '</div>' : ''}
      ${p['備考'] ? '<div style="font-size:10px;color:#888;margin-bottom:10px;border-left:2px solid rgba(201,168,76,0.4);padding-left:10px;">'+esc(p['備考'])+'</div>' : ''}
    </div>
    <div style="border-top:1px solid rgba(201,168,76,0.3);padding:16px 44px;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-size:15px;font-weight:700;letter-spacing:2px;">${esc(co?.name||'会社名未設定')}</div>
        <div style="font-size:10px;color:#888;margin-top:4px;">${esc(co?.address||'')}</div>
        <div style="font-size:10px;color:#888;">${esc(co?.license_no||'')}</div>
        ${p['取引態様'] ? '<div style="font-size:10px;color:#c9a84c;margin-top:3px;">取引態様: '+esc(p['取引態様'])+'</div>' : ''}
      </div>
      <div style="text-align:right;">
        <div style="font-size:20px;color:#c9a84c;font-weight:900;letter-spacing:2px;">${esc(co?.tel||'')}</div>
        <div style="font-size:10px;color:#888;margin-top:4px;">${esc(co?.email||'')}</div>
      </div>
    </div>
    <div style="height:4px;background:linear-gradient(90deg,#c9a84c,#e8d48a,#c9a84c);"></div>
  </div>`
}

// ── パターン3: ポップ・オレンジ（A4縦） ──────────────────────────
function flyerPattern3(p, co, imgUrl) {
  const facs = (p.facilities||[]).slice(0, 12)
  const pd = priceDisplay(p)
  const trans = transportInfo(p)
  const details = [
    ['築年月', p['建築時期_西暦']||p['建築時期_和暦']||p.built_year],
    ['構造', p.structure||p['構造']], ['所在階', p.floors],
    ['土地面積', p.land_area||p['土地_地積'] ? (p.land_area||p['土地_地積'])+'㎡' : null],
    ['駐車場', p.parking||p['駐車場']],
    ['バルコニー', (p.balcony_area||p['バルコニー面積_㎡']) ? (p.balcony_area||p['バルコニー面積_㎡'])+'㎡' : null],
    ['敷金', p['敷金_ヶ月'] != null ? p['敷金_ヶ月']+'ヶ月' : null],
    ['礼金', p['礼金_ヶ月'] != null ? p['礼金_ヶ月']+'ヶ月' : null],
  ].filter(([,v])=>v)
  const points = Array.isArray(p['おすすめポイント']) ? p['おすすめポイント'] :
    (p['おすすめポイント'] ? p['おすすめポイント'].split(/[\n,、]/).filter(Boolean) : [])
  return `
  <div style="width:794px;min-height:1123px;background:#fffbf7;font-family:'Noto Sans JP',sans-serif;position:relative;display:flex;flex-direction:column;">
    <div style="background:#ff6b35;height:7px;"></div>
    <div style="padding:24px 36px 0;">
      <div style="display:inline-block;background:#ff6b35;color:#fff;font-weight:900;font-size:11px;padding:4px 12px;border-radius:99px;margin-bottom:10px;">🏡 ${esc(p['物件種別']||'賃貸物件')}</div>
      <div style="font-size:28px;font-weight:900;color:#1a1a1a;line-height:1.3;margin-bottom:6px;">${esc(p.name||'物件名未設定')}</div>
      <div style="font-size:14px;color:#ff6b35;font-weight:700;margin-bottom:16px;">${esc(p.catch_copy||'')}</div>
      <div style="background:#fff3ee;border:2px solid #ff6b35;border-radius:12px;padding:12px 20px;display:inline-flex;align-items:baseline;gap:8px;margin-bottom:8px;">
        <span style="font-size:44px;font-weight:900;color:#ff6b35;line-height:1;">${pd.main}</span>
        <span style="font-size:16px;color:#ff6b35;font-weight:700;">${pd.unit}</span>
      </div>
      ${p['管理費_円月'] ? '<div style="font-size:11px;color:#888;margin-bottom:4px;">管理費 '+fmt(p['管理費_円月'])+'円/月</div>' : ''}
      <div style="display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap;">
        ${(p.layout||p['間取りタイプ']) ? '<div style="background:#fff;border:2px solid #e0e0e0;border-radius:10px;padding:8px 14px;text-align:center;"><span style="font-size:16px;font-weight:900;color:#1a1a1a;display:block;">'+esc(p.layout||p['間取りタイプ'])+'</span><span style="font-size:9px;color:#888;">間取り</span></div>' : ''}
        ${(p.area||p['占有面積_㎡']) ? '<div style="background:#fff;border:2px solid #e0e0e0;border-radius:10px;padding:8px 14px;text-align:center;"><span style="font-size:16px;font-weight:900;color:#1a1a1a;display:block;">'+(p.area||p['占有面積_㎡'])+'㎡</span><span style="font-size:9px;color:#888;">専有面積</span></div>' : ''}
        ${trans.length ? '<div style="background:#fff;border:2px solid #e0e0e0;border-radius:10px;padding:8px 14px;text-align:center;"><span style="font-size:13px;font-weight:900;color:#1a1a1a;display:block;">徒歩'+( p.walk_minutes||p['交通1_徒歩分']||'?')+'分</span><span style="font-size:9px;color:#888;">'+esc(p.station||p['交通1_駅名']||'')+'</span></div>' : ''}
      </div>
    </div>
    <div style="margin:0 36px;height:260px;border-radius:14px;overflow:hidden;background:#ffe8dc;">${imgHtml(imgUrl,'🏠')}</div>
    <div style="padding:16px 36px;flex:1;">
      ${trans.length || (p.address||p['所在地']) ? '<div style="background:#fff;border:1px solid #ffe0d0;border-radius:10px;padding:10px 16px;margin-bottom:14px;display:flex;flex-wrap:wrap;gap:16px;">'+
        (p.address||p['所在地'] ? '<span style="font-size:11px;color:#333;">📍 '+esc(p.address||p['所在地'])+'</span>' : '')+
        trans.map(t=>'<span style="font-size:11px;color:#333;">🚃 '+t+'</span>').join('')+
      '</div>' : ''}
      ${points.length ? '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">'+
        points.map(pt=>'<span style="background:#ff6b35;color:#fff;font-size:11px;font-weight:700;padding:4px 10px;border-radius:99px;">★ '+esc(pt)+'</span>').join('')+
      '</div>' : ''}
      ${details.length ? '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px;">'+
        details.map(([l,v])=>'<div style="background:#fff;border:1px solid #eee;border-radius:8px;padding:8px 10px;"><span style="font-size:9px;color:#aaa;display:block;margin-bottom:3px;">'+l+'</span><span style="font-size:12px;font-weight:700;color:#333;">'+esc(v)+'</span></div>').join('')+
      '</div>' : ''}
      ${facs.length ? '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">'+
        facs.map(f=>'<span style="background:#fff3ee;color:#ff6b35;border:1px solid #ffd5c0;font-size:10px;padding:4px 10px;border-radius:99px;font-weight:600;">'+f+'</span>').join('')+
      '</div>' : ''}
      ${p['備考'] ? '<div style="font-size:10px;color:#666;background:#fff;border:1px solid #eee;border-radius:8px;padding:8px 10px;margin-bottom:10px;">'+esc(p['備考'])+'</div>' : ''}
    </div>
    <div style="margin:0 36px 24px;background:#1a1a1a;border-radius:14px;padding:16px 24px;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="color:#fff;font-weight:900;font-size:14px;">${esc(co?.name||'会社名未設定')}</div>
        <div style="color:#888;font-size:9px;margin-top:3px;">${esc(co?.address||'')}</div>
        <div style="color:#888;font-size:9px;">${esc(co?.license_no||'')}</div>
        ${p['取引態様'] ? '<div style="color:#ff6b35;font-size:9px;margin-top:3px;">取引態様: '+esc(p['取引態様'])+'</div>' : ''}
      </div>
      <div style="text-align:right;">
        <div style="color:#ff6b35;font-weight:900;font-size:22px;letter-spacing:1px;">${esc(co?.tel||'')}</div>
        <div style="color:#888;font-size:9px;margin-top:3px;">${esc(co?.email||'')}</div>
      </div>
    </div>
  </div>`
}

// ── パターン4: A4横長（募集図面スタイル） ──────────────────────────────
function flyerPattern4(p, co, imgUrl) {
  const pd = priceDisplay(p)
  const trans = transportInfo(p)
  const facs = (p.facilities||[])
  const points = Array.isArray(p['おすすめポイント']) ? p['おすすめポイント'] :
    (p['おすすめポイント'] ? p['おすすめポイント'].split(/[\n,、]/).filter(Boolean) : [])

  // 物件名
  const propName = p.name || p['物件名'] || '物件名未設定'
  const roomNo = p['部屋番号'] || ''
  const propType = p['物件種別'] || '賃貸マンション'
  const contractType = p['契約種別'] || '普通建物賃貸借'
  const madori = p.layout || p['間取りタイプ'] || ''
  const area = p.area || p['占有面積_㎡'] || ''
  const balcony = p.balcony_area || p['バルコニー面積_㎡'] || ''
  const chikuNen = p['建築時期_和暦'] || p['建築時期_西暦'] || p.built_year || ''
  const structure = p.structure || p['構造'] || ''
  const floors = p['規模_階建'] ? p['規模_階建']+'階建' : ''
  const sokosu = p['総戸数'] ? p['総戸数']+'戸' : ''
  const jmusho = p['事務所利用'] || ''
  const pet = p['ペット'] || ''
  const gas = p['ガス種別'] || ''
  const suido = p['水道'] || ''
  const floor = p.floors || ''
  const chieki = p['契約期間_年'] ? p['契約期間_年']+'年間' : ''
  const chikousin = p['契約更新'] || ''
  const chikouDisplay = chieki && chikousin ? chieki + '/' + chikousin : chieki || ''
  const kanri = p['管理費_円月'] != null ? fmt(p['管理費_円月']) : '0'
  const kyoeki = p['共益費_円月'] != null ? fmt(p['共益費_円月']) : ''
  const shikikin = p['敷金_ヶ月'] != null ? p['敷金_ヶ月'] : '0'
  const reikin = p['礼金_ヶ月'] != null ? p['礼金_ヶ月'] : '0'
  const freerent = p['フリーレント'] || ''
  const kyokyo = p['現況'] || ''
  const nyuukyobi = p['入居日'] || ''
  // 退去時クリーニング
  const cleaning = p['退去時クリーニング_円'] ? fmt(p['退去時クリーニング_円'])+'円/別' : ''
  const parking = p.parking || p['駐車場'] || ''
  // 初期費用
  const hoshouRyo = p['保証会社保証料_円'] ? fmt(p['保証会社保証料_円']) : ''
  const kakeHoken = p['家財保険料_円'] ? fmt(p['家財保険料_円']) : (p['保険料_円'] ? fmt(p['保険料_円']) : '')
  const kagiKoukan = p['鍵交換費_円'] != null ? fmt(p['鍵交換費_円']) : '0'
  const churinCho = p['駐輪代_円'] != null ? fmt(p['駐輪代_円']) : '0'
  const nichiwariCho = p['日割賃料_円'] != null ? fmt(p['日割賃料_円']) : '0'
  const nichiwariKyoeki = p['日割共益費_円'] != null ? fmt(p['日割共益費_円']) : '0'
  const goukei = p['合計目安_円'] ? fmt(p['合計目安_円']) : ''
  const hoshouSha = p['指定保証会社名'] || ''
  const hoshouKanyu = p['保証会社加入'] || '必須'
  const hokenSha = p['指定保険会社名'] || ''
  const hokenNen = p['保険契約年数'] ? p['保険契約年数']+'年' : ''
  const hokenRyo = p['保険料_円'] || p['家財保険料_円'] ? fmt(p['保険料_円']||p['家財保険料_円']) : ''
  const address = p.address || p['所在地'] || ''
  const parkingMonth = p['駐輪代月額_円'] ? fmt(p['駐輪代月額_円'])+'円/月' : ''
  const bikou = p['備考'] || ''
  // 備考2（短期解約など）
  const tanki1 = p['短期解約_1年未満_違約金'] || ''
  const tanki2 = p['短期解約_2年未満_違約金'] || ''
  const gaikoku = p['外国籍'] || ''
  const fukusuu = p['複数人入居'] || ''
  const toriATai = p['取引態様'] || '媒介'
  const johouDate = p['情報公開日'] || ''
  // 各戸設備
  const kakukoSetsuBi = facs.join('　')
  // 仲介手数料
  const kyakuFutan = typeof p['手数料負担割合_借主_%'] === 'number' ? p['手数料負担割合_借主_%'] : 100

  // 交通
  const transItems = []
  if (p['交通1_路線']||p.station||p['交通1_駅名']) {
    const line = p['交通1_路線']||''
    const st = p.station||p['交通1_駅名']||''
    const min = p.walk_minutes||p['交通1_徒歩分']||''
    transItems.push({ line, st, min })
  }
  if (p['交通2_路線']||p['交通2_駅名']) {
    transItems.push({ line: p['交通2_路線']||'', st: p['交通2_駅名']||'', min: p['交通2_徒歩分']||'' })
  }
  if (p['交通3_路線']||p['交通3_駅名']) {
    transItems.push({ line: p['交通3_路線']||'', st: p['交通3_駅名']||'', min: p['交通3_徒歩分']||'' })
  }

  // 賃料表示
  const rentCircle = p['賃料_円'] ? fmt(p['賃料_円']) : (p.price ? fmt(p.price*10000) : '—')

  function tdLabel(txt, w='') {
    return `<td style="background:#f0f0f0;border:1px solid #ccc;padding:2px 4px;font-size:8px;font-weight:700;white-space:nowrap;${w?'width:'+w+';':''}">${esc(txt)}</td>`
  }
  function tdVal(txt, colspan='', style='') {
    const cs = colspan ? `colspan="${colspan}"` : ''
    return `<td ${cs} style="border:1px solid #ccc;padding:2px 5px;font-size:9px;${style}">${esc(txt||'')}</td>`
  }
  function tdValBig(txt, colspan='', style='') {
    const cs = colspan ? `colspan="${colspan}"` : ''
    return `<td ${cs} style="border:1px solid #ccc;padding:1px 4px;font-size:12px;font-weight:900;${style}">${esc(txt||'')}</td>`
  }

  return `
  <div style="width:1122px;height:794px;background:#fff;font-family:'Noto Sans JP',sans-serif;box-sizing:border-box;display:flex;flex-direction:column;border:2px solid #333;">
    <!-- ── メインエリア ── -->
    <div style="display:flex;flex:1;overflow:hidden;">

      <!-- ========== 左エリア（写真・おすすめ） ========== -->
      <div style="width:360px;flex-shrink:0;display:flex;flex-direction:column;border-right:1px solid #ccc;">
        <!-- 外観写真 -->
        <div style="height:200px;background:#ddd;overflow:hidden;position:relative;">
          ${imgHtml(imgUrl,'🏠')}
          <div style="position:absolute;top:0;left:0;background:rgba(0,0,0,0.55);color:#fff;font-size:9px;padding:2px 6px;font-weight:700;">外観写真</div>
        </div>
        <!-- おすすめポイント -->
        <div style="background:#1e3d6e;padding:4px 10px;">
          <span style="color:#fff;font-size:10px;font-weight:900;">おすすめポイント</span>
        </div>
        <div style="padding:6px 10px;flex:1;background:#fffef5;">
          ${points.length ? points.map(pt=>`<div style="font-size:11px;font-weight:900;color:#1a1a1a;line-height:1.6;">★ ${esc(pt)}</div>`).join('') :
            (p.catch_copy ? `<div style="font-size:11px;font-weight:900;color:#1a1a1a;">★ ${esc(p.catch_copy)}</div>` : '<div style="font-size:10px;color:#999;">おすすめポイントを入力してください</div>')}
          ${freerent ? `<div style="background:#fffde7;border:2px solid #f59e0b;border-radius:6px;padding:4px 8px;margin-top:6px;display:inline-block;text-align:center;">
            <span style="font-size:9px;font-weight:900;color:#92400e;">フリーレント適用時</span><br>
            <span style="font-size:10px;font-weight:900;color:#b45309;">賃料・共益費</span>&nbsp;<span style="font-size:13px;font-weight:900;color:#dc2626;">０円！</span>
          </div>` : ''}
        </div>
      </div>

      <!-- ========== 中央エリア（間取り図） ========== -->
      <div style="width:310px;flex-shrink:0;display:flex;flex-direction:column;border-right:1px solid #ccc;">
        <div style="background:#e8e8e8;padding:3px 8px;font-size:9px;font-weight:700;text-align:center;border-bottom:1px solid #ccc;">間取り図</div>
        <div style="flex:1;background:#f5f5f5;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative;">
          <div style="text-align:center;color:#bbb;font-size:36px;padding:20px;">🏗</div>
          ${area ? '<div style="position:absolute;bottom:6px;left:0;right:0;text-align:center;"><span style="font-size:10px;font-weight:700;color:#333;">専有面積：約'+esc(String(area))+'㎡</span>'+(balcony ? '&nbsp;&nbsp;<span style="font-size:10px;font-weight:700;color:#333;">バルコニー：約'+esc(String(balcony))+'㎡</span>' : '')+'</div>' : ''}
        </div>
      </div>

      <!-- ========== 右エリア（物件情報詳細） ========== -->
      <div style="flex:1;display:flex;flex-direction:column;padding:6px 10px 4px;">
        <!-- 物件名 -->
        <div style="margin-bottom:4px;">
          <span style="font-size:22px;font-weight:900;color:#111;">物件名</span>
          <span style="font-size:24px;font-weight:900;color:#1a1a1a;margin-left:8px;">${esc(propName)}</span>
        </div>
        <!-- 契約種別 -->
        ${contractType ? `<div style="margin-bottom:4px;"><span style="font-size:10px;color:#555;">契約種別</span>&nbsp;&nbsp;<span style="font-size:16px;font-weight:900;color:#1a1a1a;">${esc(contractType)}</span></div>` : ''}

        <!-- 物件詳細テーブル -->
        <table style="border-collapse:collapse;width:100%;margin-bottom:4px;font-size:9px;">
          <tbody>
            <tr>
              ${tdLabel('間取り\\nタイプ')}
              <td style="border:1px solid #ccc;padding:2px 5px;font-size:15px;font-weight:900;">${esc(madori)}</td>
              ${tdLabel('部屋番号')}
              <td style="border:1px solid #ccc;padding:2px 5px;font-size:12px;font-weight:700;">${esc(roomNo)}</td>
            </tr>
            <tr>
              ${tdLabel('賃　　　料')}
              <td colspan="3" style="border:1px solid #ccc;padding:2px 5px;">
                <span style="font-size:22px;font-weight:900;color:#111;">${rentCircle}</span>
                ${p['管理費_円月']!=null?'<span style="font-size:9px;margin-left:4px;">管理費&nbsp;'+fmt(p['管理費_円月'])+'円/月</span>':''}
                ${p['共益費_円月']?'<span style="font-size:9px;margin-left:4px;">共益費&nbsp;'+kyoeki+'円/月</span>':''}
              </td>
            </tr>
            <tr>
              ${tdLabel('礼金')}
              <td style="border:1px solid #ccc;padding:2px 5px;font-size:11px;font-weight:700;">${esc(String(reikin))}　ヶ月</td>
              ${tdLabel('敷金')}
              <td style="border:1px solid #ccc;padding:2px 5px;font-size:11px;font-weight:700;">${esc(String(shikikin))}　ヶ月</td>
            </tr>
            <tr>
              ${tdLabel('所在地')}
              <td colspan="3" style="border:1px solid #ccc;padding:2px 5px;font-size:9px;">${esc(address)}</td>
            </tr>
            ${transItems.map(t=>`<tr>${tdLabel('交通')}<td colspan="3" style="border:1px solid #ccc;padding:2px 5px;font-size:9px;">${esc(t.line)}　${esc(t.st)}&nbsp;&nbsp;徒歩${esc(String(t.min))}分</td></tr>`).join('')}
            <tr>
              ${tdLabel('物件種別')}
              <td style="border:1px solid #ccc;padding:2px 5px;font-size:9px;">${esc(propType)}</td>
              ${tdLabel('構造')}
              <td style="border:1px solid #ccc;padding:2px 5px;font-size:9px;">${esc(structure)}</td>
            </tr>
            <tr>
              ${tdLabel('規模')}
              <td style="border:1px solid #ccc;padding:2px 5px;font-size:9px;">${esc(floors)}</td>
              ${tdLabel('占有面積')}
              <td style="border:1px solid #ccc;padding:2px 5px;font-size:9px;">${area?'約'+area+'㎡':''}${balcony?'　バルコニー 約'+balcony+'㎡':''}</td>
            </tr>
            <tr>
              ${tdLabel('事務所利用')}
              <td style="border:1px solid #ccc;padding:2px 5px;font-size:9px;">${esc(jmusho)}</td>
              ${tdLabel('ペット')}
              <td style="border:1px solid #ccc;padding:2px 5px;font-size:9px;">${esc(pet)}</td>
            </tr>
            <tr>
              ${tdLabel('築年月')}
              <td style="border:1px solid #ccc;padding:2px 5px;font-size:9px;">${esc(chikuNen)}</td>
              ${tdLabel('契約期間')}
              <td style="border:1px solid #ccc;padding:2px 5px;font-size:9px;">${esc(chikouDisplay)}</td>
            </tr>
            <tr>
              ${tdLabel('管　理　費')}
              <td style="border:1px solid #ccc;padding:2px 5px;font-size:9px;">${kanri}円/月</td>
              ${tdLabel('共　益　費')}
              <td style="border:1px solid #ccc;padding:2px 5px;font-size:9px;">${kyoeki?kyoeki+'円/月':''}</td>
            </tr>
            <tr>
              ${tdLabel('保険(住居)')}
              <td style="border:1px solid #ccc;padding:2px 5px;font-size:9px;">${hokenRyo?hokenRyo+'円':''}</td>
              ${tdLabel('鍵交換代')}
              <td style="border:1px solid #ccc;padding:2px 5px;font-size:9px;">${kagiKoukan?kagiKoukan+'円/別':''}</td>
            </tr>
            <tr>
              ${tdLabel('現況')}
              <td style="border:1px solid #ccc;padding:2px 5px;font-size:9px;">${esc(kyokyo)}</td>
              ${tdLabel('入居日')}
              <td style="border:1px solid #ccc;padding:2px 5px;font-size:9px;">${esc(nyuukyobi)}</td>
            </tr>
            <tr>
              ${tdLabel('退去時ク\\nリーニング')}
              <td style="border:1px solid #ccc;padding:2px 5px;font-size:9px;">${esc(cleaning)}</td>
              ${tdLabel('駐輪代月額')}
              <td style="border:1px solid #ccc;padding:2px 5px;font-size:9px;">${esc(parkingMonth)}</td>
            </tr>
            <tr>
              ${tdLabel('本体')}
              <td colspan="3" style="border:1px solid #ccc;padding:2px 5px;font-size:9px;">ガス:${esc(gas)}　水道:${esc(suido||'公営')}</td>
            </tr>
            <tr>
              ${tdLabel('各戸')}
              <td colspan="3" style="border:1px solid #ccc;padding:2px 5px;font-size:9px;">${esc(kakukoSetsuBi.substring(0,80))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ── 中段：備考・初期費用 ── -->
    <div style="display:flex;border-top:1px solid #ccc;font-size:8px;">
      <!-- 備考 -->
      <div style="flex:1;padding:4px 8px;border-right:1px solid #ccc;">
        <div style="font-weight:900;margin-bottom:2px;font-size:8px;">備考</div>
        <div style="font-size:8px;color:#333;line-height:1.5;">${esc((bikou+(tanki1?'◆1年未満:'+tanki1:'')+(tanki2?' ◆2年未満:'+tanki2:'')+(gaikoku?' ◆外国籍:'+gaikoku:'')+(fukusuu?' ◆複数入居:'+fukusuu:'')).substring(0,300))}</div>
      </div>
      <!-- 初期費用 -->
      <div style="width:380px;flex-shrink:0;padding:3px 6px;">
        <div style="display:flex;gap:8px;">
          <div style="flex:1;">
            <div style="font-weight:900;font-size:8px;margin-bottom:2px;">契約時に必要な金銭の目安</div>
            <table style="border-collapse:collapse;width:100%;font-size:8px;">
              <tbody>
                <tr>
                  <td style="border:1px solid #ccc;padding:1px 3px;background:#f0f0f0;font-weight:700;white-space:nowrap;">敷金</td>
                  <td style="border:1px solid #ccc;padding:1px 4px;">${shikikin}　円</td>
                  <td style="border:1px solid #ccc;padding:1px 3px;background:#f0f0f0;font-weight:700;white-space:nowrap;">礼金</td>
                  <td style="border:1px solid #ccc;padding:1px 4px;">${reikin}　円</td>
                </tr>
                <tr>
                  <td style="border:1px solid #ccc;padding:1px 3px;background:#f0f0f0;font-weight:700;">日割賃料</td>
                  <td style="border:1px solid #ccc;padding:1px 4px;">${nichiwariCho}　円</td>
                  <td style="border:1px solid #ccc;padding:1px 3px;background:#f0f0f0;font-weight:700;">日割共益費</td>
                  <td style="border:1px solid #ccc;padding:1px 4px;">${nichiwariKyoeki}　円</td>
                </tr>
                <tr>
                  <td style="border:1px solid #ccc;padding:1px 3px;background:#f0f0f0;font-weight:700;">保証会社</td>
                  <td style="border:1px solid #ccc;padding:1px 4px;">${hoshouRyo?hoshouRyo+'円':''}　</td>
                  <td style="border:1px solid #ccc;padding:1px 3px;background:#f0f0f0;font-weight:700;">駐輪代</td>
                  <td style="border:1px solid #ccc;padding:1px 4px;">${churinCho}　円</td>
                </tr>
                <tr>
                  <td style="border:1px solid #ccc;padding:1px 3px;background:#f0f0f0;font-weight:700;">家財保険料</td>
                  <td style="border:1px solid #ccc;padding:1px 4px;">${kakeHoken?kakeHoken+'円':''}　</td>
                  <td style="border:1px solid #ccc;padding:1px 3px;background:#f0f0f0;font-weight:700;">鍵交換費</td>
                  <td style="border:1px solid #ccc;padding:1px 4px;">${kagiKoukan}　円</td>
                </tr>
              </tbody>
            </table>
          </div>
          ${goukei ? `<div style="background:#1e3d6e;color:#fff;padding:4px 6px;border-radius:4px;text-align:center;min-width:60px;display:flex;flex-direction:column;justify-content:center;align-items:center;">
            <div style="font-size:7px;font-weight:700;">合計</div>
            <div style="font-size:13px;font-weight:900;">${goukei}</div>
            <div style="font-size:7px;">円</div>
          </div>` : ''}
        </div>
        ${hoshouSha ? `<div style="font-size:7px;margin-top:2px;color:#555;">保証会社: ${esc(hoshouSha)}（${esc(hoshouKanyu)}）</div>` : ''}
      </div>
    </div>

    <!-- ── フッター：会社情報 ── -->
    <div style="background:#f0f0f0;border-top:1px solid #999;padding:5px 10px;display:flex;align-items:center;gap:12px;">
      <div style="width:60px;height:36px;background:#fff;border:1px solid #ccc;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <span style="font-size:8px;color:#999;text-align:center;">ロゴ</span>
      </div>
      <div style="flex:1;">
        <div style="font-size:7px;color:#555;">${esc(co?.license_no||'')}</div>
        <div style="font-size:14px;font-weight:900;line-height:1.2;">${esc(co?.name||'会社名未設定')}</div>
        <div style="font-size:8px;color:#333;">${esc(co?.address||'')}</div>
        ${co?.org ? `<div style="font-size:7px;color:#555;">${esc(co.org)}</div>` : ''}
      </div>
      <div style="text-align:center;">
        <div style="font-size:8px;font-weight:700;">TEL</div>
        <div style="font-size:14px;font-weight:900;">${esc(co?.tel||'—')}</div>
        ${co?.fax ? `<div style="font-size:8px;">FAX ${esc(co.fax)}</div>` : ''}
        ${co?.email ? `<div style="font-size:8px;">${esc(co.email)}</div>` : ''}
      </div>
      <div style="text-align:center;font-size:8px;">
        <div style="font-weight:900;margin-bottom:2px;">■取引態様</div>
        <div style="font-size:11px;font-weight:900;">${esc(toriATai)}</div>
      </div>
      <table style="border-collapse:collapse;font-size:7px;flex-shrink:0;">
        <thead>
          <tr>
            <th colspan="3" style="border:1px solid #999;padding:1px 4px;background:#ddd;font-size:7px;">手数料負担割合</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="border:1px solid #999;padding:1px 4px;">貸主</td>
            <td style="border:1px solid #999;padding:1px 4px;">${100-kyakuFutan}%</td>
            <td rowspan="2" style="border:1px solid #999;padding:1px 4px;font-size:7px;background:#fffde7;">
              ${johouDate ? '■情報公開日<br>'+esc(johouDate) : ''}
            </td>
          </tr>
          <tr>
            <td style="border:1px solid #999;padding:1px 4px;">借主</td>
            <td style="border:1px solid #999;padding:1px 4px;">${kyakuFutan}%</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>`
}

// ══════════════════════════════════════════
// PRINT & DOWNLOAD
// ══════════════════════════════════════════
function printFlyer() {
  const preview = document.getElementById('flyer-preview')
  if (!preview) return
  const isLandscape = state.selectedPattern === 4
  const printArea = document.getElementById('print-area')
  const style = isLandscape ? '<style>@page { size: A4 landscape; margin: 0; }</style>' : '<style>@page { size: A4 portrait; margin: 0; }</style>'
  printArea.innerHTML = style + '<div id="flyer-print-wrapper">' + preview.innerHTML + '</div>'
  printArea.style.display = 'block'
  window.print()
  setTimeout(() => { printArea.style.display = 'none' }, 500)
}

async function downloadPNG() {
  const preview = document.getElementById('flyer-preview')
  if (!preview || typeof html2canvas === 'undefined') {
    toast('ダウンロード機能を読み込み中です。しばらくお待ちください。', 'err'); return
  }
  toast('PNG画像を生成中...')
  try {
    const canvas = await html2canvas(preview, { scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#ffffff', logging: false })
    const link = document.createElement('a')
    const propName = (state.currentProp?.name || 'chirashi').replace(/[/\\\\:*?"<>|]/g, '_').substring(0, 30)
    link.download = `${propName}_pattern${state.selectedPattern}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
    toast('PNG保存しました')
  } catch(e) { toast('PNG生成エラー: ' + e.message, 'err') }
}

async function downloadPDF() {
  const preview = document.getElementById('flyer-preview')
  if (!preview) return
  if (typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
    toast('PDFライブラリを読み込み中です。しばらくお待ちください。', 'err'); return
  }
  toast('PDF生成中...')
  try {
    const isLandscape = state.selectedPattern === 4
    const canvas = await html2canvas(preview, { scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#ffffff', logging: false })
    const imgData = canvas.toDataURL('image/jpeg', 0.92)
    const { jsPDF } = window.jspdf
    const orientation = isLandscape ? 'landscape' : 'portrait'
    const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' })
    const pw = pdf.internal.pageSize.getWidth()
    const ph = pdf.internal.pageSize.getHeight()
    pdf.addImage(imgData, 'JPEG', 0, 0, pw, ph)
    const propName = (state.currentProp?.name || 'chirashi').replace(/[/\\\\:*?"<>|]/g, '_').substring(0, 30)
    pdf.save(`${propName}_pattern${state.selectedPattern}.pdf`)
    toast('PDFを保存しました')
  } catch(e) { toast('PDF生成エラー: ' + e.message, 'err') }
}

// ══════════════════════════════════════════
// AI ANALYZE
// ══════════════════════════════════════════
function switchAiTab(tab) {
  state.aiTab = tab
  ;['image','pdf','csv','url'].forEach(t => {
    const panel = document.getElementById('ai-panel-'+t)
    if (panel) panel.style.display = t === tab ? 'block' : 'none'
  })
  document.querySelectorAll('.ai-tab-btn').forEach((btn, i) => {
    const tabs = ['image','pdf','csv','url']
    const t = tabs[i]
    if (t === tab) {
      btn.style.borderColor = '#7c3aed'; btn.style.color = '#7c3aed'; btn.style.backgroundColor = '#f5f3ff'
    } else {
      btn.style.borderColor = '#e5e7eb'; btn.style.color = '#6b7280'; btn.style.backgroundColor = '#fff'
    }
  })
}

async function runAiAnalyzeImage() {
  const fileInput = document.getElementById('ai-image-file')
  if (!fileInput?.files?.[0]) { toast('画像ファイルを選択してください', 'err'); return }
  const file = fileInput.files[0]
  const reader = new FileReader()
  reader.onload = async (e) => {
    const base64 = e.target.result
    showAiOverlay('チラシ画像を解析中...')
    try {
      const payload = { imageUrl: base64 }
      if (state.userApiKey) payload.apiKey = state.userApiKey
      const res = await api.post('/api/ai/analyze', payload)
      hideAiOverlay()
      if (res.needApiKey) { state.showApiKeyModal = true; render(); return }
      if (res.data) { fillFormFromAI(res.data); toast('✨ AIが全項目を読み込みました！内容を確認してください') }
    } catch(err) {
      hideAiOverlay()
      if (err.message.includes('503') || err.message.includes('APIキー') || err.message.includes('Invalid or expired') || err.message.includes('Unauthorized')) { state.showApiKeyModal = true; render() }
      else toast('AI解析エラー: ' + err.message, 'err')
    }
  }
  reader.readAsDataURL(file)
}

async function runAiAnalyzePdf() {
  const fileInput = document.getElementById('ai-pdf-file')
  if (!fileInput?.files?.[0]) { toast('PDFファイルを選択してください', 'err'); return }
  const file = fileInput.files[0]

  if (typeof pdfjsLib === 'undefined') {
    toast('PDF.jsを読み込み中です。少し待ってから再試行してください。', 'err'); return
  }

  showAiOverlay('PDFを読み込み中...')
  try {
    // PDF.jsでテキスト抽出
    const arrayBuffer = await file.arrayBuffer()
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

    // 1ページ目をcanvasにレンダリング（プレビュー）
    const page1 = await pdf.getPage(1)
    const viewport = page1.getViewport({ scale: 1.5 })
    const canvas = document.getElementById('pdf-canvas')
    if (canvas) {
      canvas.width = viewport.width; canvas.height = viewport.height
      await page1.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
      document.getElementById('pdf-page-preview')?.classList.remove('hidden')
    }

    // 全ページのテキスト抽出
    let allText = ''
    for (let i = 1; i <= Math.min(pdf.numPages, 4); i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      const pageText = content.items.map(item => item.str).join(' ')
      allText += `--- ページ${i} ---\n${pageText}\n`
    }

    // PDFを画像として送る（1ページ目）
    const pdfCanvas = document.getElementById('pdf-canvas')
    let imageUrl = null
    if (pdfCanvas) {
      imageUrl = pdfCanvas.toDataURL('image/jpeg', 0.9)
    }

    showAiOverlay('AIがPDF内容を解析中...')
    const payload = { pdfText: allText }
    if (imageUrl) payload.imageUrl = imageUrl  // 画像も一緒に送ると精度UP
    if (state.userApiKey) payload.apiKey = state.userApiKey

    const res = await api.post('/api/ai/analyze', payload)
    hideAiOverlay()
    if (res.needApiKey) { state.showApiKeyModal = true; render(); return }
    if (res.data) { fillFormFromAI(res.data); toast('✨ PDFから全項目を読み込みました！内容を確認してください') }
  } catch(err) {
    hideAiOverlay()
    if (err.message.includes('503') || err.message.includes('APIキー') || err.message.includes('Invalid or expired') || err.message.includes('Unauthorized')) { state.showApiKeyModal = true; render() }
    else toast('PDF解析エラー: ' + err.message, 'err')
  }
}

// RFC 4180準拠のCSVパーサー（クォート内コンマ・改行対応）
function parseCsvRow(line) {
  const result = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQ && line[i+1] === '"') { cur += '"'; i++ }
      else inQ = !inQ
    } else if (c === ',' && !inQ) {
      result.push(cur.trim()); cur = ''
    } else {
      cur += c
    }
  }
  result.push(cur.trim())
  return result
}

function parseCsvFull(text) {
  // BOM除去
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = clean.split('\n')
  const rows = []
  let buf = '', inQ = false
  for (const line of lines) {
    buf += (buf ? '\n' : '') + line
    const qcount = (buf.match(/"/g)||[]).length
    if (qcount % 2 === 0) {
      rows.push(parseCsvRow(buf)); buf = ''; inQ = false
    } else { inQ = true }
  }
  if (buf.trim()) rows.push(parseCsvRow(buf))
  return rows.filter(r => r.some(c => c !== ''))
}

async function runCsvImport() {
  const fileInput = document.getElementById('ai-csv-file')
  if (!fileInput?.files?.[0]) { toast('CSVファイルを選択してください', 'err'); return }
  const file = fileInput.files[0]
  try {
    // Shift-JIS対応: まずUTF-8で読み、失敗したらShift-JISに切り替え
    let text = ''
    try {
      const buf = await file.arrayBuffer()
      const decoder = new TextDecoder('utf-8', { fatal: true })
      text = decoder.decode(buf)
    } catch {
      const buf = await file.arrayBuffer()
      const decoder = new TextDecoder('shift-jis')
      text = decoder.decode(buf)
    }

    const rows = parseCsvFull(text)
    if (rows.length === 0) { toast('CSVが空です', 'err'); return }

    let data = {}

    // フォーマット判定：ヘッダー行 + データ行 or キー・値形式
    const firstRow = rows[0]
    const isHeaderFormat = rows.length >= 2 && firstRow.length > 2

    if (isHeaderFormat) {
      // ヘッダー1行 + データ複数行（最初のデータ行を使用）
      const headers = firstRow
      const values = rows[1] || []
      headers.forEach((h, i) => { if (h && values[i] !== undefined && values[i] !== '') data[h] = values[i] })
    } else {
      // キー・値形式（1列目: キー, 2列目以降: 値）
      rows.forEach(cols => {
        if (cols.length >= 2) {
          const k = cols[0]
          const v = cols.slice(1).join(',')
          if (k) data[k] = v
        }
      })
    }

    if (Object.keys(data).length === 0) { toast('データが見つかりませんでした', 'err'); return }

    // プレビュー表示
    const previewEl = document.getElementById('csv-preview-content')
    if (previewEl) {
      previewEl.textContent = Object.entries(data).slice(0, 25).map(([k,v])=>`${k}: ${v}`).join('\n')
      document.getElementById('csv-preview')?.classList.remove('hidden')
    }

    // CSV項目をフォームにマッピング
    fillFormFromAI(mapCsvToProperty(data))
    toast(`✨ CSVから${Object.keys(data).length}項目を読み込みました！`)
  } catch(err) {
    toast('CSV読み込みエラー: ' + err.message, 'err')
  }
}

function mapCsvToProperty(csv) {
  // data-rule.md のキーをそのままマップ + 旧キーとのブリッジ
  const mapped = { ...csv }
  // 旧キー互換
  if (csv['物件名'] && !csv.name) mapped.name = csv['物件名']
  if (csv['間取りタイプ'] && !csv.layout) mapped.layout = csv['間取りタイプ']
  if (csv['所在地'] && !csv.address) mapped.address = csv['所在地']
  if (csv['交通1_駅名'] && !csv.station) mapped.station = csv['交通1_駅名']
  if (csv['交通1_徒歩分'] && !csv.walk_minutes) mapped.walk_minutes = Number(csv['交通1_徒歩分'])
  if (csv['占有面積_㎡'] && !csv.area) mapped.area = Number(csv['占有面積_㎡'])
  if (csv['バルコニー面積_㎡'] && !csv.balcony_area) mapped.balcony_area = Number(csv['バルコニー面積_㎡'])
  if (csv['建築時期_西暦'] && !csv.built_year) mapped.built_year = csv['建築時期_西暦']
  else if (csv['建築時期_和暦'] && !csv.built_year) mapped.built_year = csv['建築時期_和暦']
  if (csv['構造'] && !csv.structure) mapped.structure = csv['構造']
  if (csv['賃料_円']) mapped.price = Math.round(Number(csv['賃料_円']) / 10000); // 万円換算
  if (csv['価格_円']) mapped.price = Math.round(Number(csv['価格_円']) / 10000)
  if (csv['駐車場'] && !csv.parking) mapped.parking = csv['駐車場']
  // 設備リスト
  if (csv['各戸設備'] && typeof csv['各戸設備'] === 'string') {
    const items = csv['各戸設備'].split(/[、,]/).map(s=>s.trim()).filter(Boolean)
    const matched = items.filter(item => FACILITIES.some(f => f.includes(item) || item.includes(f)))
    if (matched.length) mapped.facilities = matched
  }
  // おすすめポイント
  if (csv['おすすめポイント'] && typeof csv['おすすめポイント'] === 'string') {
    mapped['おすすめポイント'] = csv['おすすめポイント'].split(/[、\n,]/).map(s=>s.trim()).filter(Boolean)
  }
  return mapped
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
    if (res.needApiKey) { state.showApiKeyModal = true; render(); return }
    if (res.data) { fillFormFromAI(res.data); toast('✨ WebページからAIが全項目を抽出しました！') }
  } catch(err) {
    hideAiOverlay()
    if (err.message.includes('503') || err.message.includes('APIキー') || err.message.includes('Invalid or expired') || err.message.includes('Unauthorized')) { state.showApiKeyModal = true; render() }
    else toast('AI解析エラー: ' + err.message, 'err')
  }
}

function fillFormFromAI(data) {
  const cleaned = {}
  for (const [k, v] of Object.entries(data)) {
    if (v !== null && v !== undefined && v !== '') cleaned[k] = v
  }
  state.currentProp = { ...(state.currentProp || {}), ...cleaned }
  state.subPage = 'basic'
  render()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// ══════════════════════════════════════════
// SAMPLE DATA
// ══════════════════════════════════════════
function loadSampleData() {
  const samples = [
    {
      name: 'パークシティ北浜 402号室',
      catch_copy: '大阪市内中心部！駅徒歩3分の好立地',
      物件種別: '賃貸マンション', 契約種別: '普通建物賃貸借', 部屋番号: '402号室',
      layout: '2LDK', 現況: '空室', 入居日: '即入居可',
      address: '大阪府大阪市中央区北浜2-1-10',
      交通1_路線: '大阪メトロ堺筋線', station: '北浜駅', walk_minutes: 3,
      交通2_路線: '大阪メトロ御堂筋線', 交通2_駅名: '淀屋橋駅', 交通2_徒歩分: 8,
      structure: 'RC造', 規模_階建: 15, floors: '4階', 総戸数: 68,
      建築時期_和暦: '平成30年6月', 建築時期_西暦: '2018年6月',
      area: 62.5, balcony_area: 9.2, バルコニー向き: '南向き',
      賃料_円: 145000, 管理費_円月: 5000, 共益費_円月: 0,
      礼金_ヶ月: 1, 敷金_ヶ月: 1, 契約期間_年: 2, 契約更新: '自動',
      フリーレント: '1ヶ月分',
      鍵交換費_円: 22000, 退去時クリーニング_円: 50000, 家財保険料_円: 20000,
      指定保証会社名: 'ジェイリース', 保証会社加入: '必須',
      オートロック: true, ペット: '相談', ガス種別: '都市ガス', 駐車場: '空きあり（月額20,000円）',
      駐輪場: '有り', インターネット: '光ファイバー完備（無料）',
      building_features: '南向き角部屋・全室採光良好。リノベーション済み。',
      surrounding: '北浜商店街徒歩2分、スーパー徒歩5分、淀川河川公園車10分。',
      interior: 'システムキッチン・浴室乾燥機・床暖房完備。独立洗面台あり。',
      facilities: ['バス・トイレ別','エアコン','システムキッチン','オートロック','フローリング','バルコニー','エレベーター','宅配ボックス','浴室乾燥機','洗面台独立','室内洗濯機置場','モニター付インターホン'],
      おすすめポイント: ['駅徒歩3分の好立地','南向き角部屋','フリーレント1ヶ月分','ペット相談可'],
      備考: '短期解約（1年未満）賃料2ヶ月分違約金あり。外国籍の方歓迎。',
      取引態様: '媒介',
    },
    {
      name: 'ザ・パークハウス芦屋',
      catch_copy: '希少な低層レジデンス。緑と静寂の邸宅。',
      物件種別: '賃貸マンション', layout: '3LDK',
      address: '兵庫県芦屋市東山町12-5',
      交通1_路線: 'JR神戸線', station: '芦屋駅', walk_minutes: 8,
      structure: 'SRC造', 規模_階建: 5, floors: '3階', 総戸数: 20,
      建築時期_西暦: '2020年3月', area: 98.5, balcony_area: 18.2,
      賃料_円: 320000, 管理費_円月: 15000, 礼金_ヶ月: 2, 敷金_ヶ月: 2,
      契約期間_年: 2, ペット: '不可', ガス種別: '都市ガス',
      駐車場: '有（月額30,000円）', 駐輪場: '有り',
      building_features: '天井高2.7m。大理石タイル使用。コンシェルジュサービスあり。',
      surrounding: '阪急芦屋川駅徒歩12分。六甲山系の緑豊かな邸宅街。',
      interior: 'アイランドキッチン・浴室TV・ウォークインクローゼット完備。',
      facilities: ['バス・トイレ別','エアコン','システムキッチン','オートロック','フローリング','バルコニー','エレベーター','宅配ボックス','床暖房','ウォークインクローゼット','追い焚き','24時間ゴミ出し可'],
      おすすめポイント: ['芦屋の最高級レジデンス','全室南向き・大開口','コンシェルジュ常駐','眺望抜群'],
      取引態様: '媒介',
    },
  ]
  const sample = samples[Math.floor(Math.random() * samples.length)]
  state.currentProp = { ...(state.currentProp || {}), ...sample }
  state.subPage = 'basic'
  render()
  toast('サンプルデータを読み込みました！')
}

// ══════════════════════════════════════════
// FLYER ACTIONS
// ══════════════════════════════════════════
function selectPattern(id) {
  state.selectedPattern = id
  const preview = document.getElementById('flyer-preview')
  if (preview) preview.innerHTML = renderFlyerPattern(id, state.currentProp, state.company, state.imageUrl)
  document.querySelectorAll('.pattern-btn').forEach((btn, i) => {
    const colors = ['#1a6b3c','#1a2d3d','#ff6b35','#2563eb']
    const col = colors[i]
    if (i+1 === id) {
      btn.style.borderColor = col; btn.style.backgroundColor = col+'11'
      btn.innerHTML = `<div class="font-black text-xs" style="color:${col}">${['パターン1','パターン2','パターン3','パターン4'][i]}</div><div class="text-xs text-gray-400 mt-0.5">${['モダン・縦（A4）','ラグジュアリー縦','ポップ・縦','横長（A4 landscape）'][i]}</div><div class="text-xs font-bold mt-1" style="color:${col}">✓ 選択中</div>`
    } else {
      btn.style.borderColor = '#e5e7eb'; btn.style.backgroundColor = '#fff'
      btn.innerHTML = `<div class="font-black text-xs" style="color:${col}">${['パターン1','パターン2','パターン3','パターン4'][i]}</div><div class="text-xs text-gray-400 mt-0.5">${['モダン・縦（A4）','ラグジュアリー縦','ポップ・縦','横長（A4 landscape）'][i]}</div>`
    }
  })
}

function clearImage() { state.imageUrl = ''; state.imageKey = ''; render() }

function newProperty() {
  state.currentProp = {}; state.imageUrl = ''; state.imageKey = ''
  state.subPage = 'basic'; state.aiTab = 'image'; goTo('property')
}

// ══════════════════════════════════════════
// AUTH & DASHBOARD
// ══════════════════════════════════════════
async function handleLogout() {
  try { await api.post('/api/auth/logout') } catch {}
  localStorage.removeItem('chirashi_token')
  state.user = null; state.company = {}; state.properties = []
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

async function openFlyer(id) {
  try {
    const prop = await api.get('/api/properties/'+id)
    state.currentProp = prop
    if (prop.images && prop.images.length > 0) {
      state.imageUrl = '/api/files/'+encodeURIComponent(prop.images[0])
      state.imageKey = prop.images[0]
    } else { state.imageUrl = ''; state.imageKey = '' }
    goTo('flyer')
  } catch(e) { toast(e.message, 'err') }
}

async function editProperty(e, id) {
  e.stopPropagation()
  try {
    const prop = await api.get('/api/properties/'+id)
    state.currentProp = prop
    if (prop.images && prop.images.length > 0) {
      state.imageUrl = '/api/files/'+encodeURIComponent(prop.images[0]); state.imageKey = prop.images[0]
    } else { state.imageUrl = ''; state.imageKey = '' }
    state.subPage = 'basic'; state.aiTab = 'image'; goTo('property')
  } catch(e) { toast(e.message, 'err') }
}

async function deleteProperty(e, id) {
  e.stopPropagation()
  if (!confirm('この物件を削除しますか？')) return
  try {
    await api.del('/api/properties/'+id)
    await loadDashboard(); render(); toast('物件を削除しました')
  } catch(err) { toast(err.message, 'err') }
}

// ══════════════════════════════════════════
// EVENTS
// ══════════════════════════════════════════
function attachEvents() {
  // Login
  document.getElementById('login-form')?.addEventListener('submit', async e => {
    e.preventDefault()
    const fd = new FormData(e.target)
    state.loading = true; render()
    try {
      const res = await api.post('/api/auth/login', { email: fd.get('email'), password: fd.get('password') })
      localStorage.setItem('chirashi_token', res.token)
      state.user = await api.get('/api/auth/me')
      await loadDashboard(); state.loading = false; goTo('dashboard')
    } catch(err) { state.loading = false; render(); toast(err.message, 'err') }
  })

  // Register
  document.getElementById('register-form')?.addEventListener('submit', async e => {
    e.preventDefault()
    const fd = new FormData(e.target)
    state.loading = true; render()
    try {
      const res = await api.post('/api/auth/register', { email: fd.get('email'), password: fd.get('password') })
      localStorage.setItem('chirashi_token', res.token)
      state.user = await api.get('/api/auth/me')
      state.loading = false; goTo('company')
    } catch(err) { state.loading = false; render(); toast(err.message, 'err') }
  })

  // Company
  document.getElementById('company-form')?.addEventListener('submit', async e => {
    e.preventDefault()
    const fd = new FormData(e.target)
    const data = Object.fromEntries(fd.entries())
    state.loading = true; render()
    try {
      await api.post('/api/company', data); state.company = data
      await loadDashboard(); state.loading = false; toast('会社情報を保存しました'); goTo('dashboard')
    } catch(err) { state.loading = false; render(); toast(err.message, 'err') }
  })

  // Property form submit
  document.getElementById('property-form')?.addEventListener('submit', async e => {
    e.preventDefault()
    const fd = new FormData(e.target)
    // data-rule.md の全フィールドを収集
    const extras = {}
    const extraFields = ['物件種別','契約種別','部屋番号','現況','入居日','住居表示',
      '交通1_路線','交通2_路線','交通2_駅名','交通2_徒歩分',
      '規模_階建','建築時期_和暦','建築時期_西暦','総戸数','フリーレント','契約更新',
      '契約期間_年','礼金_ヶ月','敷金_ヶ月','賃料_円','管理費_円月','共益費_円月',
      '保証会社保証料_円','鍵交換費_円','退去時クリーニング_円','家財保険料_円',
      '合計目安_円','安心サポート_円','指定保証会社名','保証会社加入',
      'ペット','ガス種別','インターネット','バルコニー向き','駐輪場',
      '短期解約_1年未満_違約金','短期解約_2年未満_違約金','複数人入居','外国籍',
      '退去時日割精算','引渡し条件','管理会社名','管理形態','取引態様','備考']
    extraFields.forEach(k => { const v = fd.get(k); if (v !== null && v !== '') extras[k] = v })
    // おすすめポイントは改行区切り→配列
    const pointsRaw = fd.get('おすすめポイント') || ''
    extras['おすすめポイント'] = pointsRaw.split(/[\n,、]/).map(s=>s.trim()).filter(Boolean)

    const data = {
      ...extras,
      name: fd.get('name'),
      catch_copy: fd.get('catch_copy'),
      price: num(fd.get('賃料_円')) ? Math.round(num(fd.get('賃料_円'))/10000) : (num(fd.get('price')) || null),
      price_unit: '万円',
      layout: fd.get('layout') || null,
      area: num(fd.get('area')) || null,
      address: fd.get('address') || null,
      station: fd.get('station') || null,
      walk_minutes: num(fd.get('walk_minutes')) || null,
      built_year: fd.get('建築時期_西暦') || fd.get('建築時期_和暦') || null,
      floors: fd.get('floors') || null,
      structure: fd.get('structure') || null,
      land_area: num(fd.get('land_area')) || null,
      parking: fd.get('parking') || null,
      balcony_area: num(fd.get('balcony_area')) || null,
      building_features: fd.get('building_features') || null,
      surrounding: fd.get('surrounding') || null,
      interior: fd.get('interior') || null,
      facilities: FACILITIES.filter(f => fd.get('facility_'+f) === 'on'),
      images: state.imageKey ? [state.imageKey] : (state.currentProp?.images || []),
    }
    state.loading = true; render()
    try {
      if (state.currentProp?.id) {
        await api.put('/api/properties/'+state.currentProp.id, data); toast('物件情報を更新しました')
      } else {
        const res = await api.post('/api/properties', data); data.id = res.id; toast('物件を登録しました')
      }
      await loadDashboard()
      state.currentProp = { ...(state.currentProp||{}), ...data }
      state.loading = false; goTo('flyer')
    } catch(err) { state.loading = false; render(); toast(err.message, 'err') }
  })

  // Property image upload
  document.getElementById('prop-image-upload')?.addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return
    const fd = new FormData(); fd.append('file', file); fd.append('folder', 'properties')
    try {
      const res = await api.upload('/api/upload', fd)
      state.imageUrl = '/api/files/'+encodeURIComponent(res.key)
      state.imageKey = res.key; state.subPage = 'image'; render(); toast('画像をアップロードしました')
    } catch(err) { toast(err.message, 'err') }
  })

  // Flyer image upload
  document.getElementById('flyer-image-upload')?.addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return
    const fd = new FormData(); fd.append('file', file); fd.append('folder', 'properties')
    try {
      const res = await api.upload('/api/upload', fd)
      state.imageUrl = '/api/files/'+encodeURIComponent(res.key); state.imageKey = res.key
      toast('画像をアップロードしました')
      const preview = document.getElementById('flyer-preview')
      if (preview) preview.innerHTML = renderFlyerPattern(state.selectedPattern, state.currentProp, state.company, state.imageUrl)
    } catch(err) { toast(err.message, 'err') }
  })

  // Facility checkbox style
  document.querySelectorAll('.facility-check').forEach(cb => {
    cb.addEventListener('change', () => {
      const label = document.getElementById('fl-'+cb.dataset.facility)
      if (label) {
        label.style.borderColor = cb.checked ? '#22c55e' : '#e5e7eb'
        label.style.backgroundColor = cb.checked ? '#f0fdf4' : '#f9fafb'
      }
    })
  })
}

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════
state.aiTab = 'image'
const savedToken = localStorage.getItem('chirashi_token')
if (savedToken) {
  api.get('/api/auth/me').then(async u => {
    state.user = u; await loadDashboard(); goTo('dashboard')
  }).catch(() => { localStorage.removeItem('chirashi_token'); render() })
} else {
  render()
}