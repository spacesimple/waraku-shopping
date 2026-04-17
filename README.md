<<<<<<< HEAD
# 🏠 不動産チラシ生成ツール

## プロジェクト概要
- **名前**: 不動産チラシ生成ツール
- **目的**: 不動産物件のチラシを3パターンのデザインで自動生成
- **主な機能**: AI自動入力（画像/URL解析）・3パターンチラシ生成・印刷・PNG保存

## 🔗 URLs
- **サンドボックス**: http://localhost:3000
- **AI解析**: Cloudflare Worker 内で Gemini を直接利用

## 📐 アーキテクチャ

```
[ブラウザ]
    ↓ HTTP
[Cloudflare Pages Worker: ポート3000]  ← wrangler pages dev
    ├── GET /            → HTML (SPA)
    ├── POST /api/auth/* → D1認証
    ├── GET/POST /api/company → D1会社情報
    ├── CRUD /api/properties/* → D1物件データ
    ├── POST /api/upload → R2画像保存
    ├── GET /api/files/* → R2画像取得
    └── POST /api/ai/analyze → Gemini / ローカル解析
```

## ✅ 実装済み機能

| 機能 | 詳細 |
|------|------|
| ユーザー認証 | 登録・ログイン・ログアウト（PBKDF2ハッシュ + D1セッション） |
| 会社情報管理 | 会社名/電話/住所/宅建業者番号をD1に保存 |
| 物件管理 | 基本情報・詳細・設備のCRUD（D1） |
| 画像アップロード | R2ストレージへ保存・表示 |
| **AI自動入力** ✨ | 画像・PDF・URLから物件情報を解析。Gemini またはローカル解析で動作 |
| **URL解析** ✨ | 不動産サイトURLから物件情報を抽出 |
| サンプルデータ | ワンクリックでサンプル物件を読み込み |
| 3パターンチラシ | モダン（緑）/ ラグジュアリー（紺×金）/ ポップ（オレンジ） |
| 印刷 | window.print() でA4印刷 |
| PNG保存 | html2canvas でPNG画像ダウンロード |

## 🗄️ データアーキテクチャ

### データモデル
- **users**: ユーザー（メール・パスワードハッシュ）
- **sessions**: セッション管理（30日有効）
- **companies**: 会社情報（ユーザーに1対1）
- **properties**: 物件情報（ユーザーに1対多）

### ストレージ
- **Cloudflare D1 (SQLite)**: ユーザー・物件・会社データ
- **Cloudflare R2**: 物件画像ファイル

## 🤖 AI機能の使い方

### 方法1: サーバー側のAPIキー（本番環境）
`.dev.vars` に設定:
```
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta2
```

### 方法2: ブラウザ側で入力（ユーザーが自分のキーを使用）
ナビバーの「🔑 AIキー」ボタンからGemini APIキーを入力
→ ローカルストレージに保存、リクエスト毎に直接送信

### 対応モデル
- テキスト解析: `gemini-1.5-mini` (Gemini)
- 画像解析: Gemini API が必要。ただし、クラウド接続がない場合はPDF/URLのローカル解析にフォールバックします。

## 👤 ユーザーガイド

1. **新規登録** → メールアドレス＋パスワードでアカウント作成
2. **会社情報設定** → チラシのフッターに表示される情報を入力
3. **新規物件登録**:
   - AI自動入力: チラシ画像またはURLを入力して自動抽出
   - サンプルデータ: ボタン1クリックでデモデータ入力
   - 手動入力: フォームに直接入力
4. **チラシ生成** → 3パターンから選択
5. **出力** → 印刷 または PNG保存

## 🚀 起動方法

```bash
# 依存インストール
npm install

# D1マイグレーション
npm run db:migrate:local

# ビルド
npm run build

# 起動（PM2）
pm2 start ecosystem.config.cjs

# またはサービス個別起動
npx wrangler pages dev dist --d1=chirashi-db --local --ip 0.0.0.0 --port 3000
```

## ☁️ Cloudflare本番デプロイ

```bash
# D1データベース作成
wrangler d1 create chirashi-db
# → wrangler.jsonc の database_id を更新

# R2バケット作成
wrangler r2 bucket create chirashi-files

# マイグレーション適用
wrangler d1 migrations apply chirashi-db

# AIキー設定（本番）
wrangler pages secret put GEMINI_API_KEY

# デプロイ
npm run deploy
```

## 📅 更新履歴
- 2026-04-13: AI機能改善・Node.jsプロキシ・APIキーモーダル・PNG保存・印刷CSS
- 2026-04-13: 初回実装
=======
# waraku-shopping
>>>>>>> origin/main
