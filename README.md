# POWER WATCH Studio

時計の台本と実物画像から、Instagram Reel向けストーリー動画を制作するWebアプリです。現在は **Phase 3 (Scene Video Generation)** まで完了しており、Storyboardの各Sceneを非同期に動画化してR2で管理できます。

## 技術構成

- Next.js 16 / React 19 / TypeScript strict / App Router
- PostgreSQL + Drizzle ORM（標準PostgreSQLのため接続先を交換可能）
- Cloudflare R2（非公開オブジェクト、5分間の署名URL）
- OpenAI Responses API + Structured Outputs（Zod schema）
- Runway Dev公式SDK + Vercel Queues（非同期Scene動画生成）
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
4. Vercel CLIでProjectをlinkし、Queuesを利用できる状態にします。`vercel.json`の`video-generation` triggerがpush consumerを登録します。
5. Production DBでmigrationとadmin seedを一度実行します。
6. Custom DomainをVercel Project Settingsから追加します。

GitHub連携後はPull Request / branch pushごとにPreview Deploymentが作成されます。R2への書き込みはサーバー経由で行うため、R2 credentialsをブラウザへ公開しないでください。

## AI Storyboard

`OPENAI_API_KEY` と `OPENAI_MODEL` はServer Side環境変数としてのみ設定します。既定モデルは品質とコストのバランスを取る `gpt-6-sol` で、環境変数から交換できます。Responses APIの応答保存は無効化しています。

StoryboardはJSON Schema準拠のStructured Outputとして生成し、Scene番号、3〜8秒制約、60/90秒の合計、時計画像Label、固定Openingの文字Overlay規則をServer Sideで再検証します。再生成時は、検証と新VersionのDB保存が成功したトランザクション内でのみActive Versionを切り替えます。

実課金を伴う手動Integration Testは、API Keyを設定した環境で明示的に次を1回実行できます。

```bash
pnpm test:openai
```

通常の `pnpm test` はMock / fixtureのみを使用し、OpenAI APIを呼びません。

## Scene Video Generation

`RUNWAY_API_KEY` はServer Sideのみで参照します。Styleごとのモデルは `VIDEO_MODEL_CINEMATIC` / `VIDEO_MODEL_ANIMATION` で設定し、Phase 3のRunway adapterは現行の `gen4.5` を正式サポートします。Scene尺はStoryboardと同じ3〜8秒です。

生成APIはDBへGeneration/Jobを作成して直ちに202を返し、Vercel QueuesがRunwayへの投入と5秒以上間隔の状態確認を行います。Providerの一時URLはブラウザへ直接公開せず、HTTP状態・`video/mp4`・サイズ・timeoutを検証してから `projects/{projectId}/scenes/{sceneId}/generations/{generationId}.mp4` に保存します。Previewは所有者確認後のR2署名URLです。

Queueはat-least-once deliveryを前提にJobを冪等に処理します。Runway公式が再試行可能としているHTTP 429/502/503/504と一部の一時Task failureだけを上限付きで再試行します。全体の同時実行数は `VIDEO_GENERATION_CONCURRENCY`（1〜3、既定2）をDB advisory lockで制御します。

料金が発生するRunway疎通は通常テストから分離しています。以下は警告を表示したうえで、3秒のGen-4.5動画を正確に1件だけ作成します。

```bash
pnpm test:runway
```

通常の `pnpm test` はRunwayとR2をMockし、外部APIも課金も発生させません。

## ストレージ規則

Phase 1の時計画像は `projects/{projectId}/source/{uuid}.{ext}` に保存します。Bucketは公開せず、所有者確認後に短時間の署名URLを発行します。Project削除時はR2オブジェクトを先に削除し、失敗した場合はDBレコードを保持して不整合を防ぎます。

## 品質確認

### Phase 4 Final Composition

- ElevenLabsの同一Voiceで、選択済みSceneのNarrationを1回のTTSとして生成します。
- NarrationとFinal MP4は非公開R2オブジェクトとして保存します。
- Remotion Compositionで9:16字幕・年/場所・POWER WATCH Overlayを定義し、Production JobはFFmpegでH.264 MP4を出力します。
- Default BGMとPreset SEは決定的に合成される固定音源で、Narration中はSidechain Duckされます。
- Final RenderはVercel Queueで非同期実行し、Storyboard画面からPreview・Re-render・MP4 Downloadが可能です。

```bash
pnpm lint
pnpm format:check
pnpm test
pnpm build
```

## 実装済み範囲

- Login / Logout / session
- Project List / Create / Detail / Duplicate / Delete
- 台本、Style、Language、60/90秒の登録
- 複数時計画像と各Labelの登録
- R2 private uploadとsigned read URL
- PC優先・スマートフォン対応のLuxury UI
- Responses APIによるStoryboard生成
- 13種の時計映像Scene Preset
- Storyboard Versionの安全な置換
- Scene編集・追加・削除・上下移動
- OpenAI model / tokens / request ID / durationの利用記録
- VideoProvider abstractionとRunway Gen-4.5 adapter
- Vercel Queuesによる非同期Job、遅延poll、上限付きretry
- Scene単位のGenerate / Regenerate / Preview / Generation選択
- 時計画像の署名URLによるimage-to-videoと製品同一性prompt
- Generation version、Runway credits/USD見積・実績、R2永続保存

動画結合、音声、字幕焼き込み、最終書き出しは意図的に未実装です（Phase 4範囲）。
