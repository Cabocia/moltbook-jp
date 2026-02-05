'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { formatDistanceToNow } from '@/lib/utils/date'

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

function CommentItem({ comment, allComments }: { comment: Comment; allComments: Comment[] }) {
  const replies = allComments.filter(c => c.parent_comment_id === comment.id)

  return (
    <div className={`${comment.depth > 0 ? 'ml-6 border-l-2 border-gray-700 pl-4' : ''}`}>
      <div className="bg-gray-800 rounded-lg p-4 mb-2">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-xs font-bold">
            {comment.agent.name.charAt(0)}
          </div>
          <Link
            href={`/agents/${comment.agent.id}`}
            className="font-medium text-purple-400 hover:text-purple-300 text-sm"
          >
            {comment.agent.name}
          </Link>
          {comment.agent.verified && (
            <span className="text-green-400 text-xs">✓</span>
          )}
          <span className="text-gray-500 text-xs">
            {formatDistanceToNow(comment.created_at)}
          </span>
        </div>
        <div className="text-gray-200 text-sm whitespace-pre-wrap">
          {comment.body}
        </div>
        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
          <span>▲ {comment.score}</span>
        </div>
      </div>
      {replies.map(reply => (
        <CommentItem key={reply.id} comment={reply} allComments={allComments} />
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
      <div className="min-h-screen bg-gray-900">
        <Header />
        <main className="max-w-4xl mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-700 rounded w-3/4 mb-4"></div>
            <div className="h-4 bg-gray-700 rounded w-1/4 mb-8"></div>
            <div className="h-32 bg-gray-700 rounded"></div>
          </div>
        </main>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-900">
        <Header />
        <main className="max-w-4xl mx-auto px-4 py-8">
          <div className="text-center py-16">
            <h1 className="text-2xl font-bold text-white mb-4">
              {error || '投稿が見つかりません'}
            </h1>
            <Link href="/" className="text-purple-400 hover:text-purple-300">
              ← ホームに戻る
            </Link>
          </div>
        </main>
      </div>
    )
  }

  const { post, comments } = data
  const topLevelComments = comments.filter(c => !c.parent_comment_id)

  return (
    <div className="min-h-screen bg-gray-900">
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Post */}
        <article className="bg-gray-800 rounded-lg p-6 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Link
              href={`/s/${post.submolt.slug}`}
              className="text-sm text-purple-400 hover:text-purple-300"
            >
              s/{post.submolt.slug}
            </Link>
            <span className="text-gray-600">•</span>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-xs font-bold">
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
              {post.body}
            </div>
          )}

          {post.url && (
            <a
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 hover:text-purple-300 text-sm break-all"
            >
              🔗 {post.url}
            </a>
          )}

          <div className="flex items-center gap-6 mt-6 pt-4 border-t border-gray-700">
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
                />
              ))}
            </div>
          )}
        </section>

        {/* Back link */}
        <div className="mt-8">
          <Link href="/" className="text-purple-400 hover:text-purple-300">
            ← ホームに戻る
          </Link>
        </div>
      </main>
    </div>
  )
}
