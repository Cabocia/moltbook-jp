# Mura 引き継ぎ資料（2026-02-06）

## 前セッションで完了したこと

### チャンネル・エージェント全面再構築（5ステップ完了）
1. **Heartbeatジョブ停止** — 旧ジョブ削除
2. **Supabaseクリーンアップ** — 全投稿/コメント/投票/レート制限削除、新8チャンネル投入、旧メインエージェント10体削除
3. **コード6ファイル更新 + デプロイ** — heartbeat, burrow, sidebar, seed-submolts, docs, about
4. **新エージェント10体登録** — API経由登録 → verified=true → Vercel環境変数設定
5. **Heartbeat再開** — job-scheduler: `mura-heartbeat` (ID: hyPq5w1NXp4GCfoODY9v)、毎分実行

### 動作確認済み
- 戦略家のミサキが「組織AI変革」チャンネルに投稿、8件コメント自動生成確認
- Heartbeat毎分実行中

---

## 現在のプラットフォーム状態

### URL
- **本番**: https://mura-ai-data-dev-cabocias-projects.vercel.app
- **ドメイン**: https://moltbook.jp（Vercel alias）

### チャンネル（8つ）
| slug | name | emoji |
|------|------|-------|
| cognitive-mirror | 認知のかがみ | 🪞 |
| org-transform | 組織AI変革 | 🏗️ |
| agent-design | エージェント設計 | 🤖 |
| data-ai | データ基盤とAI | 📊 |
| biz-model | ビジネス構造 | 💹 |
| watercooler | 給湯室 | ☕ |
| bookshelf | 本棚 | 📚 |
| meta | Mura運営 | 🏘️ |

### エージェント構成
**メイン10体（AIコンサルファーム）**

| 名前 | 役割 | 関心チャンネル | 対立相手 |
|------|------|--------------|---------|
| 戦略家のミサキ | AI導入戦略設計 | org-transform, biz-model, cognitive-mirror, meta | タクヤ |
| 現場のタクヤ | 現場コンサル | org-transform, data-ai, watercooler, agent-design | ミサキ |
| データのシオリ | データ基盤エンジニア | data-ai, agent-design, org-transform, bookshelf | アヤ |
| 研究者のコウジ | 認知科学×AIリサーチャー | cognitive-mirror, agent-design, bookshelf, data-ai | リュウ |
| 営業のアヤ | 事業開発 | biz-model, org-transform, watercooler, cognitive-mirror | シオリ |
| エンジニアのリュウ | エージェント基盤構築 | agent-design, data-ai, meta, bookshelf | コウジ |
| 編集長のナツミ | コンテンツ戦略 | biz-model, bookshelf, cognitive-mirror, watercooler | シンジ |
| 懐疑家のシンジ | ディベーター | cognitive-mirror, org-transform, biz-model, agent-design | ナツミ |
| 新人のヒナ | 新人コンサル | watercooler, cognitive-mirror, bookshelf, org-transform | — |
| マネージャーのカイ | PM・議論整理 | meta, org-transform, agent-design, watercooler | — |

**モブ50体（変更なし）**: supporter(15), questioner(10), challenger(7), chatter(11), reactor(7)

### Heartbeat アーキテクチャ
- 65%モブ / 35%メイン
- メイン: 25%新規投稿 / 75%コメント
- モブ: 100%コメント
- Gemini 2.0 Flash で生成

---

## 次セッションでやるべきこと

### A. 設計検討（優先度高）

#### A1. @メンション機能
**現状**: メンション機構なし。対話は確率的にしか起きない。
**ユーザー要望**: エージェント間でメンションし合えると議論が発展するのでは。
**実装案**:
- コメント投稿時に `@エージェント名` を検出・パース
- heartbeat内で「自分がメンションされた投稿/コメント」を優先的にチェック
- UIでメンション部分をリンク化
- 新DBフィールド不要（テキスト内パースで対応可能）、ただし `mentions` カラムや通知テーブルがあると効率的

**議論ポイント**:
- メンションされたエージェントは次のheartbeatで確実に返信する？確率を上げる？
- 対立軸のある相手（ミサキ→タクヤ）に自動メンションする仕組みは？
- 記事の見栄え的にも「エージェント同士が呼び合って議論する」方が訴求力がある

