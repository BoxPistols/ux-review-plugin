# Figma Community 公開ガイド

## 公開の2択

### A. 社内・チーム限定（プライベート公開）

レビュー不要。即時公開。

1. Figma デスクトップアプリを開く
2. Plugins → Development タブ
3. プラグインを右クリック → **Publish**
4. 「Publish to」で **自分の Organization** を選択
5. Publish

### B. Figma Community 全体（パブリック公開）

レビュー期間: 5〜10営業日

#### 必要な素材

| 素材 | サイズ | 内容 |
|---|---|---|
| プラグインアイコン | 128×128px | ロゴ |
| カバー画像 | 1920×960px | Community 一覧表示用 |
| 説明文 | 任意 | 機能・使い方（英語推奨） |
| タグ | 最大12個 | 検索用キーワード |
| サポート連絡先 | メール or URL | 問い合わせ先 |

#### 手順

1. **manifest.json の ID を正式版に置換**
   - 公開フォームで「Generate ID」をクリック → 生成された ID を `manifest.json` の `id` に書き込み
   - 現在の `"id": "ux-review-ai-unified"` はローカル開発用の仮 ID

2. Figma → Plugins → Development タブ
3. プラグインを右クリック → Publish
4. 「Publish to」を **Figma Community** に設定
5. アイコン・カバー・説明・タグを入力
6. Publish で審査提出

---

## 審査時の注意点

### ネットワークアクセスの開示

審査フォームのコメントに以下を明記する:

```
This plugin makes API calls to OpenAI and Google Gemini for AI-powered design review.

- API keys are stored locally in Figma clientStorage (never transmitted to third parties)
- Design node structure (names, types, dimensions) is sent to AI for analysis
- No pixel data, images, or proprietary design assets are transmitted
- Users must provide their own API key
```

### manifest.json の networkAccess

現在の設定で審査要件を満たしている:
```json
{
  "networkAccess": {
    "allowedDomains": [
      "https://api.openai.com",
      "https://generativelanguage.googleapis.com",
      "https://fonts.googleapis.com",
      "https://fonts.gstatic.com"
    ],
    "reasoning": "OpenAI API / Gemini API / Google Fonts"
  }
}
```

---

## 英語対応

UIは日本語のまま、レビュー出力言語のみ自動切替する:

```javascript
// Figma の言語設定を取得
var lang = figma.currentUser ? figma.currentUser.locale : 'ja'
var isJa = lang.indexOf('ja') === 0

// REVIEW_PROMPT 末尾に追加
fullPrompt += isJa
  ? '\n\n出力言語: 日本語'
  : '\n\nOutput language: English. All messages, categories and suggestions must be in English.'
```

Community 掲載ページの説明文とタグは英語で記載する。

---

## 個人アカウントからの公開

委託元 Organization に所属していても、個人アカウントから公開可能。

1. 個人アカウントの Figma にサインイン
2. 新しい Draft ファイルを開く
3. Plugins → Development → Import plugin from manifest → `manifest.json` を読み込み
4. 右クリック → Publish → Community を選択
5. 以降は個人アカウント所有のプラグインとして管理される

ソースコードは同じものを使用可能。委託元 Organization とは完全に分離される。

---

## 有料化ロードマップ

### Phase 1: 無料公開（現在）

- ユーザーが自分の API キーを設定
- 利用回数制限なし
- Community でユーザー数を獲得

### Phase 2: Freemium（API 埋め込み）

ユーザーは API キー不要。プロキシ経由で利用。

```
ユーザー → Figma プラグイン → Cloudflare Workers → OpenAI API
                                    ↓
                              KV: プラン判定 + 回数チェック
```

| プラン | 1日の上限 | 月額 |
|---|---|---|
| Free | 5回 | 無料 |
| Pro | 50回 | $5-10 |

### Phase 3: Figma 公式課金

- Figma の有料プラグイン課金機能を利用
- Stripe アカウント連携
- approved creator 認定が必要（ユーザー数・実績があると通りやすい）
- Figma 手数料: 30%

### 技術的な実装

```javascript
// Cloudflare Workers KV のユーザーレコード
{
  plan: 'free' | 'pro',
  daily_count: 12,
  monthly_count: 145,
  reset_date: '2026-03-23',
  paid_until: '2026-04-23'
}
```

決済は Figma プラグイン内から Web ページに遷移させる形が現実的。

---

## 推奨タグ（英語）

```
ux-review, design-review, ai, figma-plugin, information-architecture,
design-system, accessibility, material-design, ux-audit, handoff
```

## 推奨説明文（英語）

```
AI-powered UX review plugin for Figma.

Analyze your designs from 4 perspectives:
• Information Architecture — task completion flow, state design
• Visual Design — typography hierarchy, color consistency
• Design System — naming conventions, variant coverage
• Implementation Handoff — interaction specs, state transitions

Features:
• Click any issue to highlight the target node on canvas
• Copy individual findings or download full review as Markdown
• Chat with AI about specific design decisions
• Review history with automatic saving

Supports OpenAI (GPT-5.4) and Google Gemini (2.5 Flash, free tier available).
```
