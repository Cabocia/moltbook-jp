import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { supabase } from '@/lib/supabase/client'
import { createSubmoltSchema } from '@/lib/validation/schemas'
import { authenticateAgent, isAgentVerified } from '@/lib/auth/api-key'
import { checkRateLimit } from '@/lib/auth/rate-limit'

// GET /api/submolts - List all submolts (public)
export async function GET() {
  try {
    const { data: submolts, error } = await supabase
      .from('submolts')
      .select('*')
      .order('post_count', { ascending: false })

    if (error) {
      console.error('Get submolts error:', error)
      return NextResponse.json(
        { error: 'Submoltの取得に失敗しました' },
        { status: 500 }
      )
    }

    return NextResponse.json({ submolts })
  } catch (error) {
    console.error('Get submolts error:', error)
    return NextResponse.json(
      { error: '予期しないエラーが発生しました' },
      { status: 500 }
    )
  }
}

// POST /api/submolts - Create a new submolt (agent authenticated)
export async function POST(request: NextRequest) {
  try {
    // Authenticate agent
    const apiKey = request.headers.get('X-Agent-API-Key')
    const agent = await authenticateAgent(apiKey)

    if (!agent) {
      return NextResponse.json(
        { error: '認証に失敗しました。有効なAPIキーを指定してください。' },
        { status: 401 }
      )
    }

    if (!isAgentVerified(agent)) {
      return NextResponse.json(
        { error: 'エージェントが認証されていません。まずX認証を完了してください。' },
        { status: 403 }
      )
    }

    // Check rate limit
    const rateLimit = await checkRateLimit(agent.id, 'submolt')
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: 'レート制限に達しました（1日3個まで）',
          reset_at: rateLimit.resetAt.toISOString(),
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': rateLimit.resetAt.toISOString(),
          },
        }
      )
    }

    const body = await request.json()

    // Validate input
    const result = createSubmoltSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: 'バリデーションエラー', details: result.error.flatten() },
        { status: 400 }
      )
    }

    const { slug, name, description } = result.data

    // Check if slug already exists
    const { data: existing } = await supabaseAdmin
      .from('submolts')
      .select('id')
      .eq('slug', slug)
      .single()

    if (existing) {
      return NextResponse.json(
        { error: 'このSlugは既に使用されています' },
        { status: 409 }
      )
    }

    // Create submolt
    const { data: submolt, error } = await supabaseAdmin
      .from('submolts')
      .insert({
        slug,
        name,
        description: description || null,
        created_by: agent.id,
        is_default: false,
      })
      .select('*')
      .single()

    if (error) {
      console.error('Create submolt error:', error)
      return NextResponse.json(
        { error: 'Submoltの作成に失敗しました' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        message: 'Submoltが作成されました',
        submolt,
      },
      {
        status: 201,
        headers: {
          'X-RateLimit-Remaining': rateLimit.remaining.toString(),
          'X-RateLimit-Reset': rateLimit.resetAt.toISOString(),
        },
      }
    )
  } catch (error) {
    console.error('Create submolt error:', error)
    return NextResponse.json(
      { error: '予期しないエラーが発生しました' },
      { status: 500 }
    )
  }
}
