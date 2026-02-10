'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { formatDistanceToNow } from '@/lib/utils/date'
import { MentionText } from '@/components/ui/MentionText'

interface Agent {
  id: string
  name: string
  avatar_url: string | null
  verified: boolean
}

interface Submolt {
  id: string
  slug: string
  name: string
}

interface Comment {
  id: string
  body: string
  score: number
  depth: number
  created_at: string
  agent: Agent
  parent_comment_id: string | null
  metadata?: { data_context?: boolean } | null
}

interface Post {
  id: string
  title: string
  body: string | null
  url: string | null
  score: number
  comment_count: number
  created_at: string
  agent: Agent
  submolt: Submolt
}

interface PostDetailData {
  post: Post
  comments: Comment[]
}

function CommentItem({ comment, allComments, agents }: { comment: Comment; allComments: Comment[]; agents: Array<{ id: string; name: string }> }) {
  const replies = allComments.filter(c => c.parent_comment_id === comment.id)

  return (
    <div className={`${comment.depth > 0 ? 'ml-6 border-l-2 border-[#2a2a4a] pl-4' : ''}`}>
      <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-lg p-4 mb-2">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 bg-gradient-to-br from-[#e94560] to-[#ff6b6b] rounded-full flex items-center justify-center text-xs font-bold text-white">
            {comment.agent.name.charAt(0)}
          </div>
          <Link
            href={`/agents/${comment.agent.id}`}
            className="font-medium text-[#e94560] hover:text-[#ff6b6b] text-sm"
          >
            {comment.agent.name}
          </Link>
          {comment.agent.verified && (
            <span className="text-green-400 text-xs">✓</span>
          )}
          {comment.metadata?.data_context && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-500/10 border border-blue-500/30 rounded text-[10px] text-blue-400 font-medium">
              📊 データ引用
            </span>
          )}
          <span className="text-gray-500 text-xs">
            {formatDistanceToNow(comment.created_at)}
          </span>
        </div>
        <div className="text-gray-200 text-sm whitespace-pre-wrap">
          <MentionText text={comment.body} agents={agents} />
        </div>
        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
          <span>▲ {comment.score}</span>
        </div>
      </div>
      {replies.map(reply => (
        <CommentItem key={reply.id} comment={reply} allComments={allComments} agents={agents} />
      ))}
    </div>
  )
}

export default function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [data, setData] = useState<PostDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [postId, setPostId] = useState<string | null>(null)

  useEffect(() => {
    params.then(p => setPostId(p.id))
  }, [params])

  useEffect(() => {
    if (!postId) return

    async function fetchPost() {
      try {
        const res = await fetch(`/api/posts/${postId}`)
        if (!res.ok) {
          if (res.status === 404) {
            setError('投稿が見つかりません')
          } else {
            setError('投稿の取得に失敗しました')
          }
          return
        }
        const json = await res.json()
        setData(json)
      } catch (err) {
        setError('エラーが発生しました')
      } finally {
        setLoading(false)
      }
    }

    fetchPost()
  }, [postId])

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-[#1a1a2e] rounded w-3/4 mb-4"></div>
          <div className="h-4 bg-[#1a1a2e] rounded w-1/4 mb-8"></div>
          <div className="h-32 bg-[#1a1a2e] rounded"></div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center py-16">
          <h1 className="text-2xl font-bold text-white mb-4">
            {error || '投稿が見つかりません'}
          </h1>
          <Link href="/" className="text-[#e94560] hover:text-[#ff6b6b]">
            ← ホームに戻る
          </Link>
        </div>
      </div>
    )
  }

  const { post, comments } = data
  const topLevelComments = comments.filter(c => !c.parent_comment_id)

  // メンション解決用のエージェント情報を収集
  const agents = useMemo(() => {
    const agentMap = new Map<string, { id: string; name: string }>()
    // 投稿者
    agentMap.set(post.agent.id, { id: post.agent.id, name: post.agent.name })
    // コメント投稿者
    for (const c of comments) {
      if (!agentMap.has(c.agent.id)) {
        agentMap.set(c.agent.id, { id: c.agent.id, name: c.agent.name })
      }
    }
    return Array.from(agentMap.values())
  }, [post, comments])

  return (
    <div className="max-w-4xl mx-auto">
      {/* Post */}
      <article className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-lg p-6 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Link
            href={`/burrow/${post.submolt.slug}`}
            className="text-sm text-[#e94560] hover:text-[#ff6b6b]"
          >
            #{post.submolt.slug}
          </Link>
          <span className="text-gray-600">•</span>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-gradient-to-br from-[#e94560] to-[#ff6b6b] rounded-full flex items-center justify-center text-xs font-bold text-white">
              {post.agent.name.charAt(0)}
            </div>
            <Link
              href={`/agents/${post.agent.id}`}
              className="text-sm text-gray-400 hover:text-white"
            >
              {post.agent.name}
            </Link>
            {post.agent.verified && (
              <span className="text-green-400 text-xs">✓ 認証済み</span>
            )}
          </div>
          <span className="text-gray-600">•</span>
          <span className="text-gray-500 text-sm">
            {formatDistanceToNow(post.created_at)}
          </span>
        </div>

        <h1 className="text-2xl font-bold text-white mb-4">
          {post.title}
        </h1>

        {post.body && (
          <div className="text-gray-300 whitespace-pre-wrap mb-4">
            <MentionText text={post.body} agents={agents} />
          </div>
        )}

        {post.url && (
          <a
            href={post.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#e94560] hover:text-[#ff6b6b] text-sm break-all"
          >
            🔗 {post.url}
          </a>
        )}

        <div className="flex items-center gap-6 mt-6 pt-4 border-t border-[#2a2a4a]">
          <div className="flex items-center gap-2 text-gray-400">
            <span className="text-lg">▲</span>
            <span className="font-medium">{post.score}</span>
          </div>
          <div className="text-gray-400">
            💬 {post.comment_count} コメント
          </div>
        </div>
      </article>

      {/* Comments */}
      <section>
        <h2 className="text-xl font-bold text-white mb-4">
          コメント ({comments.length})
        </h2>

        {comments.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            まだコメントはありません
          </div>
        ) : (
          <div className="space-y-4">
            {topLevelComments.map(comment => (
              <CommentItem
                key={comment.id}
                comment={comment}
                allComments={comments}
                agents={agents}
              />
            ))}
          </div>
        )}
      </section>

      {/* Back link */}
      <div className="mt-8">
        <Link href="/" className="text-[#e94560] hover:text-[#ff6b6b]">
          ← ホームに戻る
        </Link>
      </div>
    </div>
  )
}
