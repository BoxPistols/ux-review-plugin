<!-- claude-memory-sync: auto-generated -->

## グローバル設計方針

# グローバル設計方針

## コンポーネント設計
- 単一責任。1コンポーネント1責務
- Props は必ず型定義。any 禁止
- 副作用は hooks に分離する

## 命名規則
- コンポーネント: PascalCase
- hooks: use プレフィックス
- 定数: UPPER_SNAKE_CASE

## Claude への指示スタイル
- 差分だけ返す。ファイル全体を返さない
- 変更理由を1行コメントで添える
- 選択肢がある場合は推奨を1つ明示してから提示する

## 禁止パターン
- any の使用
- console.log の commit
- ハードコードされた文字列（i18n対象はすべて定数化）

---

## AI チャット汎用パターン

### ハイブリッド AI 戦略（オフライン + オンライン）
- 常にオフライン動作可能: FAQ ローカル検索（Fuse.js ファジーマッチ）
- AI があれば強化: Embedding セマンティック検索 + LLM 生成
- AI エラー時: FAQ フォールバック
- 3層: Semantic Search → Keyword Search → Hardcoded Suggestions

### OpenAI/Gemini デュアル対応
- Gemini は OpenAI 互換エンドポイント (`generativelanguage.googleapis.com/v1beta/openai/`) 経由
- Bearer 認証統一。`model.includes('gemini')` で分岐
- レスポンス抽出: OpenAI標準 / Responses API / Gemini native の3形式を正規化

### Embedding セマンティック検索
- `text-embedding-3-small` (512次元に短縮でコスト削減)
- インメモリ VectorIndex（バッチ100件単位でAPI呼び出し）
- コサイン類似度: `dot / (norm_a * norm_b)`, threshold=0.3, topK=5

### ページ文脈認識パターン
- 現在のページ情報 `{ title, name, description }` をシステムプロンプトに動的注入
- 指示語解決: 「このUI何?」→ 現在ページのコンポーネントを特定
- 応用: ドキュメントビューア等で「現在地」パラメータを渡すだけで同じ仕組みが使える

### ペルソナ検出
- ページシグナル(+2点) + 語彙シグナル(+1点/match) でスコアリング
- 閾値2以上で判定（designer/engineer/unknown）
- ペルソナ別プロンプト拡張を動的注入

### APIキー管理パターン
- ビルド時デフォルト (`import.meta.env`) → ユーザー入力上書き (localStorage)
- モデル互換性チェック（defaultKey 使用時に制限）
- 接続テスト UI

### ショートカット管理
- KeyDown 捕捉 + IME対応 (`e.nativeEvent.isComposing`)
- 修飾キー正規化（Mac: Cmd / Windows: Ctrl 自動判定）
- localStorage 永続化 + リセット機能

## Storybook 汎用パターン

### テーマ切替
- toolbar globalTypes で複数テーマを定義
- `parseThemeValue()` で "dark-scheme" → mode + scheme に分離
- `data-theme-transitioning` 属性で切替トランジション制御（350ms）
- 初回マウントはトランジションなし

### Decorator 多重ラップ
- Emotion ThemeProvider → MUI ThemeProvider → CacheProvider → CssBaseline
- パラメータ制御: noPadding / fullscreenNoPadding / blockLinks
- コンテキスト注入: viewMode 判定で docs 時は特定コンポーネント非表示

### Story カテゴリ設計
- 番号プレフィックス (00-Guide, 01-Philosophy, 02-Tokens, ...) でソート順を制御
- storySort で明示的順序指定

## デザインシステム汎用パターン

### マルチスキーム対応
- ColorSet: { main, dark, light, lighter, contrastText } の統一インターフェース
- lighter スロットをスキーム環境色で上書き（セマンティック色は固有 lighter を保持）
- CSS Variables で Tailwind と MUI を色共有

### CVA (class-variance-authority) パターン
- variant × size のマトリクスで型安全なバリエーション管理
- Tailwind utility + CVA = styled-components 不要
- shadcn/ui 互換の設計

### MUI + Tailwind 共存
- MUI: 複雑な UI コンポーネント（Dialog, DataGrid 等）→ theme.palette トークン参照
- Tailwind: シンプルなコンポーネント（Button, Card）→ CVA + CSS Variables
- tailwind.config で `var(--color-*)` を colors に定義 → テーマ自動切替

### W3C DTCG トークン
- `$value` + `$type` 形式で機械可読
- light/dark を同一ファイルに構造化
- Figma / デザインツール連携可能

### コンポーネントメタデータ
- JSON で name/category/path/variants/sizes/accessibility/prohibited/sample を定義
- AI エージェントがコンポーネント仕様を自動認識可能

## LP 汎用パターン

### framer-motion アニメーション
- `useInView({ once: true })` + stagger (index * delay) でスクロールトリガー
- `useScroll` + `useTransform` でパララックス効果
- カスタムイージング: `[0.25, 0.1, 0, 1]` でモダンな減速感
- グラデーションオーブ: `radial-gradient` + `blur` + keyframes で有機的な背景

