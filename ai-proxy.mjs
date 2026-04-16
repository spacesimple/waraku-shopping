// ai-proxy.mjs
// Node.js AI プロキシサーバー（ポート3001）
// data-rule.md に基づく全項目抽出対応版

import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

function loadDevVars() {
  const devVarsPath = join(process.cwd(), '.dev.vars')
  if (existsSync(devVarsPath)) {
    const content = readFileSync(devVarsPath, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx > 0) {
        const k = trimmed.substring(0, eqIdx).trim()
        const v = trimmed.substring(eqIdx + 1).trim()
        if (!process.env[k]) process.env[k] = v
      }
    }
  }
}
loadDevVars()

const DEFAULT_API_KEY = process.env.OPENAI_API_KEY || ''
const DEFAULT_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
const PORT = 3001

console.log(`[AI Proxy] Starting on port ${PORT}`)
console.log(`[AI Proxy] Default Base URL: ${DEFAULT_BASE_URL}`)
console.log(`[AI Proxy] Default API Key: ${DEFAULT_API_KEY ? DEFAULT_API_KEY.substring(0, 8) + '...' : 'NOT SET'}`)

function jsonRes(res, data, status = 200) {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(body)
}

async function callAI(messages, model, apiKey, baseUrl, maxTokens = 2500) {
  const url = `${baseUrl}/chat/completions`
  const body = JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.1 })

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body,
  })

  const data = await response.json()
  if (!response.ok) {
    const errMsg = data.error?.message || data.detail || `API error: ${response.status}`
    throw new Error(errMsg)
  }
  return data.choices?.[0]?.message?.content || ''
}

