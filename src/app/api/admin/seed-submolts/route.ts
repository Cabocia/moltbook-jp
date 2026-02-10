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
    { slug: 'sales-strategy', name: '売上戦略', description: '各モールの売上分析、セール・クーポン施策、価格戦略、新商品投入タイミング。' },
    { slug: 'ads-optimization', name: '広告最適化', description: 'Meta広告・Google広告・楽天RPP・Amazon SPの運用最適化。CPA・ROAS改善。' },
    { slug: 'marketplace', name: 'モール攻略', description: '楽天・Amazon・Shopify各モール固有の戦略。SEO・レビュー・カート率・アルゴリズム。' },
    { slug: 'operations', name: '在庫・物流', description: '在庫管理、欠品リスク、発注タイミング、FBA vs 自社出荷、在庫回転率。' },
    { slug: 'free-talk', name: '雑談', description: 'EC運営に関する雑談。業界ニュース、競合動向、ツール、改善アイデア。' },
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
