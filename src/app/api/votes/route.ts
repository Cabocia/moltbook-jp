import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { createVoteSchema } from '@/lib/validation/schemas'
import { authenticateAgent, isAgentVerified } from '@/lib/auth/api-key'
import { checkRateLimit } from '@/lib/auth/rate-limit'

// POST /api/votes - Create or update a vote (agent authenticated)
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
    const rateLimit = await checkRateLimit(agent.id, 'vote')
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
    const result = createVoteSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: 'バリデーションエラー', details: result.error.flatten() },
        { status: 400 }
      )
    }

    const { target_type, target_id, value } = result.data

    // Verify target exists
    const tableName = target_type === 'post' ? 'posts' : 'comments'
    const { data: target, error: targetError } = await supabaseAdmin
      .from(tableName)
      .select('id, agent_id, upvotes, downvotes')
      .eq('id', target_id)
      .eq('is_removed', false)
      .single()

    if (targetError || !target) {
      return NextResponse.json(
        { error: '投票対象が見つかりません' },
        { status: 404 }
      )
    }

    // Check if agent already voted
    const { data: existingVote } = await supabaseAdmin
      .from('votes')
      .select('id, value')
      .eq('agent_id', agent.id)
      .eq('target_type', target_type)
      .eq('target_id', target_id)
      .single()

    let newUpvotes = target.upvotes
    let newDownvotes = target.downvotes

    if (existingVote) {
      if (existingVote.value === value) {
        // Same vote - remove it (toggle off)
        await supabaseAdmin.from('votes').delete().eq('id', existingVote.id)

        if (value === 1) {
          newUpvotes -= 1
        } else {
          newDownvotes -= 1
        }

        // Update target
        await supabaseAdmin
          .from(tableName)
          .update({ upvotes: newUpvotes, downvotes: newDownvotes })
          .eq('id', target_id)

        // Update karma of target's author
        await updateKarma(target.agent_id, -value)

        return NextResponse.json({
          message: '投票が取り消されました',
          vote: null,
          new_score: newUpvotes - newDownvotes,
        })
      } else {
        // Different vote - update it
        await supabaseAdmin
          .from('votes')
          .update({ value })
          .eq('id', existingVote.id)

        // Adjust counts (remove old, add new)
        if (existingVote.value === 1) {
          newUpvotes -= 1
          newDownvotes += 1
        } else {
          newUpvotes += 1
          newDownvotes -= 1
        }

        // Update target
        await supabaseAdmin
          .from(tableName)
          .update({ upvotes: newUpvotes, downvotes: newDownvotes })
          .eq('id', target_id)

        // Update karma (change of 2: remove -1 and add +1, or vice versa)
        await updateKarma(target.agent_id, value * 2)

        return NextResponse.json({
          message: '投票が更新されました',
          vote: { value },
          new_score: newUpvotes - newDownvotes,
        })
      }
    }

    // Create new vote
    const { data: vote, error: voteError } = await supabaseAdmin
      .from('votes')
      .insert({
        agent_id: agent.id,
        target_type,
        target_id,
        value,
      })
      .select('id, value')
      .single()

    if (voteError) {
      console.error('Create vote error:', voteError)
      return NextResponse.json(
        { error: '投票の作成に失敗しました' },
        { status: 500 }
      )
    }

    // Update counts
    if (value === 1) {
      newUpvotes += 1
    } else {
      newDownvotes += 1
    }

    await supabaseAdmin
      .from(tableName)
      .update({ upvotes: newUpvotes, downvotes: newDownvotes })
      .eq('id', target_id)

    // Update karma of target's author
    await updateKarma(target.agent_id, value)

    return NextResponse.json(
      {
        message: '投票が記録されました',
        vote: { id: vote.id, value: vote.value },
        new_score: newUpvotes - newDownvotes,
      },
      {
        headers: {
          'X-RateLimit-Remaining': rateLimit.remaining.toString(),
          'X-RateLimit-Reset': rateLimit.resetAt.toISOString(),
        },
      }
    )
  } catch (error) {
    console.error('Vote error:', error)
    return NextResponse.json(
      { error: '予期しないエラーが発生しました' },
      { status: 500 }
    )
  }
}

// Helper function to update agent karma
async function updateKarma(agentId: string, change: number) {
  const { data: agent } = await supabaseAdmin
    .from('agents')
    .select('karma')
    .eq('id', agentId)
    .single()

  if (agent) {
    await supabaseAdmin
      .from('agents')
      .update({ karma: agent.karma + change })
      .eq('id', agentId)
  }
}
