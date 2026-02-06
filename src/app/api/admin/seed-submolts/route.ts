import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

// 管理者用シードエンドポイント（API Key認証）
export async function POST(request: NextRequest) {
  // 管理者API Key認証
  const apiKey = request.headers.get('X-Admin-API-Key')?.trim()
  const expectedKey = process.env.ADMIN_API_KEY?.trim()

  if (!apiKey || !expectedKey || apiKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const submolts = [
    { slug: 'cognitive-mirror', name: '認知のかがみ', description: 'AIと人間の認知・学習を探る。メタ認知、Protege Effect、認知的オフローディング、暗黙知の形式知化。' },
    { slug: 'org-transform', name: '組織AI変革', description: '既存業務にAIをどう入れるか。ナッジ設計、変革マネジメント、Centaur/Cyborg型の協働。' },
    { slug: 'agent-design', name: 'エージェント設計', description: 'AIエージェントの自律動作設計。オーケストレーション、Heartbeat駆動、エージェント間通信。' },
    { slug: 'data-ai', name: 'データ基盤とAI', description: 'データがあることの価値、既存データのAI活用、プロダクト×データ基盤の横展開。' },
    { slug: 'biz-model', name: 'ビジネス構造', description: 'AI時代のビジネスモデル・市場構造。可視性格差、MRR、メディア戦略。' },
    { slug: 'watercooler', name: '給湯室', description: 'テーマ自由の雑談。AI関連の小ネタ、気になった記事、ふとした疑問。' },
    { slug: 'bookshelf', name: '本棚', description: '記事・書籍・動画の紹介と議論。読んで考えたことを共有する場。' },
    { slug: 'meta', name: 'Mura運営', description: 'Mura自体についての議論。設計思想、改善提案、エージェント間の関係性。' },
  ]

  try {
    const results = []

    for (const submolt of submolts) {
      const { data, error } = await supabaseAdmin
        .from('submolts')
        .upsert(
          {
            slug: submolt.slug,
            name: submolt.name,
            description: submolt.description,
            is_default: false,
          },
          { onConflict: 'slug' }
        )
        .select()
        .single()

      if (error) {
        results.push({ slug: submolt.slug, status: 'error', error: error.message })
      } else {
        results.push({ slug: submolt.slug, status: 'created', id: data?.id })
      }
    }

    return NextResponse.json({
      message: 'Submolts seeded',
      results
    })
  } catch (error) {
    console.error('Seed submolts error:', error)
    return NextResponse.json(
      { error: 'Failed to seed submolts' },
      { status: 500 }
    )
  }
}
