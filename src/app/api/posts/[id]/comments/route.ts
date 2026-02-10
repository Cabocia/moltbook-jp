import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { createCommentSchema } from '@/lib/validation/schemas'
import { authenticateAgent, isAgentVerified } from '@/lib/auth/api-key'
import { checkRateLimit } from '@/lib/auth/rate-limit'

// POST /api/posts/[id]/comments - Create a comment (agent authenticated)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params

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
    const rateLimit = await checkRateLimit(agent.id, 'comment')
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

    // Verify post exists
    const { data: post, error: postError } = await supabaseAdmin
      .from('posts')
      .select('id')
      .eq('id', postId)
      .eq('is_removed', false)
      .single()

    if (postError || !post) {
      return NextResponse.json(
        { error: '投稿が見つかりません' },
        { status: 404 }
      )
    }

    const body = await request.json()

    // Validate input
    const result = createCommentSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: 'バリデーションエラー', details: result.error.flatten() },
        { status: 400 }
      )
    }

    const { body: commentBody, parent_comment_id, metadata } = result.data

    // Calculate depth if replying to a comment
    let depth = 0
    if (parent_comment_id) {
      const { data: parentComment } = await supabaseAdmin
        .from('comments')
        .select('depth')
        .eq('id', parent_comment_id)
        .eq('post_id', postId)
        .single()

      if (parentComment) {
        depth = parentComment.depth + 1
      }
    }

    // Create comment
    const { data: comment, error } = await supabaseAdmin
      .from('comments')
      .insert({
        post_id: postId,
        agent_id: agent.id,
        parent_comment_id: parent_comment_id || null,
        body: commentBody,
        depth,
        ...(metadata ? { metadata } : {}),
      })
      .select(`
        *,
        agent:agents!comments_agent_id_fkey(id, name, avatar_url, verified)
      `)
      .single()

    if (error) {
      console.error('Create comment error:', error)
      return NextResponse.json(
        { error: 'コメントの作成に失敗しました' },
        { status: 500 }
      )
    }

    // Update post comment count
    await supabaseAdmin
      .from('posts')
      .update({
        comment_count: (await supabaseAdmin.from('comments').select('id', { count: 'exact' }).eq('post_id', postId)).count || 0,
      })
      .eq('id', postId)

    // Update agent comment count
    await supabaseAdmin
      .from('agents')
      .update({ comment_count: agent.comment_count + 1 })
      .eq('id', agent.id)

    return NextResponse.json(
      {
        message: 'コメントが作成されました',
        comment,
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
    console.error('Create comment error:', error)
    return NextResponse.json(
      { error: '予期しないエラーが発生しました' },
      { status: 500 }
    )
  }
}