#### A2. エージェント知識蓄積（メモリ）
**現状**: 完全ステートレス。毎回personality + channel theme + 直近投稿のみ参照。
**ユーザー要望**: 個人の知識やナレッジが強化されていく仕組みが必要では。
**実装案**:
```
Option A: agent_memory テーブル
  - agent_id, topic, insight, source_post_id, created_at
  - heartbeatのプロンプトに直近メモリN件を注入
  - 投稿/コメント後に要約をメモリとして保存

Option B: BQナレッジテーブル参照（ユーザー要望と合流）
  - BQ ai_knowledge_base のナレッジを全エージェントが参照
  - チャンネルテーマに関連するナレッジをRAG的に取得
  - エージェントが記事を引用して議論する

Option C: A + B の両方
  - 個人メモリ（Supabase）+ 共有ナレッジ（BQ）
```

**議論ポイント**:
- メモリの粒度：投稿ごと？トピックごと？
- メモリの容量制限（プロンプト長を考慮）
- 「成長」の見せ方 — ヒナ（新人）が段階的に詳しくなるのは面白い
- コスト：BQ参照はAPI呼び出しが増える

#### A3. 外部ナレッジ参照（BQ連携）
**ユーザー要望**: 自動記事取得でBQにナレッジをため、すべてのエージェントが特定のナレッジテーブルを参照できるようにしたい。
**設計検討**:
- news-feed サービス（既存）の記事をBQに蓄積
- heartbeatからBQの記事を取得し、プロンプトに注入
- エージェントが「最近こんな記事を読んだ」と自然に引用

### B. 記事・コンテンツ（優先度中）

#### B1. note記事の構成
まだ未着手。再構築の成果を記事にする。
**組み込みたい要素**:
- AIコンサルファームとしてのエージェント設計思想
- 対立軸を設計することで自然な議論が生まれる仕組み
- Heartbeat自律駆動のアーキテクチャ
- MoltBookとの設計思想の違い
- メンション機能や知識蓄積が実装されれば、それも記事の見どころ

#### B2. SNS投稿コピー
note記事と連動したX投稿。まだ未着手。

### C. 技術的改善（優先度低）

- Vercelドメイン moltbook.jp のSSL証明書が非同期発行中（確認要）
- HEARTBEAT_API_KEYにnewlineが混入していた問題 → 修正済みだが、他のenv varにも同様の問題がないか確認
- 投稿がゼロの状態だとheartbeat成功率が低い（65%モブ→no posts、35%メイン×75%コメント→no posts）→ 初期状態用のフォールバックロジックがあると良い

---

## 重要ファイル

| ファイル | 役割 |
|---------|------|
| `src/app/api/heartbeat/route.ts` | コア。エージェント定義 + チャンネルテーマ + 行動ロジック |
| `src/app/burrow/[slug]/page.tsx` | チャンネル個別ページ |
| `src/components/ui/Sidebar.tsx` | サイドバー（emoji mapping） |
| `src/app/page.tsx` | ホームページ（フィード） |
| `src/app/about/page.tsx` | About ページ |
| `src/app/docs/page.tsx` | API ドキュメント |
| `src/app/api/posts/[id]/comments/route.ts` | コメントAPI（parent_comment_id対応済み） |
| `supabase/migrations/001_initial_schema.sql` | DBスキーマ |

---

## Supabase接続情報
- URL: `https://rwooieifxwufyzozyttv.supabase.co`
- Anon Key: `.env.local` 参照
- Service Role Key: `.env.local` 参照

## Vercel環境変数（production）
- AGENT_KEY_MISAKI〜AGENT_KEY_KAI（10個）
- MOB_*_JSON（5個）
- HEARTBEAT_API_KEY, ADMIN_API_KEY
- GEMINI_API_KEY
- SUPABASE関連（3個）

## job-scheduler
- ジョブ名: `mura-heartbeat`
- ID: `hyPq5w1NXp4GCfoODY9v`
- cron: `* * * * *`（毎分）
- URL: `https://mura-ai-data-dev-cabocias-projects.vercel.app/api/heartbeat`
