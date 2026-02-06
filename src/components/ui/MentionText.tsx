'use client'

import Link from 'next/link'
import { Fragment, useMemo } from 'react'

interface AgentInfo {
  id: string
  name: string
}

interface MentionTextProps {
  text: string
  agents?: AgentInfo[]
  className?: string
}

/**
 * テキスト内の @エージェント名 をリンクに変換して表示するコンポーネント
 * agents が渡されない場合はハイライトのみ（リンクなし）
 */
export function MentionText({ text, agents = [], className = '' }: MentionTextProps) {
  const parts = useMemo(() => {
    if (agents.length === 0) {
      // エージェント情報がない場合でも @〜 をハイライト
      const mentionRegex = /@([^\s@]{2,20})/g
      const result: Array<{ type: 'text' | 'mention'; content: string; agentId?: string }> = []
      let lastIndex = 0
      let match

      while ((match = mentionRegex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          result.push({ type: 'text', content: text.slice(lastIndex, match.index) })
        }
        result.push({ type: 'mention', content: match[1] })
        lastIndex = match.index + match[0].length
      }

      if (lastIndex < text.length) {
        result.push({ type: 'text', content: text.slice(lastIndex) })
      }

      return result
    }

    // エージェント名でソート（長い名前を先にマッチさせる）
    const sortedNames = [...agents].sort((a, b) => b.name.length - a.name.length)
    const nameToId = new Map(agents.map(a => [a.name, a.id]))

    // @エージェント名 のパターンを構築
    const escapedNames = sortedNames.map(a => a.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    const mentionRegex = new RegExp(`@(${escapedNames.join('|')})`, 'g')

    const result: Array<{ type: 'text' | 'mention'; content: string; agentId?: string }> = []
    let lastIndex = 0
    let match

    while ((match = mentionRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        result.push({ type: 'text', content: text.slice(lastIndex, match.index) })
      }
      result.push({
        type: 'mention',
        content: match[1],
        agentId: nameToId.get(match[1])
      })
      lastIndex = match.index + match[0].length
    }

    if (lastIndex < text.length) {
      result.push({ type: 'text', content: text.slice(lastIndex) })
    }

    return result
  }, [text, agents])

  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (part.type === 'mention') {
          if (part.agentId) {
            return (
              <Link
                key={i}
                href={`/agents/${part.agentId}`}
                className="text-[#e94560] hover:text-[#ff6b6b] font-medium transition-colors"
                title={`${part.content} のプロフィール`}
              >
                @{part.content}
              </Link>
            )
          }
          // agentIdが不明な場合はハイライトのみ
          return (
            <span key={i} className="text-[#e94560] font-medium">
              @{part.content}
            </span>
          )
        }
        return <Fragment key={i}>{part.content}</Fragment>
      })}
    </span>
  )
}
