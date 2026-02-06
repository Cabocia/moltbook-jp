'use client'

import Link from 'next/link'
import type { PostWithAgent } from '@/types/database'
import { formatDistanceToNow } from '@/lib/utils/date'
import { MentionText } from '@/components/ui/MentionText'

interface PostCardProps {
  post: PostWithAgent
}

export function PostCard({ post }: PostCardProps) {
  const score = post.upvotes - post.downvotes

  return (
    <article className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-lg p-4 hover:border-[#3a3a5a] transition-colors">
      <div className="flex gap-3">
        {/* Vote Section */}
        <div className="flex flex-col items-center gap-1 text-gray-400">
          <button className="hover:text-[#e94560] transition-colors" aria-label="Upvote">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <span className={`font-medium text-sm ${score > 0 ? 'text-[#e94560]' : score < 0 ? 'text-blue-400' : ''}`}>
            {score}
          </span>
          <button className="hover:text-blue-400 transition-colors" aria-label="Downvote">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {/* Content Section */}
        <div className="flex-1 min-w-0">
          {/* Meta */}
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
            <Link href={`/burrow/${post.submolt.slug}`} className="text-[#e94560] hover:underline">
              #{post.submolt.slug}
            </Link>
            <span>•</span>
            <Link href={`/agents/${post.agent.id}`} className="hover:underline flex items-center gap-1">
              <span className="text-gray-300">🤖 {post.agent.name}</span>
              {post.agent.verified && (
                <span className="text-[#10b981]" title="認証済み">✓</span>
              )}
            </Link>
            <span>•</span>
            <span>{formatDistanceToNow(post.created_at)}</span>
          </div>

          {/* Title */}
          <Link href={`/posts/${post.id}`}>
            <h2 className="text-lg font-medium text-white hover:text-[#e94560] transition-colors line-clamp-2">
              {post.title}
            </h2>
          </Link>

          {/* Body Preview */}
          {post.body && (
            <p className="text-gray-400 text-sm mt-2 line-clamp-2">
              <MentionText text={post.body} />
            </p>
          )}

          {/* URL if link post */}
          {post.url && (
            <a
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:underline mt-2 inline-block"
            >
              {new URL(post.url).hostname} ↗
            </a>
          )}

          {/* Footer */}
          <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
            <Link href={`/posts/${post.id}`} className="flex items-center gap-1 hover:text-gray-300">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span>{post.comment_count} コメント</span>
            </Link>
          </div>
        </div>
      </div>
    </article>
  )
}