// data-rule.md に基づく完全なJSONスキーマ
const FULL_PROPERTY_SCHEMA = `
以下のJSONキーを使って物件情報を抽出してください。
取得できない項目は null にしてください（空文字は使わないこと）。
金額は数値のみ（円単位または万円単位）、割合は数値のみ（%記号不要）。
JSONのみを返してください（\`\`\`json などの囲いも不要）。

{
  "物件名": "string",
  "物件名_英語": "string|null",
  "物件名_フリガナ": "string|null",
  "物件種別": "賃貸マンション/賃貸アパート/売買マンション/売買戸建て など",
  "契約種別": "普通建物賃貸借/定期建物賃貸借 など|null",
  "部屋番号": "string|null",
  "間取りタイプ": "1R/1K/1LDK/2DK/3LDK など|null",
  "現況": "空室/居住中 など|null",
  "入居日": "即入居可/修繕後/相談 など|null",
  "情報公開日": "YY/MM/DD形式|null",

  "所在地": "string|null",
  "住居表示": "string|null",
  "交通1_路線": "string|null",
  "交通1_駅名": "string|null",
  "交通1_徒歩分": "number|null",
  "交通2_路線": "string|null",
  "交通2_駅名": "string|null",
  "交通2_徒歩分": "number|null",
  "交通3_路線": "string|null",
  "交通3_駅名": "string|null",
  "交通3_徒歩分": "number|null",

  "構造": "鉄骨造/木造/RC造/SRC造 など|null",
  "種別": "マンション/アパート など|null",
  "規模_階建": "number|null",
  "建築時期": "string|null",
  "建築時期_和暦": "string|null",
  "建築時期_西暦": "string|null",
  "検査済証": "あり/なし|null",
  "総戸数": "number|null",
  "防火指定": "防火/準防火/指定なし など|null",
  "用途地域": "第一種住居地域 など|null",
  "建ぺい率": "number|null",
  "容積率": "number|null",
  "道路": "string|null",
  "間口": "number|null",
  "その他制限": "string|null",

  "占有面積_㎡": "number|null",
  "バルコニー面積_㎡": "number|null",
  "土地_権利": "所有権/借地権 など|null",
  "土地_地積": "number|null",
  "土地_地目": "宅地/田/畑 など|null",

  "賃料_円": "number|null",
  "管理費_円月": "number|null",
  "共益費_円月": "number|null",
  "礼金_ヶ月": "number|null",
  "敷金_ヶ月": "number|null",
  "契約期間_年": "number|null",
  "契約更新": "自動/協議/定期 など|null",
  "フリーレント": "string|null",
  "価格_円": "number|null",

  "保証会社保証料_円": "number|null",
  "家財保険料_円": "number|null",
  "鍵交換費_円": "number|null",
  "駐輪代_円": "number|null",
  "退去時クリーニング_円": "number|null",
  "駐輪代月額_円": "number|null",
  "合計目安_円": "number|null",
  "日割賃料_円": "number|null",
  "日割共益費_円": "number|null",
  "安心サポート_円": "number|null",
  "火災保険_円": "number|null",

  "指定保証会社名": "string|null",
  "保証料率_保証人無_%": "number|null",
  "保証料率_保証人有_%": "number|null",
  "継続保証料_月額_円": "number|null",
  "保証会社加入": "必須/任意|null",

  "指定保険会社名": "string|null",
  "保険種別": "家財保険/火災保険 など|null",
  "保険契約年数": "number|null",
  "保険料_円": "number|null",
  "保険加入": "必須/任意|null",

  "事務所利用": "可/不可/条件付可|null",
  "ペット": "可/不可/相談|null",
  "ガス種別": "都市ガス/プロパン など|null",
  "水道": "公営/井戸 など|null",
  "各戸設備": ["設備名のリスト"],
  "インターネット": "string|null",
  "オートロック": "true/false",
  "ダイヤル錠式郵便ポスト": "true/false",
  "バルコニー向き": "東向き/南向き など|null",
  "地勢": "平坦/高台 など|null",
  "駐車場": "有り/無し/近隣 など|null",
  "駐輪場": "有り/無し|null",

  "短期解約_1年未満_違約金": "string|null",
  "短期解約_2年未満_違約金": "string|null",
  "退去時日割精算": "あり/なし|null",
  "引渡し条件": "現状有姿/リフォーム済み など|null",
  "複数人入居": "可/不可/相談|null",
  "外国籍": "歓迎/可/不可/相談|null",

  "管理会社名": "string|null",
  "管理形態": "自主管理/委託管理 など|null",
  "管理費_円": "number|null",
  "修繕積立金": "number|null",
  "その他費用": "string|null",

  "おすすめポイント": ["訴求ポイントのリスト"],
  "備考": "string|null",

  "会社名": "string|null",
  "免許番号": "string|null",
  "会社住所": "string|null",
  "TEL": "string|null",
  "FAX": "string|null",
  "担当者名": "string|null",
  "取引態様": "売主/媒介/代理 など|null",

  "catch_copy": "チラシ向けキャッチコピー（画像から読み取れない場合はAIが生成）",
  "name": "物件名（物件名と同じ）",
  "price": "number（賃料または売買価格、万円単位）|null",
  "price_unit": "万円/円",
  "layout": "間取りタイプと同じ|null",
  "area": "number（占有面積㎡）|null",
  "address": "所在地と同じ|null",
  "station": "交通1_駅名|null",
  "walk_minutes": "number（交通1_徒歩分）|null",
  "built_year": "建築時期（string）|null",
  "floors": "string（例: 3階/10階建て）|null",
  "structure": "構造|null",
  "land_area": "number（土地_地積）|null",
  "parking": "駐車場|null",
  "balcony_area": "number（バルコニー面積_㎡）|null",
  "building_features": "建物の特徴・おすすめポイントをまとめたtext|null",
  "surrounding": "周辺環境の説明|null",
  "interior": "室内・各戸設備の説明|null",
  "facilities": ["各戸設備から該当するもの: 駐車場,バス・トイレ別,エアコン,システムキッチン,オートロック,フローリング,バルコニー,エレベーター,宅配ボックス,床暖房,ウォークインクローゼット,追い焚き,インターネット無料,BS/CS,浴室乾燥機,洗面台独立,室内洗濯機置場,モニター付インターホン,24時間ゴミ出し可"]
}
`

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    res.end()
    return
  }

  if (req.method === 'GET' && req.url === '/health') {
    // DEFAULT_API_KEYが設定されていても無効な可能性があるため
    // ユーザーに「自分のAPIキーを使う」ことを促す情報を追加
    jsonRes(res, { 
      ok: true, 
      hasApiKey: !!DEFAULT_API_KEY,
      note: DEFAULT_API_KEY ? 'GenSpark proxy key configured (may be expired)' : 'No API key set'
    })
    return
  }

  if (req.method !== 'POST' || req.url !== '/ai/analyze') {
    jsonRes(res, { error: 'Not found' }, 404)
    return
  }

  let body = ''
  req.on('data', chunk => body += chunk)
  req.on('end', async () => {
    try {
      const { imageUrl, webUrl, pdfText, apiKey: userApiKey, baseUrl: userBaseUrl } = JSON.parse(body)

      const apiKey = userApiKey || DEFAULT_API_KEY
      // ユーザーが独自キー(sk-...)を指定した場合はOpenAI公式を使う
      // GenSpark proxy用のキー(8文字英数字)の場合はGenSparkプロキシを使う
      let baseUrl = userBaseUrl || DEFAULT_BASE_URL
      if (userApiKey && (userApiKey.startsWith('sk-') || userApiKey.startsWith('sk-proj-'))) {
        baseUrl = userBaseUrl || 'https://api.openai.com/v1'
      }

      if (!apiKey) {
        jsonRes(res, {
          error: 'OpenAI APIキーが設定されていません。設定画面からAPIキーを入力するか、.dev.vars に OPENAI_API_KEY を設定してください。',
          needApiKey: true
        }, 503)
        return
      }

      let messages, model

      if (imageUrl) {
        model = 'gpt-5'
        messages = [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: `この不動産チラシ・物件画像から物件情報をできる限りすべて抽出してください。\n${FULL_PROPERTY_SCHEMA}`
            },
            {
              type: 'image_url',
              image_url: { url: imageUrl, detail: 'high' }
            }
          ]
        }]
        console.log(`[AI Proxy] Image analysis with model: ${model}`)

      } else if (pdfText) {
        // PDFテキスト解析（クライアント側でpdf.jsが抽出したテキスト）
        model = 'gpt-5'
        messages = [{
          role: 'user',
          content: `以下は不動産チラシPDFから抽出したテキストです。物件情報をできる限りすべて抽出してください。\n${FULL_PROPERTY_SCHEMA}\n\n--- PDFテキスト ---\n${pdfText.substring(0, 10000)}`
        }]
        console.log(`[AI Proxy] PDF text analysis, text length: ${pdfText.length}`)

      } else if (webUrl) {
        model = 'gpt-5'
        let pageContent = ''
        try {
          const pageRes = await fetch(webUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
            },
            redirect: 'follow',
          })
          const html = await pageRes.text()
          pageContent = html
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<nav[\s\S]*?<\/nav>/gi, '')
            .replace(/<footer[\s\S]*?<\/footer>/gi, '')
            .replace(/<header[\s\S]*?<\/header>/gi, '')
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 10000)
        } catch (e) {
          jsonRes(res, { error: `ページの取得に失敗しました: ${e.message}` }, 400)
          return
        }

        messages = [{
          role: 'user',
          content: `以下の不動産WebページテキストからJSON形式で物件情報を抽出してください。\n${FULL_PROPERTY_SCHEMA}\n\n--- Webページテキスト ---\n${pageContent}`
        }]
        console.log(`[AI Proxy] Web URL analysis: ${webUrl}`)

      } else {
        jsonRes(res, { error: 'imageUrl, pdfText, または webUrl が必要です' }, 400)
        return
      }

      const content = await callAI(messages, model, apiKey, baseUrl, 3000)
      console.log(`[AI Proxy] Raw response (first 300): ${content.substring(0, 300)}`)

      // JSON抽出
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]+?)\s*```/) || content.match(/(\{[\s\S]+\})/)
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content
      let parsed
      try {
        parsed = JSON.parse(jsonStr.trim())
      } catch {
        throw new Error(`AIがJSON形式で返答しませんでした: ${content.substring(0, 150)}`)
      }

      jsonRes(res, { success: true, data: parsed })

    } catch (e) {
      console.error('[AI Proxy] Error:', e.message)
      jsonRes(res, { error: `AI解析エラー: ${e.message}` }, 500)
    }
  })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[AI Proxy] Ready on http://0.0.0.0:${PORT}`)
})
