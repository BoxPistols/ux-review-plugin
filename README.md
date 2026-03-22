# UX Review AI — Figma Plugin

Figma 上のデザインを AI でレビューするプラグインです。情報設計・ビジュアル・デザインシステム・実装引継ぎの4つの観点から分析し、デザイナーとエンジニア間の手戻りを削減します。

## 特徴

- **4つのレビュー観点**: 情報設計 / ビジュアル / デザインシステム / 実装引継ぎ
- **指摘クリックでハイライト**: Figma 上の該当ノードを選択・ズーム
- **セベリティ別グルーピング**: CRITICAL / WARNING / GOOD
- **個別コピー**: 各指摘を個別にクリップボード
- **チャット**: レビュー結果について対話的に深掘り
- **レビュー履歴**: 自動保存、展開表示、個別削除（最大20件）
- **Markdown 出力**: 全文コピー / .md ダウンロード
- **ライト/ダークテーマ**: 切替対応

## セットアップ

### 1. クローン

```bash
git clone https://github.com/BoxPistols/ux-review-plugin.git
```

### 2. Figma で読み込み

1. Figma デスクトップアプリを開く
2. **Plugins → Development → Import plugin from manifest...**
3. `manifest.json` を選択

### 3. API キー設定

プラグイン右上の **⚙** → Model 選択 → API Key 入力 → **テスト**

| モデル | 取得先 |
|---|---|
| Gemini 2.5 Flash（無料） | [Google AI Studio](https://aistudio.google.com/apikey) |
| gpt-5.4-nano | [OpenAI Platform](https://platform.openai.com/api-keys) |
| gpt-5.4-mini | [OpenAI Platform](https://platform.openai.com/api-keys) |

## 使い方

### Review タブ

1. Figma でフレームを選択
2. レビュー観点を選択（情報設計 / ビジュアル / デザインシステム / 実装引継ぎ）
3. **Review** ボタンをクリック

**レビュー結果:**
- スコア（1-100）
- 現状分析 / 改善提案
- CRITICAL → WARNING → GOOD のグルーピング
- 各指摘に個別 Copy ボタン
- 指摘クリックで Figma 上の該当ノードをハイライト

**チャット:**
- レビュー完了後、下部にチャットUI が表示
- 「この指摘について詳しく」「エンジニアへの伝え方」等を対話的に質問

**出力:**
- **全文コピー**: Markdown 形式でクリップボード
- **MD ダウンロード**: `.md` ファイルとして保存

### Manage タブ

- Figma Variables の一覧表示
- プラグイン作成分 / 全体の削除
- Undo

## レビュー観点

| 観点 | フォーカス |
|---|---|
| **情報設計** | タスク完遂フロー、状態設計（空/エラー/ローディング）、意思決定支援 |
| **ビジュアル** | タイポグラフィ階層、カラー一貫性、スペーシングのリズム |
| **デザインシステム** | 命名規則、バリアント網羅性、ガイドライン記載品質 |
| **実装引継ぎ** | インタラクション明示、API接続点、状態遷移図 |

## ファイル構成

```
ux-review-plugin/
├── manifest.json      # Figma プラグイン設定
├── dist/
│   ├── code.js        # バックエンド（Figma API 操作）
│   └── ui.html        # フロントエンド（2タブ: Review / Manage）
└── README.md
```

## 技術仕様

- **JavaScript**: ES2017 互換（Figma ランタイム制約）
- **AI**: Gemini / OpenAI 直接呼び出し
- **永続化**: Figma `clientStorage`
- **フォント**: Noto Sans JP
