# POWER WATCH Studio

時計の台本と実物画像から、Instagram Reel向けストーリー動画を制作するWebアプリです。現在は **Phase 1 (Foundation)** が完了しており、ログイン、Project CRUD、Cloudflare R2への時計画像登録まで利用できます。

## 技術構成

- Next.js 16 / React 19 / TypeScript strict / App Router
- PostgreSQL + Drizzle ORM（標準PostgreSQLのため接続先を交換可能）
- Cloudflare R2（非公開オブジェクト、5分間の署名URL）
- 独自のDBセッション認証（HttpOnly / Secure / SameSite cookie）
- Zod、Vitest、ESLint、Prettier

## ローカルセットアップ

必要なもの: Node.js 22以上、pnpm、PostgreSQL、Cloudflare R2 bucket。

```bash
cp .env.example .env.local
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Windows PowerShellでは `Copy-Item .env.example .env.local` を使用してください。`ADMIN_EMAIL` と `ADMIN_PASSWORD` はseed後に実行環境から削除できます。

## 環境変数

`.env.example` を参照してください。機密情報はすべてServer Sideだけで参照され、ブラウザbundleへは含まれません。

## DB migration

スキーマ変更時は `pnpm db:generate` でSQLを生成し、Preview / Productionで `pnpm db:migrate` を実行します。接続先はNeon、Supabase等のVercelと連携できるManaged PostgreSQLを利用できます。

## Vercel deployment

1. GitHub repositoryをVercel ProへImportします。
2. Framework PresetはNext.js、Build Commandは`pnpm build`を使用します。
3. PreviewとProduction双方に`.env.example`記載の環境変数を登録します。
4. Production DBでmigrationとadmin seedを一度実行します。
5. Custom DomainをVercel Project Settingsから追加します。

GitHub連携後はPull Request / branch pushごとにPreview Deploymentが作成されます。R2への書き込みはサーバー経由で行うため、R2 credentialsをブラウザへ公開しないでください。

## ストレージ規則

Phase 1の時計画像は `projects/{projectId}/source/{uuid}.{ext}` に保存します。Bucketは公開せず、所有者確認後に短時間の署名URLを発行します。Project削除時はR2オブジェクトを先に削除し、失敗した場合はDBレコードを保持して不整合を防ぎます。

## 品質確認

```bash
pnpm lint
pnpm format:check
pnpm test
pnpm build
```

## Phase 1の範囲

- Login / Logout / session
- Project List / Create / Detail / Duplicate / Delete
- 台本、Style、Language、60/90秒の登録
- 複数時計画像と各Labelの登録
- R2 private uploadとsigned read URL
- PC優先・スマートフォン対応のLuxury UI

Storyboard生成以降は意図的に未実装です。Phase 2でOpenAI Structured Outputs、Storyboard schema、Scene editorを追加します。