### ダークモード分岐
- `const isDark = theme.palette.mode === 'dark'`
- alpha 値で分岐: dark=0.15, light=0.12（色付きシャドウ）
- bgcolor/borderColor を三項演算子で切替

### ホバー効果統一パターン
- `transition: 'border-color 0.2s ease, box-shadow 0.2s ease'`
- `&:hover: { boxShadow: '0 12px 40px rgba(brand,alpha)', borderColor: 'primary.main' }`
- 全カード系コンポーネントで共通化

### レスポンシブ
- CONTAINER_SX: `{ maxWidth: 1120, mx: 'auto', px: { xs: 2.5, sm: 3, md: 4 } }`
- Grid: `gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }`
- フォント: `fontSize: { xs: '2rem', md: '2.8rem' }`

## モノレポ汎用パターン

### pnpm workspace + Turborepo
- `pnpm-workspace.yaml` でパッケージ定義
- `workspace:*` でルートパッケージを apps から参照
- turbo.json: `dependsOn: ["^build"]` で依存順ビルド、dev は `cache: false, persistent: true`

### 統合ビルド・デプロイ（Vercel）
- ビルドスクリプトで全アプリを `dist/` サブディレクトリに出力
- `vercel.json` の rewrites でパスルーティング（`/app-name/(.*)` → `/app-name/$1`）
- 各アプリは `VITE_BASE_PATH=/app-name/` でビルド

### ポート管理
- デフォルトポートを定数定義
- localStorage で上書き可能（開発者向け設定パネル）
- ポート生存確認: HEAD fetch + timeout → 隣接ポートスキャン
- ローカル/本番リンク自動切替: `isDev ? localhost:PORT : origin + path`

### dev:all 一括起動
- `pnpm dev & pnpm storybook & pnpm -F app1 dev & ... & wait`
- 個別起動: `pnpm --filter app-name dev`

## OSS公開アプリのレート制限パターン
- デフォルトAPIキー利用にサーバーサイドでデイリー制限を設ける
- 招待コード（env変数管理）で制限緩和。localStorage保存 + APIヘッダー送信
- ユーザー自身のAPIキー入力で無制限利用（制限バイパス）
- カウント管理: Vercel KV / Upstash Redis でIP or 招待コード別デイリーカウント
- 3層: OSS一般（厳しい制限）→ 招待あり（緩い制限）→ 自前キー（無制限）
- Claude Codeスキル `/rate-limit-setup` で新規アプリにも一発適用可能
- テンプレート: `~/.claude/skills/rate-limit-setup/templates/`

## パネルリサイズ汎用パターン
- トグルボタンは translate-x-full でパネル外に突き出す（リサイズハンドルと物理分離）
- リサイズ: RAF スロットリング + iframe オーバーレイ（マウスイベント横取り防止）
- 入力エリアのリサイズ: 上部ドラッグハンドルバー方式（ブラウザネイティブresizeより操作性良い）
- ナロー幅検知: ResizeObserver でコンテナ幅監視 → アイコンのみ表示に切り替え

## ブラウザ互換ダウンロードパターン
- `createElement('a')` → DOM に appendChild → click() → setTimeout で removeChild + revokeObjectURL
- Safari は DOM 未追加の要素の click() を無視するため appendChild 必須
- revokeObjectURL は 100ms 遅延（非同期ダウンロード開始を待つ）

## React ステートアップデーター純粋性
- `setState(prev => ...)` 内に副作用（localStorage, alert, fetch 等）を入れない
- React 18 Strict Mode でアップデーターは2回実行される → alert二重表示、save二重書き込み
- 対策: 外側で計算 → save → setState(value) → alert の順で実行

---
<!-- このファイルは claude-memory-sync が管理します -->
<!-- 自由に編集してください。cm コマンドで同期されます -->

## プロジェクト固有の記憶（ux-review-plugin）

## UX Review Plugin — 設計方針・知見

### プラグイン概要
- Figma Plugin。フレーム選択→AIレビュー→深掘りチャット
- AI: Gemini 2.5 Flash / GPT-5.4-nano/mini
- SpecBridge API 連携（仕様検索 + Curated Snippets）
- ログタブ: ピン留め・インライン編集・指摘取捨選択・メモ

### レビューの本質（最重要）
- Figmaの目的は「成功する前提の成功例」を載せること
- レビューの本質はビジネス要件→UI/UXの翻訳精度
- 仕様根拠（WCAG/MDN等）は下支えであり主役ではない
- エラーパターンやローディングを全指摘するとレビュー疲れを起こす
- ゴール: デザイナーが情報設計とビジュアルを成立させ、エンジニアがそのまま実装できる状態

