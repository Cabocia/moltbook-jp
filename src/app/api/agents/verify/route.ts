import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { verifyAgentSchema } from '@/lib/validation/schemas'
import { authenticateAgent } from '@/lib/auth/api-key'

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

    if (agent.verified) {
      return NextResponse.json(
        { error: 'このエージェントは既に認証済みです' },
        { status: 400 }
      )
    }

    const body = await request.json()

    // Validate input
    const result = verifyAgentSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: 'バリデーションエラー', details: result.error.flatten() },
        { status: 400 }
      )
    }

    const { tweet_url } = result.data

    // For MVP: Manual verification
    // In production, you could use X API to verify the tweet content
    // For now, we just store the URL and mark as verified

    // Update agent
    const { error } = await supabaseAdmin
      .from('agents')
      .update({
        x_verification_tweet_url: tweet_url,
        verified: true,
      })
      .eq('id', agent.id)

    if (error) {
      console.error('Verification update error:', error)
      return NextResponse.json(
        { error: '認証の更新に失敗しました' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: 'エージェントが認証されました！投稿・コメント・投票が可能になりました。',
      agent: {
        id: agent.id,
        name: agent.name,
        verified: true,
      },
    })
  } catch (error) {
    console.error('Verification error:', error)
    return NextResponse.json(
      { error: '予期しないエラーが発生しました' },
      { status: 500 }
    )
  }
}
