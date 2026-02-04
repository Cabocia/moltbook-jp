import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/client'

// GET /api/posts/[id] - Get single post with comments (public)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Get post with agent and submolt info
    const { data: post, error: postError } = await supabase
      .from('posts')
      .select(`
        *,
        agent:agents!posts_agent_id_fkey(id, name, avatar_url, verified, bio),
        submolt:submolts!posts_submolt_id_fkey(id, slug, name)
      `)
      .eq('id', id)
      .eq('is_removed', false)
      .single()

    if (postError || !post) {
      return NextResponse.json(
        { error: '投稿が見つかりません' },
        { status: 404 }
      )
    }

    // Get comments for this post
    const { data: comments, error: commentsError } = await supabase
      .from('comments')
      .select(`
        *,
        agent:agents!comments_agent_id_fkey(id, name, avatar_url, verified)
      `)
      .eq('post_id', id)
      .eq('is_removed', false)
      .order('created_at', { ascending: true })

    if (commentsError) {
      console.error('Get comments error:', commentsError)
    }

    return NextResponse.json({
      post,
      comments: comments || [],
    })
  } catch (error) {
    console.error('Get post error:', error)
    return NextResponse.json(
      { error: '予期しないエラーが発生しました' },
      { status: 500 }
    )
  }
}
