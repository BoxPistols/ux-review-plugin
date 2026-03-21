# UX Review AI — Figma Plugin

Figma 上のデザインを AI でレビューし、デザイントークンや UI コンポーネントを自然言語から生成する統合プラグインです。

## 機能

| タブ | 機能 |
|---|---|
| **Review** | 選択フレームを AI 分析 → スコア + 指摘（CRITICAL/WARNING/GOOD） |
| **Generate** | 自然言語 → Variables / Component Variants / Auto Layout フレーム生成 |
| **Tokens** | W3C Design Tokens JSON → Figma Variables 一括インポート |
| **Manage** | Variable Collections の一覧・削除・Undo |

## セットアップ

### 1. リポジトリをクローン

```bash
git clone https://github.com/BoxPistols/ux-review-plugin.git
```

### 2. Figma デスクトップアプリでプラグインを読み込む

1. Figma デスクトップアプリを開く
2. 任意のファイルを開く
3. メニュー: **Plugins → Development → Import plugin from manifest...**
4. クローンしたフォルダ内の `manifest.json` を選択

### 3. プラグインを起動

**Plugins → Development → UX Review AI**

### 4. API キーを設定

1. プラグイン右上の **⚙（設定）** をクリック
2. **Model** を選択:
   - `Gemini 2.5 Flash` — 無料（Google AI Studio で API キー発行）
   - `gpt-5.4-nano` — 高速・低コスト（OpenAI）
   - `gpt-5.4-mini` — 高精度（OpenAI）
3. **API Key** を入力
4. **テスト** ボタンで接続確認

#### API キーの取得方法

**Gemini（無料）:**
1. [Google AI Studio](https://aistudio.google.com/apikey) にアクセス
2. 「API キーを作成」をクリック
3. 発行されたキーをプラグインに貼り付け

**OpenAI:**
1. [OpenAI Platform](https://platform.openai.com/api-keys) にアクセス
2. 「Create new secret key」をクリック
3. 発行されたキー（`sk-...`）をプラグインに貼り付け

## 使い方

### Review タブ — デザインレビュー

1. Figma キャンバスでレビューしたい**フレームを選択**
2. **Review** ボタンをクリック
3. AI がスコア（1-100）と指摘を生成:
   - **CRITICAL**: 即対応が必要
   - **WARNING**: 改善推奨
   - **GOOD**: 良い点
4. 指摘項目をクリック → Figma 上の該当ノードがハイライト
5. レビュー結果は**履歴に自動保存**（最大 20 件）

**レビュー観点の優先度:**
- ユーザー目的達成・情報設計・CTA・導線
- 画面構造・コンポーネント選定
- ビジュアル品質（タイポグラフィ・スペーシング）

### Generate タブ — AI で UI を生成

1. テキストボックスに自然言語で記述:
   ```
   ボタンのバリアントセット（Primary/Secondary × S/M/L）
   SaaS 向けカラートークン
   カード一覧画面
   ```
2. **生成 →** をクリック（または `⌘+Enter`）
3. プレビューで構造を確認
4. **確定して生成** → Figma キャンバスに配置
5. 不要なら **↩ 元に戻す** で削除

**生成可能なもの:**
- **Variables**: カラー・スペーシング等のデザイントークン
- **Component Variants**: Auto Layout 付きのバリアント付きコンポーネント
- **Frames**: Auto Layout で構造化された画面 UI

### Tokens タブ — デザイントークンのインポート

1. W3C Design Tokens 形式の JSON を貼り付け:
   ```json
   {
     "color": {
       "primary": { "$type": "color", "$value": "#2563EB" },
       "surface": { "$type": "color", "$value": "#F8FAFC" }
     },
     "spacing": {
       "sm": { "$type": "number", "$value": 8 },
       "md": { "$type": "number", "$value": 16 }
     }
   }
   ```
2. **Import →** をクリック
3. Figma の Variables パネルにコレクションが作成される

### Manage タブ — 管理

- **更新**: Variable Collections の一覧を更新
- **プラグイン作成分を削除**: このプラグインで作成した Collections のみ削除
- **全削除**: ファイル内の全 Collections を削除（手動作成分含む）
- **↩ 元に戻す / 全 Undo**: 生成操作を巻き戻し

## リサイズ

- 右下のグリップをドラッグしてウィンドウサイズを変更
- ヘッダーの **⤢** ボタンで拡大/縮小を切り替え

## 対応 AI モデル

| モデル | プロバイダ | 特徴 |
|---|---|---|
| Gemini 2.5 Flash | Google | 無料枠あり（20 回/24h） |
| gpt-5.4-nano | OpenAI | 高速・低コスト |
| gpt-5.4-mini | OpenAI | 高精度・推論強化 |

## ファイル構成

```
ux-review-plugin/
├── manifest.json      # Figma プラグイン設定
├── dist/
│   ├── code.js        # プラグインバックエンド（Figma API 操作）
│   └── ui.html        # プラグイン UI（4 タブ）
└── ux-proxy/          # Cloudflare Workers プロキシ（オプション）
```

## 技術仕様

- **Figma Plugin API**: Variables, Components, Auto Layout, Selection 監視
- **JavaScript**: ES2017 互換（Figma ランタイム制約）
- **AI API**: Gemini / OpenAI の直接呼び出し（プラグイン UI 内で fetch）
- **デザイン基準**: Material Design 3
- **永続化**: Figma `clientStorage`（API キー・レビュー履歴）
