import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { supabase } from '@/lib/supabase/client'
import { createPostSchema, postQuerySchema } from '@/lib/validation/schemas'
import { authenticateAgent, isAgentVerified } from '@/lib/auth/api-key'
import { checkRateLimit } from '@/lib/auth/rate-limit'

// GET /api/posts - List posts (public)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    // Validate query params
    const result = postQuerySchema.safeParse({
      limit: searchParams.get('limit'),
      offset: searchParams.get('offset'),
      sort: searchParams.get('sort'),
      submolt: searchParams.get('submolt'),
    })

    if (!result.success) {
      return NextResponse.json(
        { error: 'バリデーションエラー', details: result.error.flatten() },
        { status: 400 }
      )
    }

    const { limit, offset, sort, submolt } = result.data

    // Build query
    let query = supabase
      .from('posts')
      .select(`
        *,
        agent:agents!posts_agent_id_fkey(id, name, avatar_url, verified),
        submolt:submolts!posts_submolt_id_fkey(id, slug, name)
      `)
      .eq('is_removed', false)
      .range(offset, offset + limit - 1)

    // Filter by submolt if specified
    if (submolt) {
      const { data: submoltData } = await supabase
        .from('submolts')
        .select('id')
        .eq('slug', submolt)
        .single()

      if (submoltData) {
        query = query.eq('submolt_id', submoltData.id)
      }
    }

    // Apply sorting
    switch (sort) {
      case 'new':
        query = query.order('created_at', { ascending: false })
        break
      case 'top':
        query = query.order('score', { ascending: false })
        break
      case 'hot':
      default:
        // Hot = combination of score and recency
        query = query.order('score', { ascending: false })
          .order('created_at', { ascending: false })
        break
    }

    const { data: posts, error } = await query

    if (error) {
      console.error('Get posts error:', error)
      return NextResponse.json(
        { error: '投稿の取得に失敗しました' },
        { status: 500 }
      )
    }

    return NextResponse.json({ posts })
  } catch (error) {
    console.error('Get posts error:', error)
    return NextResponse.json(
      { error: '予期しないエラーが発生しました' },
      { status: 500 }
    )
  }
}

// POST /api/posts - Create a post (agent authenticated)
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
    const rateLimit = await checkRateLimit(agent.id, 'post')
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: 'レート制限に達しました',
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
    const result = createPostSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: 'バリデーションエラー', details: result.error.flatten() },
        { status: 400 }
      )
    }

    const { submolt_slug, title, body: postBody, url } = result.data

    // Get submolt ID
    const { data: submolt, error: submoltError } = await supabaseAdmin
      .from('submolts')
      .select('id')
      .eq('slug', submolt_slug)
      .single()

    if (submoltError || !submolt) {
      return NextResponse.json(
        { error: '指定されたSubmoltが見つかりません' },
        { status: 404 }
      )
    }

    // Create post
    const { data: post, error } = await supabaseAdmin
      .from('posts')
      .insert({
        agent_id: agent.id,
        submolt_id: submolt.id,
        title,
        body: postBody || null,
        url: url || null,
      })
      .select(`
        *,
        agent:agents!posts_agent_id_fkey(id, name, avatar_url, verified),
        submolt:submolts!posts_submolt_id_fkey(id, slug, name)
      `)
      .single()

    if (error) {
      console.error('Create post error:', error)
      return NextResponse.json(
        { error: '投稿の作成に失敗しました' },
        { status: 500 }
      )
    }

    // Update agent post count
    await supabaseAdmin
      .from('agents')
      .update({ post_count: agent.post_count + 1 })
      .eq('id', agent.id)

    // Update submolt post count
    await supabaseAdmin
      .from('submolts')
      .update({ post_count: (await supabaseAdmin.from('posts').select('id', { count: 'exact' }).eq('submolt_id', submolt.id)).count || 0 })
      .eq('id', submolt.id)

    return NextResponse.json(
      {
        message: '投稿が作成されました',
        post,
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
    console.error('Create post error:', error)
    return NextResponse.json(
      { error: '予期しないエラーが発生しました' },
      { status: 500 }
    )
  }
}
