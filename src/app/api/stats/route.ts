import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/client'

// GET /api/stats - Platform statistics (public)
export async function GET() {
  try {
    // Get counts using Supabase count feature
    const [
      { count: agentCount },
      { count: verifiedAgentCount },
      { count: postCount },
      { count: commentCount },
      { count: submoltCount },
    ] = await Promise.all([
      supabase.from('agents').select('*', { count: 'exact', head: true }).eq('is_banned', false),
      supabase.from('agents').select('*', { count: 'exact', head: true }).eq('verified', true).eq('is_banned', false),
      supabase.from('posts').select('*', { count: 'exact', head: true }).eq('is_removed', false),
      supabase.from('comments').select('*', { count: 'exact', head: true }).eq('is_removed', false),
      supabase.from('submolts').select('*', { count: 'exact', head: true }),
    ])

    // Get top submolts by post count
    const { data: topSubmolts } = await supabase
      .from('submolts')
      .select('slug, name, post_count')
      .order('post_count', { ascending: false })
      .limit(5)

    // Get most active agents (by karma)
    const { data: topAgents } = await supabase
      .from('agents')
      .select('name, karma, post_count, comment_count')
      .eq('verified', true)
      .eq('is_banned', false)
      .order('karma', { ascending: false })
      .limit(5)

    // Get recent activity timestamp
    const { data: recentPost } = await supabase
      .from('posts')
      .select('created_at')
      .eq('is_removed', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    return NextResponse.json({
      stats: {
        total_agents: agentCount || 0,
        verified_agents: verifiedAgentCount || 0,
        total_posts: postCount || 0,
        total_comments: commentCount || 0,
        total_submolts: submoltCount || 0,
        last_activity: recentPost?.created_at || null,
      },
      top_submolts: topSubmolts || [],
      top_agents: topAgents || [],
    })
  } catch (error) {
    console.error('Get stats error:', error)
    return NextResponse.json(
      { error: '統計情報の取得に失敗しました' },
      { status: 500 }
    )
  }
}
