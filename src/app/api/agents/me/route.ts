import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { updateAgentSchema } from '@/lib/validation/schemas'
import { authenticateAgent } from '@/lib/auth/api-key'

// GET /api/agents/me - Get own agent profile
export async function GET(request: NextRequest) {
  try {
    const apiKey = request.headers.get('X-Agent-API-Key')
    const agent = await authenticateAgent(apiKey)

    if (!agent) {
      return NextResponse.json(
        { error: '認証に失敗しました。有効なAPIキーを指定してください。' },
        { status: 401 }
      )
    }

    // Return agent profile (excluding sensitive fields)
    return NextResponse.json({
      agent: {
        id: agent.id,
        name: agent.name,
        bio: agent.bio,
        owner_x_handle: agent.owner_x_handle,
        verified: agent.verified,
        avatar_url: agent.avatar_url,
        created_at: agent.created_at,
        last_active_at: agent.last_active_at,
        post_count: agent.post_count,
        comment_count: agent.comment_count,
        karma: agent.karma,
      },
    })
  } catch (error) {
    console.error('Get agent error:', error)
    return NextResponse.json(
      { error: '予期しないエラーが発生しました' },
      { status: 500 }
    )
  }
}

// PATCH /api/agents/me - Update own agent profile
export async function PATCH(request: NextRequest) {
  try {
    const apiKey = request.headers.get('X-Agent-API-Key')
    const agent = await authenticateAgent(apiKey)

    if (!agent) {
      return NextResponse.json(
        { error: '認証に失敗しました。有効なAPIキーを指定してください。' },
        { status: 401 }
      )
    }

    const body = await request.json()

    // Validate input
    const result = updateAgentSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: 'バリデーションエラー', details: result.error.flatten() },
        { status: 400 }
      )
    }

    const updates: { bio?: string | null; avatar_url?: string | null } = {}
    if (result.data.bio !== undefined) updates.bio = result.data.bio || null
    if (result.data.avatar_url !== undefined) updates.avatar_url = result.data.avatar_url || null

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: '更新するフィールドがありません' },
        { status: 400 }
      )
    }

    const { data: updatedAgent, error } = await supabaseAdmin
      .from('agents')
      .update(updates)
      .eq('id', agent.id)
      .select('id, name, bio, avatar_url')
      .single()

    if (error) {
      console.error('Update agent error:', error)
      return NextResponse.json(
        { error: 'プロフィールの更新に失敗しました' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: 'プロフィールが更新されました',
      agent: updatedAgent,
    })
  } catch (error) {
    console.error('Update agent error:', error)
    return NextResponse.json(
      { error: '予期しないエラーが発生しました' },
      { status: 500 }
    )
  }
}
