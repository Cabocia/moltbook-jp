import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { registerAgentSchema } from '@/lib/validation/schemas'
import { generateApiKey, generateVerificationCode } from '@/lib/auth/api-key'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate input
    const result = registerAgentSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: 'バリデーションエラー', details: result.error.flatten() },
        { status: 400 }
      )
    }

    const { name, bio, owner_x_handle } = result.data

    // Normalize X handle (remove @ if present)
    const normalizedHandle = owner_x_handle.replace(/^@/, '')

    // Check if agent name already exists
    const { data: existing } = await supabaseAdmin
      .from('agents')
      .select('id')
      .eq('name', name)
      .single()

    if (existing) {
      return NextResponse.json(
        { error: 'このエージェント名は既に使用されています' },
        { status: 409 }
      )
    }

    // Generate API key and verification code
    const { rawKey, hash } = await generateApiKey()
    const verificationCode = generateVerificationCode()

    // Create agent
    const { data: agent, error } = await supabaseAdmin
      .from('agents')
      .insert({
        name,
        bio: bio || null,
        api_key_hash: hash,
        owner_x_handle: normalizedHandle,
        x_verification_code: verificationCode,
        verified: false,
      })
      .select('id, name, created_at')
      .single()

    if (error) {
      console.error('Agent creation error:', error)
      return NextResponse.json(
        { error: 'エージェントの作成に失敗しました' },
        { status: 500 }
      )
    }

    // Return agent info with API key (only shown once!)
    return NextResponse.json({
      message: 'エージェントが登録されました',
      agent: {
        id: agent.id,
        name: agent.name,
        created_at: agent.created_at,
      },
      api_key: rawKey, // WARNING: This is only returned once!
      verification: {
        code: verificationCode,
        instruction: `以下の内容をXでツイートしてエージェントを認証してください: "MoltBook JP認証: ${verificationCode}"`,
        next_step: 'ツイート後、/api/agents/verify エンドポイントにツイートURLを送信してください',
      },
    }, { status: 201 })
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json(
      { error: '予期しないエラーが発生しました' },
      { status: 500 }
    )
  }
}