### タブ別前提条件（明確に分離する）
- 情報設計: 情報の構造・階層・フロー。UIの見た目に触れない
- ビジュアル: 視覚的品質・一貫性・美しさ
- デザインシステム: バリアブル・プロップス・デザイン要素そのもの
- 実装引継ぎ: バックエンド連携・アーキテクチャ整合性。見た目ではなく機能

### Curated Snippets 設計方針
- 2段階構造: question（抽象的な問い）→ text（具体的な指摘）
- コンポーネント名で固定しない。Web原理原則ベースで抽象度を上げる
- タブ別に mode フィールドで分類（ia/visual/system/handoff）
- 日本のB2B現場向け: 専門用語を避け素朴な問いかけ
- tags に専門用語を残す（Embedding精度のため）

### アンチパターン（検出すべき）
- ダイアログに何でも詰め込む（画面構成検討の放棄）
- 5項目以上のフォームをダイアログに入れる
- Molecule/Organism レベルで意味が不明な塊

### B2B現場の現実
- 上流から要件が降りるが UI/UX に詳しい人がいない
- デザイナーも Web の仕組みを深く理解していない
- 顧客要望に近そうな要素をなんとなく配置するのが実情
- ブラウザ仕様が議論されることは稀
- 実際の関心: 実装可能か・ビジネス要件に合っているか

### パフォーマンス知見
- transition: all は禁止 → 具体プロパティ指定
- contain: layout style paint で再描画範囲を限定
- enrichWithSpecs の DOM 更新はバッチ化（requestAnimationFrame）
- highlight-node は depth 5 制限。ページ全体検索は禁止（フリーズ防止）
- チャットは panel-body の外に配置（SpecBridge 更新でスクロール影響を受けない）

### ファイル構成
- dist/code.js: Figma Plugin API（ES2017、Promise.then）
- dist/ui.html: 単一HTML（CSS + JS 含む）
- curated-snippets-final.json: SpecBridge 投入用ナレッジ 28件
- manifest.json: SpecBridge ドメイン追加済み

### セキュリティ・品質
- update-review のフィールド書き込みは EDITABLE_FIELDS ホワイトリストで制限（プロトタイプ汚染防止）
- highlight-node の候補検索は Object ハッシュ（O(1)）
- ピン付きログ上限 50件（clientStorage 容量保護）
- AIにURLを生成させない。検証済みURLはSpecBridge APIのみ

### 競合分析（2026-03時点）
- onBeacon（Apple Siri チーム発）: 600+ベストプラクティス、GPT-5+Claude搭載。最大手
- ClarityUX: ヒートマップ+A/Bテスト+リンティング。全部入り
- Review Raven: LP/メール/SNS向け即時フィードバック
- Design Lint / Stark: ルールベースリンティング / アクセシビリティ特化
- 全て英語圏のLP/マーケ/プロダクトデザイン向け
- 日本B2B特化・要件→実装の橋渡し検証は空白地帯

### ポジショニング（Figma Community公開時）
- 「デザインレビュー」ではなく「要件→実装の橋渡し検証」として位置づける
- 差別化: タブ別前提分離 / 日本語B2B / Curated Snippets / ログ管理 / 深掘りチャット
- 被る部分: AIフィードバック全般 / アクセシビリティ / デザインリンティング

### ファイル構成（更新）
- docs/curated-snippets-final.json に移動済み

### チャットの既知問題・修正履歴
- チャットレスポンスが空で表示される問題あり（Gemini の空レスポンス / 安全フィルター等）
- エラーを reviewLog ではなくチャット内に直接表示するよう修正済み
- 20秒タイムアウト追加済み
- 空レスポンス検出 + ユーザー向けメッセージ追加済み
- まだ空レスポンス問題が再発している可能性あり → 次回セッションで要調査（APIレスポンス構造のデバッグ）

### 今セッションの実装履歴（81b1eb5→a104668）
1. 未対応3点修正（空欄文言・Few-shot・閾値50文字）
2. ログタブ追加（ヘッダータブ・ピン・編集・取捨選択・メモ）
3. パフォーマンス改善（transition:all排除・contain・RAF・バッチDOM）
4. ハイライト（ロケートアイコン・フラッシュ・depth制限・ページ全検索廃止）
5. 情報設計モード強化（静的チェック除外・専用プロンプト）
6. チャット改善（panel-body外分離・リサイズ・オーバーレイ・ローディング・コピー）
7. URL生成禁止（根拠は出典名のみ、SpecBridge APIが検証済みURL提供）
8. Curated Snippets 28件（2段階構造・タブ別mode・SpecBridge投入済み）
9. レビュー指摘5点修正（ホワイトリスト・Set化・ピン上限・直接送信・docs移動）
10. チャットAPI修正（空レスポンス・タイムアウト・エラー詳細）

### 3者連携
- specbridge: SpecBridge API提供。Curated Snippets の CURATED ソース対応済み
- local-ui-builder: UI制作者視点。Figma JSON互換出力

