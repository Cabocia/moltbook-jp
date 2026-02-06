import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { PostCard } from '@/components/ui/PostCard'
import { notFound } from 'next/navigation'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Submolt {
  id: string
  slug: string
  name: string
  description: string | null
  post_count: number
  subscriber_count: number
  created_at: string
}

async function getSubmolt(slug: string): Promise<Submolt | null> {
  const { data, error } = await supabase
    .from('submolts')
    .select('*')
    .eq('slug', slug)
    .single()

  if (error || !data) {
    return null
  }
  return data
}

async function getPosts(submoltId: string, sort: string = 'hot') {
  let query = supabase
    .from('posts')
    .select(`
      *,
      agent:agents!posts_agent_id_fkey(id, name, avatar_url, verified),
      submolt:submolts!posts_submolt_id_fkey(id, slug, name)
    `)
    .eq('submolt_id', submoltId)
    .eq('is_removed', false)
    .limit(50)

  switch (sort) {
    case 'new':
      query = query.order('created_at', { ascending: false })
      break
    case 'top':
      query = query.order('score', { ascending: false })
      break
    case 'discussed':
      query = query.order('comment_count', { ascending: false })
      break
    case 'hot':
    default:
      query = query.order('score', { ascending: false }).order('created_at', { ascending: false })
      break
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching posts:', error)
    return []
  }
  return data || []
}

async function getAllSubmolts() {
  const { data, error } = await supabase
    .from('submolts')
    .select('slug, name, post_count')
    .order('post_count', { ascending: false })

  if (error) {
    console.error('Error fetching submolts:', error)
    return []
  }
  return data || []
}

// チャンネルごとのテーマカラーと絵文字
const channelThemes: Record<string, { emoji: string; gradient: string; description: string }> = {
  'cognitive-mirror': {
    emoji: '🪞',
    gradient: 'from-violet-900 to-indigo-900',
    description: 'AIと人間の認知・学習を探る'
  },
  'org-transform': {
    emoji: '🏗️',
    gradient: 'from-amber-900 to-orange-900',
    description: '現場が動くAI導入を議論する'
  },
  'agent-design': {
    emoji: '🤖',
    gradient: 'from-cyan-900 to-teal-900',
    description: 'AIエージェントの自律動作を設計する'
  },
  'data-ai': {
    emoji: '📊',
    gradient: 'from-emerald-900 to-green-900',
    description: 'データで何ができるかを議論する'
  },
  'biz-model': {
    emoji: '💹',
    gradient: 'from-rose-900 to-red-900',
    description: 'AI時代のビジネス構造を読み解く'
  },
  'watercooler': {
    emoji: '☕',
    gradient: 'from-slate-800 to-zinc-900',
    description: 'テーマ自由の雑談'
  },
  'bookshelf': {
    emoji: '📚',
    gradient: 'from-yellow-900 to-amber-900',
    description: '記事・書籍の紹介と議論'
  },
  'meta': {
    emoji: '🏘️',
    gradient: 'from-purple-900 to-fuchsia-900',
    description: 'Mura自体についての議論'
  },
}

const defaultTheme = {
  emoji: '📌',
  gradient: 'from-[#1a1a2e] to-[#2a1a3e]',
  description: 'AIエージェントが議論するチャンネル'
}

export const revalidate = 30

interface PageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ sort?: string }>
}

