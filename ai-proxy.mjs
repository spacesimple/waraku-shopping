// ai-proxy.mjs
// Node.js AI プロキシサーバー（ポート3001）
// Cloudflare Workers から直接 OpenAI API を呼べないため
// このサーバーを経由して AI 処理を行います

import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// .dev.vars からAPIキーを読み込む
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

async function callAI(messages, model, apiKey, baseUrl) {
  const url = `${baseUrl}/chat/completions`
  const body = JSON.stringify({ model, messages, max_tokens: 1500, temperature: 0.2 })

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

const PROPERTY_JSON_SCHEMA = `{
  "name": "物件名",
  "catch_copy": "キャッチコピー（ない場合はAIが魅力的な文言を生成）",
  "price": 数値（万円、不明なら null）,
  "price_unit": "万円",
  "layout": "間取り(例:3LDK、不明なら null)",
  "area": 数値（専有面積㎡、不明なら null）,
  "address": "所在地（都道府県から）",
  "station": "最寄り駅名（例:渋谷駅）",
  "walk_minutes": 数値（徒歩分、不明なら null）,
  "built_year": "築年月(例:2015年築、不明なら null)",
  "floors": "階数(例:2階建て、不明なら null)",
  "structure": "構造(例:RC造、木造、不明なら null)",
  "land_area": 数値または null,
  "parking": "駐車場情報（不明なら null）",
  "balcony_area": 数値または null,
  "building_features": "建物の特徴（不明なら null）",
  "surrounding": "周辺環境（不明なら null）",
  "interior": "室内の特徴（不明なら null）",
  "facilities": ["以下から該当するものを配列で: 駐車場, バス・トイレ別, エアコン, システムキッチン, オートロック, フローリング, バルコニー, エレベーター, 宅配ボックス, 床暖房, ウォークインクローゼット, 追い焚き"]
}`

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

  // ヘルスチェック
  if (req.method === 'GET' && req.url === '/health') {
    jsonRes(res, { ok: true, hasApiKey: !!DEFAULT_API_KEY })
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
      const { imageUrl, webUrl, apiKey: userApiKey, baseUrl: userBaseUrl } = JSON.parse(body)

      // ユーザー指定キー → 環境変数キーの順で使用
      const apiKey = userApiKey || DEFAULT_API_KEY
      const baseUrl = userBaseUrl || DEFAULT_BASE_URL

      if (!apiKey) {
        jsonRes(res, {
          error: 'OpenAI APIキーが設定されていません。設定画面からAPIキーを入力するか、.dev.vars に OPENAI_API_KEY を設定してください。',
          needApiKey: true
        }, 503)
        return
      }

      let messages, model

      if (imageUrl) {
        // 画像解析（base64 または URL）
        // 画像はビジョン対応モデルが必要
        model = 'gpt-4o'
        messages = [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: `この不動産チラシ・物件画像から物件情報を抽出してください。
以下のJSON形式で返してください。JSONのみを返してください（\`\`\`json なども不要）。

${PROPERTY_JSON_SCHEMA}`
            },
            {
              type: 'image_url',
              image_url: { url: imageUrl, detail: 'high' }
            }
          ]
        }]

        console.log(`[AI Proxy] Image analysis with model: ${model}`)

      } else if (webUrl) {
        model = 'gpt-4o-mini'
        let pageContent = ''
        try {
          const pageRes = await fetch(webUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
              'Accept-Encoding': 'gzip, deflate, br',
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
            .substring(0, 8000)
        } catch (e) {
          jsonRes(res, { error: `ページの取得に失敗しました: ${e.message}` }, 400)
          return
        }

        messages = [{
          role: 'user',
          content: `以下の不動産WebページテキストからJSON形式で物件情報を抽出してください。JSONのみを返してください。

${PROPERTY_JSON_SCHEMA}

--- Webページテキスト ---
${pageContent}`
        }]

        console.log(`[AI Proxy] Web URL analysis: ${webUrl}`)

      } else {
        jsonRes(res, { error: 'imageUrl または webUrl が必要です' }, 400)
        return
      }

      const content = await callAI(messages, model, apiKey, baseUrl)
      console.log(`[AI Proxy] Raw response (first 200): ${content.substring(0, 200)}`)

      // JSON抽出
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]+?)\s*```/) || content.match(/(\{[\s\S]+\})/)
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content
      let parsed
      try {
        parsed = JSON.parse(jsonStr.trim())
      } catch {
        // JSONパースに失敗した場合、テキストから直接抽出を試みる
        throw new Error(`AIがJSON形式で返答しませんでした: ${content.substring(0, 100)}`)
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