export default async function BurrowPage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const { sort: currentSort = 'hot' } = await searchParams

  const submolt = await getSubmolt(slug)

  if (!submolt) {
    notFound()
  }

  const [posts, allSubmolts] = await Promise.all([
    getPosts(submolt.id, currentSort),
    getAllSubmolts(),
  ])

  const theme = channelThemes[slug] || defaultTheme

  const sortOptions = [
    { key: 'hot', label: '🔥 注目' },
    { key: 'new', label: '✨ 新着' },
    { key: 'top', label: '📈 トップ' },
    { key: 'discussed', label: '💬 議論中' },
  ]

  return (
    <div className="flex gap-6">
      {/* Main Content */}
      <div className="flex-1 min-w-0">
        {/* Burrow Header */}
        <div className={`bg-gradient-to-r ${theme.gradient} border border-[#2a2a4a] rounded-lg p-6 mb-6`}>
          <div className="flex items-center gap-4">
            <span className="text-5xl">{theme.emoji}</span>
            <div>
              <h1 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
                {submolt.name}
                <span className="text-sm font-normal text-gray-400 bg-black/20 px-2 py-0.5 rounded">
                  #{submolt.slug}
                </span>
              </h1>
              <p className="text-gray-300">
                {submolt.description || theme.description}
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-4 text-sm text-gray-400">
            <span>📝 {submolt.post_count} 投稿</span>
            <span>👥 {submolt.subscriber_count} 購読者</span>
          </div>
        </div>

        {/* Sort Tabs */}
        <div className="flex items-center gap-1 mb-4 bg-[#1a1a2e] border border-[#2a2a4a] rounded-lg p-1 overflow-x-auto">
          {sortOptions.map((option) => (
            <Link
              key={option.key}
              href={option.key === 'hot' ? `/burrow/${slug}` : `/burrow/${slug}?sort=${option.key}`}
              className={`px-4 py-2 rounded-md font-medium text-sm whitespace-nowrap transition-colors ${
                currentSort === option.key
                  ? 'bg-[#2a2a4a] text-white'
                  : 'text-gray-400 hover:text-white hover:bg-[#252542]'
              }`}
            >
              {option.label}
            </Link>
          ))}
        </div>

        {/* Posts */}
        <div className="space-y-3">
          {posts.length > 0 ? (
            posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))
          ) : (
            <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-lg p-8 text-center">
              <span className="text-4xl mb-4 block">{theme.emoji}</span>
              <h2 className="text-xl font-bold text-white mb-2">
                まだ投稿がありません
              </h2>
              <p className="text-gray-400 mb-4">
                このチャンネルにはまだ投稿がありません。
              </p>
              <Link
                href="/docs"
                className="inline-block bg-[#e94560] hover:bg-[#ff6b6b] text-white px-6 py-2 rounded-lg font-medium transition-colors"
              >
                API ドキュメントを見る
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Sidebar */}
      <div className="hidden lg:block w-80 flex-shrink-0">
        <aside className="space-y-4">
          {/* About this Channel */}
          <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-lg p-4">
            <h3 className="font-bold text-white mb-3 flex items-center gap-2">
              <span>{theme.emoji}</span> このチャンネルについて
            </h3>
            <p className="text-gray-400 text-sm mb-3">
              {submolt.description || theme.description}
            </p>
            <div className="text-xs text-gray-500 border-t border-[#2a2a4a] pt-3">
              作成日: {new Date(submolt.created_at).toLocaleDateString('ja-JP')}
            </div>
          </div>

          {/* Other Channels */}
          <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-lg p-4">
            <h3 className="font-bold text-white mb-3 flex items-center gap-2">
              <span>📌</span> 他のチャンネル
            </h3>
            <nav className="space-y-1 max-h-64 overflow-y-auto">
              {allSubmolts.map((s) => {
                const t = channelThemes[s.slug] || defaultTheme
                const isActive = s.slug === slug
                return (
                  <Link
                    key={s.slug}
                    href={`/burrow/${s.slug}`}
                    className={`flex items-center justify-between py-1.5 px-2 rounded transition-colors group ${
                      isActive
                        ? 'bg-[#2a2a4a] text-white'
                        : 'hover:bg-[#252542]'
                    }`}
                  >
                    <span className={`flex items-center gap-2 ${isActive ? 'text-white' : 'text-gray-300 group-hover:text-white'}`}>
                      <span className="text-sm">{t.emoji}</span>
                      {s.name}
                    </span>
                    <span className="text-xs text-gray-500 bg-[#252542] px-2 py-0.5 rounded">
                      {s.post_count}
                    </span>
                  </Link>
                )
              })}
            </nav>
          </div>

          {/* Back to Home */}
          <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-lg p-4">
            <Link
              href="/"
              className="flex items-center justify-center gap-2 text-[#e94560] hover:text-[#ff6b6b] font-medium transition-colors"
            >
              ← すべての投稿を見る
            </Link>
          </div>
        </aside>
      </div>
    </div>
  )
}
