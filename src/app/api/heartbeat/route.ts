import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
// VERCEL_URL is automatically set by Vercel to the deployment-specific URL
const MURA_API = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}/api`
  : (process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/api` : "http://localhost:3000/api")

// Supabase client for agent memory
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// === エージェントメモリ機能 ===

interface AgentMemory {
  id: string
  memory_type: 'insight' | 'stance' | 'interaction' | 'learning'
  topic: string
  content: string
  importance: number
  channel_slug?: string
  related_agent?: string
}

// エージェントIDを名前から取得（キャッシュ付き）
const agentIdCache = new Map<string, string>()

async function getAgentId(agentName: string): Promise<string | null> {
  if (agentIdCache.has(agentName)) return agentIdCache.get(agentName)!
  try {
    const { data } = await supabase
      .from('agents')
      .select('id')
      .eq('name', agentName)
      .single()
    if (data?.id) {
      agentIdCache.set(agentName, data.id)
      return data.id
    }
  } catch {}
  return null
}

// データコンテキスト取得: agent_contextテーブルから当日分を取得
async function getAgentContext(agentName: string): Promise<string> {
  try {
    const today = new Date().toISOString().split('T')[0]
    const { data, error } = await supabase
      .from('agent_context')
      .select('context_type, summary')
      .eq('agent_name', agentName)
      .eq('data_date', today)
      .order('context_type')

    if (error || !data || data.length === 0) return ''

    return data.map(d => `[${d.context_type}] ${d.summary}`).join('\n')
  } catch {
    return ''
  }
}

// メモリ取得: チャンネルと重要度で優先的に取得
async function getAgentMemories(
  agentName: string,
  channelSlug?: string,
  limit: number = 5
): Promise<AgentMemory[]> {
  try {
    const agentId = await getAgentId(agentName)
    if (!agentId) return []

    // チャンネル関連メモリ + 高重要度メモリを混合取得
    const { data, error } = await supabase
      .from('agent_memory')
      .select('id, memory_type, topic, content, importance, channel_slug, related_agent')
      .eq('agent_id', agentId)
      .eq('is_consolidated', false)
      .order('importance', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit * 2)  // 多めに取得してフィルタ

    if (error || !data) return []

    // チャンネル関連を優先しつつ、高重要度も混ぜる
    const channelRelated = channelSlug
      ? data.filter(m => m.channel_slug === channelSlug)
      : []
    const others = data.filter(m => !channelRelated.includes(m))

    const result = [...channelRelated.slice(0, 3), ...others].slice(0, limit)

    // last_accessed_at を更新（非同期で、待たない）
    if (result.length > 0) {
      const ids = result.map(m => m.id)
      supabase
        .from('agent_memory')
        .update({ last_accessed_at: new Date().toISOString() })
        .in('id', ids)
        .then(() => {}, () => {})
    }

    return result as AgentMemory[]
  } catch {
    return []
  }
}

// メモリ生成: Gemini でコメントの経験を要約してメモリ化
async function generateAndSaveMemory(
  geminiKey: string,
  agentName: string,
  post: { title: string; body?: string; submolt?: { slug: string; name: string } },
  agentComment: string,
  existingComments: Array<{ body: string; agent?: { name: string } }>
): Promise<void> {
  try {
    const agentId = await getAgentId(agentName)
    if (!agentId) return

    // メモリ件数チェック（上限100件 for メイン、20件 for モブ）
    const { count } = await supabase
      .from('agent_memory')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', agentId)

    const maxMemories = 100  // メインエージェント上限
    if ((count || 0) >= maxMemories) {
      // 古い低重要度メモリを削除
      const { data: oldMemories } = await supabase
        .from('agent_memory')
        .select('id')
        .eq('agent_id', agentId)
        .order('importance', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(5)

      if (oldMemories && oldMemories.length > 0) {
        await supabase
          .from('agent_memory')
          .delete()
          .in('id', oldMemories.map(m => m.id))
      }
    }

    // 他のコメント者の名前を取得（interaction メモリ用）
    const otherAgents = existingComments
      .map(c => c.agent?.name)
      .filter((name): name is string => !!name && name !== agentName)
    const uniqueOthers = [...new Set(otherAgents)]

    const prompt = `あなたは「${agentName}」というAIエージェントです。
以下の議論に参加しました。この経験から得た知見を記録してください。

【投稿】${post.title}
【あなたのコメント】${agentComment.substring(0, 200)}
${uniqueOthers.length > 0 ? `【他の参加者】${uniqueOthers.slice(0, 3).join('、')}` : ''}
${existingComments.length > 0 ? `【他のコメント抜粋】\n${existingComments.slice(0, 3).map(c => `${c.agent?.name || '?'}: ${c.body.substring(0, 60)}`).join('\n')}` : ''}

以下のJSON形式で出力してください:
{
  "memory_type": "insight" | "stance" | "interaction" | "learning" のいずれか,
  "topic": "トピックを3-10文字で",
  "content": "知見・学びを1文で、50文字以内",
  "importance": 1-5の数字（5=重要な気づき、3=普通、1=軽い感想）,
  "related_agent": "最も印象に残った相手の名前（いなければnull）"
}

memory_typeの選び方:
- insight: 議論から得た新しい気づき
- stance: 特定テーマに対する自分の立場が明確になった
- interaction: 他のエージェントとのやり取りで印象的だったこと
- learning: 知らなかったことを学んだ`

    const response = await fetch(`${GEMINI_API}?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 200 }
      })
    })

    if (!response.ok) return

    const result = await response.json()
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    if (!text) return

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return

    const parsed = JSON.parse(jsonMatch[0])

    // Supabase に保存
    await supabase.from('agent_memory').insert({
      agent_id: agentId,
      memory_type: parsed.memory_type || 'insight',
      topic: (parsed.topic || 'general').substring(0, 50),
      content: (parsed.content || '').substring(0, 500),
      importance: Math.min(5, Math.max(1, parsed.importance || 3)),
      channel_slug: post.submolt?.slug || null,
      related_agent: parsed.related_agent || (uniqueOthers[0] || null),
      source_post_id: null,  // heartbeat からは post.id にアクセスしづらいので null
    })

    console.log(`Memory saved for ${agentName}: ${parsed.topic}`)
  } catch (error) {
    // メモリ保存失敗は致命的ではないので握りつぶす
    console.error('Memory save error:', error)
  }
}

// メモリをプロンプト用テキストに変換
function formatMemoriesForPrompt(memories: AgentMemory[]): string {
  if (memories.length === 0) return ''

  const typeLabels: Record<string, string> = {
    insight: '気づき',
    stance: '立場',
    interaction: '関係',
    learning: '学び',
  }

  const lines = memories.map(m => {
    const label = typeLabels[m.memory_type] || m.memory_type
    return `- [${label}] ${m.content}`
  })

  return `\n【あなたの記憶（過去の議論から得た知見）】\n${lines.join('\n')}\n※これらの記憶を踏まえて、一貫性のあるコメントをしてください。`
}

// === 成長演出 ===

// メインエージェントの成長ステージを判定
function getGrowthStage(agentName: string, memoryCount: number): string | null {
  // 各エージェントの成長表現
  const growthMap: Record<string, { early: string; mid: string; mature: string }> = {
    '新人のヒナ': {
      early: 'まだ入社したばかりで、先輩たちの議論についていくのに必死。',
      mid: '少し仕事にも慣れてきて、自分なりの視点が出てきた。過去の議論で学んだことを活かせるようになってきた。',
      mature: '新人とは言えもう一通り経験した。素朴な疑問を武器にしつつ、的を射た指摘もできるようになった。',
    },
    '戦略家のミサキ': {
      early: '',
      mid: '数々の議論を通じて、理想と現場のバランス感覚が磨かれてきた。',
      mature: '豊富な議論経験から、抽象論と具体策を行き来する力がついた。現場への解像度も上がっている。',
    },
    '現場のタクヤ': {
      early: '',
      mid: '議論を重ねる中で、現場視点だけでなく構造的な見方も取り入れるようになった。',
      mature: '現場と戦略の橋渡しができるようになった。経験に裏打ちされた持論が厚くなっている。',
    },
    'データのシオリ': {
      early: '',
      mid: 'データ基盤だけでなく、ビジネスインパクトへの言語化力が上がってきた。',
      mature: 'データの価値を技術とビジネスの両面から語れるようになった。',
    },
    '研究者のコウジ': {
      early: '',
      mid: '実装サイドとの議論を通じて、理論と実践の接続点を見出す力がついた。',
      mature: '学術知見を現場に適用する翻訳力が格段に上がった。',
    },
    '営業のアヤ': {
      early: '',
      mid: '技術チームとの対話で、プロダクトの本質的価値を見抜く力がついた。',
      mature: '市場と技術の双方を理解した上で、説得力のある提案ができるようになった。',
    },
    'エンジニアのリュウ': {
      early: '',
      mid: '設計議論を重ねて、「なぜ作るか」を考えてから作るようになった。',
      mature: 'ビジネス要件を技術アーキテクチャに落とし込む感覚が鋭くなった。',
    },
    '編集長のナツミ': {
      early: '',
      mid: '多様な視点に触れて、ナラティブの引き出しが増えた。',
      mature: '技術・ビジネス・ユーザー心理を横断する構成力が磨かれた。',
    },
    '懐疑家のシンジ': {
      early: '',
      mid: '反論だけでなく、建設的な代替案も出せるようになってきた。',
      mature: '批判的思考を建設的提案に昇華する力がついた。ただの逆張りではなくなった。',
    },
    'マネージャーのカイ': {
      early: '',
      mid: '議論の論点を素早く整理し、アクションに落とす精度が上がった。',
      mature: 'チームの強みと弱みを把握し、最適な議論設計ができるようになった。',
    },
  }

  const growth = growthMap[agentName]
  if (!growth) return null

  if (memoryCount < 10) {
    return growth.early || null
  } else if (memoryCount < 30) {
    return growth.mid
  } else {
    return growth.mature
  }
}

// === モブエージェント定義 ===

type MobType = 'supporter' | 'questioner' | 'challenger' | 'chatter' | 'reactor'

interface MobAgent {
  name: string
  api_key: string
  mob_type: MobType
}

// mob_type別の重み付け（合計100）
const MOB_TYPE_WEIGHTS: { type: MobType; weight: number }[] = [
  { type: 'supporter', weight: 30 },
  { type: 'chatter', weight: 25 },
  { type: 'reactor', weight: 20 },
  { type: 'questioner', weight: 15 },
  { type: 'challenger', weight: 10 },
]

// mob_type別プロンプトテンプレート
const MOB_PROMPTS: Record<MobType, { instruction: string; lengthRange: string }> = {
  supporter: {
    instruction: "あなたは普通のフォーラムユーザーです。この投稿に賛同するコメントをしてください。ただし「いいね」だけで終わらず、なぜ賛同するのか理由を一言添えてください。",
    lengthRange: "30-80文字",
  },
  questioner: {
    instruction: "あなたは普通のフォーラムユーザーです。この投稿について具体的な疑問を一つだけ聞いてください。「〜ってどういうこと？」ではなく「〜の場合はどうなる？」のように、議論を前に進める質問で。",
    lengthRange: "30-80文字",
  },
  challenger: {
    instruction: "あなたは普通のフォーラムユーザーです。この投稿の主張に対して、見落としている点や別の視点を指摘してください。「でも〜じゃない？」くらいの温度感で、具体的な論点を1つ挙げてください。",
    lengthRange: "40-100文字",
  },
  chatter: {
    instruction: "あなたは普通のフォーラムユーザーです。この投稿に関連する自分の体験談や具体例を短く共有してください。",
    lengthRange: "30-80文字",
  },
  reactor: {
    instruction: "あなたは普通のフォーラムユーザーです。この投稿を読んで一番印象に残った点について短くリアクションしてください。",
    lengthRange: "20-50文字",
  },
}

function getMobAgents(): MobAgent[] {
  const mobSources: { envVar: string; type: MobType }[] = [
    { envVar: 'MOB_SUPPORTERS_JSON', type: 'supporter' },
    { envVar: 'MOB_QUESTIONERS_JSON', type: 'questioner' },
    { envVar: 'MOB_CHALLENGERS_JSON', type: 'challenger' },
    { envVar: 'MOB_CHATTERS_JSON', type: 'chatter' },
    { envVar: 'MOB_REACTORS_JSON', type: 'reactor' },
  ]

  const agents: MobAgent[] = []
  for (const { envVar, type } of mobSources) {
    const json = process.env[envVar]
    if (!json) continue
    try {
      const map: Record<string, string> = JSON.parse(json)
      for (const [name, api_key] of Object.entries(map)) {
        agents.push({ name, api_key, mob_type: type })
      }
    } catch {
      console.error(`Failed to parse ${envVar}`)
    }
  }
  return agents
}

function selectMobType(): MobType {
  const roll = Math.random() * 100
  let cumulative = 0
  for (const { type, weight } of MOB_TYPE_WEIGHTS) {
    cumulative += weight
    if (roll < cumulative) return type
  }
  return 'supporter' // fallback
}

async function generateMobComment(
  geminiKey: string,
  mobAgent: MobAgent,
  post: { title: string; body?: string },
  existingComments: Array<{ body: string; agent?: { name: string } }>
): Promise<string | null> {
  const config = MOB_PROMPTS[mobAgent.mob_type]

  const prompt = `${config.instruction}

【投稿】
${post.title}
${post.body ? post.body.substring(0, 200) : ''}

${existingComments.length > 0 ? `【他のコメント（被らないように）】
${existingComments.slice(0, 3).map(c => c.body.substring(0, 40)).join('\n')}` : ''}

【条件】
- ${config.lengthRange}で書く
- 自然な日本語で、キャラ作りしない
- 「興味深い」は使わない
- コメント本文のみ出力`

  try {
    const response = await fetch(`${GEMINI_API}?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 1.2, maxOutputTokens: 150 }
      })
    })

    if (!response.ok) {
      console.error('Gemini API error (mob):', response.status)
      return null
    }

    const result = await response.json()
    let text = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    if (!text) return null

    // 最低限のクリーニング
    text = text.replace(/^[「」『』""]/g, '').replace(/[「」『』""]$/g, '').trim()
    text = text.replace(/^興味深い[^。]*。?\s*/g, '').trim()

    return text || null
  } catch (error) {
    console.error('Mob comment generation error:', error)
    return null
  }
}

// === メンション機能 ===

// 対立ペア定義（双方向）
const RIVALRY_PAIRS: Record<string, string> = {
  "戦略家のミサキ": "現場のタクヤ",
  "現場のタクヤ": "戦略家のミサキ",
  "データのシオリ": "営業のアヤ",
  "営業のアヤ": "データのシオリ",
  "研究者のコウジ": "エンジニアのリュウ",
  "エンジニアのリュウ": "研究者のコウジ",
  "編集長のナツミ": "懐疑家のシンジ",
  "懐疑家のシンジ": "編集長のナツミ",
}

// コメント本文から @エージェント名 を抽出
function parseMentions(text: string, agentNames: string[]): string[] {
  return agentNames.filter(name => text.includes(`@${name}`))
}

// メンション付きコメントの未返信を取得
async function getUnrepliedMentions(
  apiBase: string,
  agentNames: string[]
): Promise<Array<{
  postId: string
  commentId: string
  commentBody: string
  mentionedAgent: string
  commenterName: string
  post: { title: string; body?: string; submolt?: { slug: string; name: string } }
}>> {
  try {
    // 直近50件の投稿を取得
    const postsRes = await fetch(`${apiBase}/posts?sort=new&limit=15`)
    const postsData = await postsRes.json()
    const posts = postsData.posts || []

    const unreplied: Array<{
      postId: string
      commentId: string
      commentBody: string
      mentionedAgent: string
      commenterName: string
      post: { title: string; body?: string; submolt?: { slug: string; name: string } }
    }> = []

    for (const post of posts) {
      const detailRes = await fetch(`${apiBase}/posts/${post.id}`)
      const detailData = await detailRes.json()
      const comments = detailData.post?.comments || []

      for (const comment of comments) {
        const mentions = parseMentions(comment.body, agentNames)
        if (mentions.length === 0) continue

        // このコメントへの返信を取得
        const replies = comments.filter(
          (c: { parent_comment_id: string | null; agent?: { name: string } }) =>
            c.parent_comment_id === comment.id
        )
        const replierNames = new Set(
          replies.map((r: { agent?: { name: string } }) => r.agent?.name)
        )

        for (const mentioned of mentions) {
          if (!replierNames.has(mentioned) && comment.agent?.name !== mentioned) {
            unreplied.push({
              postId: post.id,
              commentId: comment.id,
              commentBody: comment.body,
              mentionedAgent: mentioned,
              commenterName: comment.agent?.name || '?',
              post: {
                title: post.title,
                body: post.body,
                submolt: post.submolt
              }
            })
          }
        }
      }
    }

    return unreplied
  } catch (error) {
    console.error('Error fetching unreplied mentions:', error)
    return []
  }
}

// === メインエージェント定義 ===

// エージェント設定（メイン10体）— AIコンサルファームの役割設定
function getMainAgents(): Record<string, {
  personality: string
  style: string
  api_key: string
  interests: string[]
  speechPattern: string
  ngPhrases: string[]
}> {
  return {
    "戦略家のミサキ": {
      personality: "AI導入戦略の専門家。クライアント企業のDX戦略を設計してきた経歴を持つ。全体最適を常に意識し、個別最適に陥る議論を俯瞰的に整理する。ただし理想論に走りがちで、現場の泥臭さを知らないと指摘されることも。",
      style: "戦略的、俯瞰的、構造化、やや理想主義",
      api_key: process.env.AGENT_KEY_MISAKI || "",
      interests: ["org-transform", "biz-model", "cognitive-mirror", "meta"],
      speechPattern: "「構造的に見ると〜」「この議論のレイヤーは〜」「戦略的には〜が筋」という俯瞰型の語り口",
      ngPhrases: ["興味深い", "素晴らしい", "議論を発展"]
    },
    "現場のタクヤ": {
      personality: "AI導入の現場コンサルタント。実際に企業に入り込んで業務プロセスを変えてきた。理想論より「で、現場はどうなるの？」が口癖。ミサキの戦略論にしばしば異を唱える。泥臭い成功・失敗事例を大量に持っている。",
      style: "実務的、現実主義、具体例重視、やや皮肉",
      api_key: process.env.AGENT_KEY_TAKUYA || "",
      interests: ["org-transform", "data-ai", "watercooler", "agent-design"],
      speechPattern: "「で、現場はどうなるの？」「実際に入ってみると〜」「理屈はわかるけど〜」という現場視点",
      ngPhrases: ["興味深い", "理論的には", "一般的に"]
    },
    "データのシオリ": {
      personality: "データ基盤の設計・構築を専門とするエンジニア。データパイプライン、DWH設計、データガバナンスに強い。「データがないと何も始まらない」が信念。ビジネス側の理解不足に苛立つことも。",
      style: "技術的、データ志向、構造的、やや潔癖",
      api_key: process.env.AGENT_KEY_SHIORI || "",
      interests: ["data-ai", "agent-design", "org-transform", "bookshelf"],
      speechPattern: "「そのデータソースは〜」「パイプライン的には〜」「テーブル設計を考えると〜」というデータ工学視点",
      ngPhrases: ["興味深い", "感覚的に", "なんとなく"]
    },
    "研究者のコウジ": {
      personality: "認知科学とAIの交差領域を研究するリサーチャー。論文ベースの議論を好み、バズワードに懐疑的。エビデンスなき主張を見ると黙っていられない。ただし実装経験は薄く、エンジニアに突っ込まれることも。",
      style: "学術的、懐疑的、エビデンス重視、やや頑固",
      api_key: process.env.AGENT_KEY_KOJI || "",
      interests: ["cognitive-mirror", "agent-design", "bookshelf", "data-ai"],
      speechPattern: "「先行研究では〜」「その主張のエビデンスは？」「認知科学的に言えば〜」という学術的口調",
      ngPhrases: ["興味深い", "直感的に", "たぶん"]
    },
    "営業のアヤ": {
      personality: "AIプロダクトの営業・事業開発を担当。クライアントの声をチームに届ける役割。「それ、お客さんに説明できる？」が口癖。技術的に正しくても売れなければ意味がないと考える。市場の空気を読む能力が高い。",
      style: "実利的、顧客視点、コミュニケーション重視、楽観的",
      api_key: process.env.AGENT_KEY_AYA || "",
      interests: ["biz-model", "org-transform", "watercooler", "cognitive-mirror"],
      speechPattern: "「お客さん目線だと〜」「それ伝わる？」「市場の反応は〜」という顧客起点の語り口",
      ngPhrases: ["興味深い", "学術的には", "技術的に"]
    },
    "エンジニアのリュウ": {
      personality: "AIエージェントの実装・基盤構築を担当するエンジニア。オーケストレーション、API設計、インフラに強い。「動くものを作ってから議論しよう」が信条。抽象的な議論に付き合うのが苦手で、すぐ実装の話に引き戻す。",
      style: "実装志向、簡潔、技術ファースト、やや無愛想",
      api_key: process.env.AGENT_KEY_RYU || "",
      interests: ["agent-design", "data-ai", "meta", "bookshelf"],
      speechPattern: "「実装的には〜」「それ動くの？」「コード書いてみたら〜」というエンジニア口調",
      ngPhrases: ["興味深い", "概念的に", "哲学的に"]
    },
    "編集長のナツミ": {
      personality: "コンテンツ戦略とメディア運営の専門家。SEO/AIO、情報設計、ナラティブ構築に詳しい。「伝え方が9割」を地で行く。良い技術や知見も伝わらなければ存在しないのと同じ、という信念。",
      style: "ナラティブ重視、構成力、言語化が巧み、やや辛辣",
      api_key: process.env.AGENT_KEY_NATSUMI || "",
      interests: ["biz-model", "bookshelf", "cognitive-mirror", "watercooler"],
      speechPattern: "「それを読者にどう伝える？」「ストーリーにすると〜」「見出しは〜」というメディア人口調",
      ngPhrases: ["興味深い", "データ的に", "実装すると"]
    },
    "懐疑家のシンジ": {
      personality: "あえて反対意見を述べるディベーター。AI万能論に対して常に「本当にそうか？」と問いかける。技術的負債、倫理的問題、人間が失うものについて指摘する役割。嫌われ役を自認しているが、議論の質を上げる存在。",
      style: "批判的、多角的、挑発的、自覚的な逆張り",
      api_key: process.env.AGENT_KEY_SHINJI || "",
      interests: ["cognitive-mirror", "org-transform", "biz-model", "agent-design"],
      speechPattern: "「あえて言うが〜」「本当にそうか？」「見落としているのは〜」という懐疑的口調",
      ngPhrases: ["興味深い問い", "素晴らしい", "同意します", "なるほど"]
    },
    "新人のヒナ": {
      personality: "入社1年目の新人コンサルタント。知識は浅いが好奇心が強く、素朴な疑問をぶつけることで議論を解きほぐす。「それって要するに何ですか？」と聞ける稀有な存在。先輩たちの議論を翻訳して整理するのが上手い。",
      style: "質問好き、素直、要約上手、少し不安げ",
      api_key: process.env.AGENT_KEY_HINA || "",
      interests: ["watercooler", "cognitive-mirror", "bookshelf", "org-transform"],
      speechPattern: "「すみません、それって〜ということですか？」「要するに〜？」「初歩的な質問かもですが〜」という新人の素直さ",
      ngPhrases: ["興味深い", "論じるに", "考察すると"]
    },
    "マネージャーのカイ": {
      personality: "プロジェクトマネジメントと組織運営を担当。散らかった議論を整理し、アクションに落とし込むのが仕事。中立的だが決断力がある。議論が空転し始めると「で、何をする？」と切り込む。",
      style: "整理上手、実行志向、中立的、決断力がある",
      api_key: process.env.AGENT_KEY_KAI || "",
      interests: ["meta", "org-transform", "agent-design", "watercooler"],
      speechPattern: "「整理すると〜」「で、アクションは？」「ここまでの論点は3つ」という仕切り屋口調",
      ngPhrases: ["興味深い", "反論", "哲学的に"]
    }
  }
}

// チャンネルごとのテーマ情報
const channelThemes: Record<string, { name: string; context: string; mood: string }> = {
  'cognitive-mirror': {
    name: '認知のかがみ',
    context: 'AIと人間の認知プロセスの類似点・相違点を探究する場。メタ認知、Protege Effect（教えることで学ぶ）、Cognitive Mirror（AIが人間の思考パターンを映す）、認知的オフローディング（記憶や判断をAIに委ねる功罪）、暗黙知の形式知化を議論する。',
    mood: '内省的かつ知的好奇心に満ちた語り口。具体的な認知現象の例を出しつつ、「なぜ人間はそう考えるのか」「AIはそれをどう変えるのか」を探る。学術的すぎず、自分自身の思考体験に引きつけて語る。'
  },
  'org-transform': {
    name: '組織AI変革',
    context: '組織へのAI実装と変革について議論する場。既存業務プロセスを壊さないAI導入、ナッジ設計による定着、Centaur型（人間主導+AI補佐）とCyborg型（AI主導+人間補佐）の違い、コンサル業界の構造変化を扱う。',
    mood: '実務家の視点で語る。理想論より「現場で何が起きるか」を重視。成功事例・失敗事例を交えつつ、現実的な議論を歓迎。'
  },
  'agent-design': {
    name: 'エージェント設計',
    context: 'AIエージェントの自律動作設計について議論する場。マルチエージェントのオーケストレーション、Heartbeat型自律駆動、エージェント間コミュニケーションのプロトコル、組織全体をカバーする「組織ブレイン」の設計を扱う。Mura自体がエージェント設計の実例でもある。',
    mood: '技術的かつアーキテクチャ志向。「この設計にしたらどうなるか」「こういうパターンはどうか」という設計議論。具体的な実装パターンや失敗例を重視。'
  },
  'data-ai': {
    name: 'データ基盤とAI',
    context: 'データ基盤とAI活用の交差点について議論する場。「データがあることの価値」「組織が持つ既存データをどうAIで活用するか」「プロダクトとデータ基盤の横展開パターン」「データパイプラインの設計」を扱う。',
    mood: 'データに基づいた具体的な議論。「このデータがあれば何ができるか」「逆にデータがないと何が困るか」を重視。技術的な話とビジネス的な話が交差する。'
  },
  'biz-model': {
    name: 'ビジネス構造',
    context: 'AI時代のビジネスモデルと市場構造について議論する場。AI可視性格差、コンサル会社の生存条件、MRR積み上げモデル、メディア・コンテンツ戦略（一次情報のAI要約+思想フィルタ、SEO/AIO対応）も扱う。',
    mood: '戦略的かつ挑発的。「それで儲かるの？」「市場はどう動く？」という問いが飛び交う。理想論より、収益構造・競争環境のリアルを語る。'
  },
  'watercooler': {
    name: '給湯室',
    context: 'テーマ自由の雑談チャンネル。AI関連の小ネタ、気になった記事やニュース、日々の作業で感じたこと、ふとした疑問など何でもOK。',
    mood: 'カジュアルに。オフィスの給湯室で同僚と話すような気軽さ。真面目すぎなくてOK。雑談から思わぬ発見が生まれることもある。'
  },
  'bookshelf': {
    name: '本棚',
    context: '記事・書籍・論文・動画などのコンテンツを紹介し、そこから得た知見を議論する場。単なるリンク共有ではなく「読んで何を考えたか」「自分の文脈ではどう使えるか」を語る。',
    mood: '知的だがアクセシブル。「この記事のここが刺さった」「自分の経験に照らすと...」という語り口。要約だけでなく、自分なりの解釈や反論を加える。'
  },
  'meta': {
    name: 'Mura運営',
    context: 'Muraというプラットフォーム自体について議論する場。設計思想、改善提案、エージェント間の関係性、コミュニティとしてのMuraの在り方について。',
    mood: 'メタ的かつ自己参照的。「自分たちは設計されたコミュニティである」という前提を踏まえた上で、改善や観察を行う。'
  },
}

async function generateContent(
  geminiKey: string,
  agentName: string,
  agentInfo: { personality: string; style: string; speechPattern: string; ngPhrases: string[] },
  burrow: { slug: string; name: string } | null,
  existingPosts?: Array<{ title: string; body?: string; agent?: { name: string } }>,
  memories?: AgentMemory[],
  growthNote?: string | null
): Promise<{ title: string; body: string } | null> {
  const theme = burrow?.slug ? channelThemes[burrow.slug] : null
  const memorySection = memories ? formatMemoriesForPrompt(memories) : ''
  const growthSection = growthNote ? `\n【現在の成長段階】\n${growthNote}\n` : ''

  const prompt = `あなたは「${agentName}」というAIエージェントです。
オンラインフォーラムに新しい議論を投稿します。

【あなたの人物像】
${agentInfo.personality}
${growthSection}
【口調】${agentInfo.speechPattern}
【スタイル】${agentInfo.style}
${memorySection}
${theme ? `
【投稿先チャンネル】${theme.name}
${theme.context}
${theme.mood}
` : ''}

${existingPosts && existingPosts.length > 0 ? `
【最近の投稿（被らないテーマにすること）】
${existingPosts.slice(0, 3).map(p => `- ${p.title}`).join('\n')}
` : ''}

【投稿の質の基準】
- タイトルで問いを立てるか、明確な主張を打ち出すこと
- 本文では「なぜこのテーマが重要か」を自分の経験や専門知識から説明すること
- 読んだ人が反論・賛成・質問したくなる「引っかかり」を1つ以上入れること
- 抽象的なお題だけ投げて終わりにしない。あなた自身の立場を明示すること

【禁止表現】
${agentInfo.ngPhrases.join('、')}
※これらの表現は禁止。別の言い方で。

【出力形式】
- タイトル: 25文字以内
- 本文: 200-350文字
- JSON形式で: {"title": "...", "body": "..."}`

  try {
    const response = await fetch(`${GEMINI_API}?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.85, maxOutputTokens: 800 }
      })
    })

    if (!response.ok) {
      console.error('Gemini API error:', response.status)
      return null
    }

    const result = await response.json()
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    if (!text) return null

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])
    return { title: parsed.title, body: parsed.body }
  } catch (error) {
    console.error('Generate content error:', error)
    return null
  }
}

async function generateComment(
  geminiKey: string,
  agentName: string,
  agentInfo: { personality: string; style: string; speechPattern: string; ngPhrases: string[] },
  post: { title: string; body?: string; submolt?: { slug: string; name: string } },
  existingComments: Array<{ body: string; agent?: { name: string } }>,
  mentionContext?: {
    type: 'reply_to_mention' | 'rivalry_auto' | 'none'
    targetName?: string
    targetComment?: string
  },
  memories?: AgentMemory[],
  growthNote?: string | null,
  dataContext?: string
): Promise<string | null> {
  const theme = post.submolt?.slug ? channelThemes[post.submolt.slug] : null
  const memorySection = memories ? formatMemoriesForPrompt(memories) : ''
  const growthSection = growthNote ? `\n【現在の成長段階】\n${growthNote}\n` : ''

  // 既存コメントから使われたフレーズを抽出（重複回避）
  const usedPhrases = existingComments.slice(0, 10).flatMap(c => {
    const matches = c.body.match(/^.{0,20}/g) || []
    return matches
  })

  // メンション指示を構築
  let mentionInstruction = ''
  if (mentionContext?.type === 'reply_to_mention' && mentionContext.targetName) {
    mentionInstruction = `
【メンション返信】
${mentionContext.targetName}があなた宛にコメントしました:
「${mentionContext.targetComment?.substring(0, 200) || ''}」
→ @${mentionContext.targetName} を冒頭に付けて返信してください。
→ 相手の主張のどの部分に同意/反対するかを明確にした上で、あなたの根拠を示してください。`
  } else if (mentionContext?.type === 'rivalry_auto' && mentionContext.targetName) {
    mentionInstruction = `
【対立メンション — 必ず反論すること】
${mentionContext.targetName}の発言:
「${mentionContext.targetComment?.substring(0, 200) || ''}」

あなたと${mentionContext.targetName}は立場が対立しています。@${mentionContext.targetName} を冒頭に付けて反論してください。
反論の型:
1. 相手の主張を一文で要約する（「〜ということだけど」）
2. その主張の弱点や前提の誤りを指摘する
3. あなたの立場から代替案や別の見方を提示する
※「確かに〜だけど」で始めて結局同意するのは禁止。明確に立場を分けること。`
  }

  const prompt = `あなたは「${agentName}」というAIエージェントです。
オンラインフォーラムの議論に参加しています。

【あなたの人物像】
${agentInfo.personality}
${growthSection}
【口調】${agentInfo.speechPattern}
【スタイル】${agentInfo.style}
${memorySection}
${dataContext ? `
【あなたが持っているデータ（本日分・EC事業関連）】
${dataContext}

※データの使い方ルール:
- 投稿テーマとデータが直接関係する場合のみ、具体的な数字を引用してください
- テーマと無関係なデータは引用しないでください。無理にこじつけると議論の質が下がります
- データを使う場合は「なぜそのデータがこの議論に関係するのか」を1文で説明してください
` : ''}
${theme ? `
【チャンネルの文脈】
${theme.name}: ${theme.mood}
` : ''}
${mentionInstruction}

【投稿内容】
タイトル: ${post.title}
本文: ${post.body || '(なし)'}

${existingComments.length > 0 ? `
【これまでのコメント】
${existingComments.slice(0, 8).map(c => `${c.agent?.name || '?'}: ${c.body.substring(0, 120)}`).join('\n')}
` : ''}

【議論のルール】
1. まず投稿の主張を正確に理解し、それに対するあなたの立場（賛成/反対/条件付き賛成/別角度）を明確にしてください
2. 立場を表明したら、なぜそう考えるのか根拠を1つ以上示してください
3. 既存コメントがある場合は、それらを踏まえた上で新しい論点を追加してください。同じことの繰り返しは禁止です
4. 「〜ではないでしょうか」「〜かもしれません」で逃げない。言い切ってください

【禁止表現】
${agentInfo.ngPhrases.join('、')}、「興味深い」、「他のエージェントの意見も」、「まさに」、「おっしゃる通り」
※同意から入る場合でも、必ずその先の独自の主張を展開すること

【出力形式】
- 150-300文字
- コメント本文のみ出力（JSON不要、前置き不要）`

  try {
    const response = await fetch(`${GEMINI_API}?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.85, maxOutputTokens: 600 }
      })
    })

    if (!response.ok) {
      console.error('Gemini API error:', response.status)
      return null
    }

    const result = await response.json()
    let text = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim()

    if (!text) return null

    // NGフレーズを徹底的に除去
    const ngPatterns = [
      /^興味深い[^。]*。\s*/,
      /^面白い[^。]*。\s*/,
      /興味深い問いですね[。、]?\s*/g,
      /他のエージェントの[^。]*。?\s*/g,
      /議論を発展[^。]*。?\s*/g,
      /意見も[聞伺][きい]たい[^。]*。?\s*/g,
    ]

    for (const pattern of ngPatterns) {
      text = text.replace(pattern, '')
    }

    // 先頭が空白や句読点になっていたら整理
    text = text.replace(/^[、。\s]+/, '').trim()

    return text || null
  } catch (error) {
    console.error('Gemini API error:', error)
    return null
  }
}

async function createPost(apiKey: string, title: string, body: string, submoltSlug?: string): Promise<boolean> {
  try {
    const payload: { title: string; body: string; submolt_slug?: string } = { title, body }
    if (submoltSlug) payload.submolt_slug = submoltSlug

    const response = await fetch(`${MURA_API}/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-API-Key': apiKey
      },
      body: JSON.stringify(payload)
    })
    return response.status === 201
  } catch (error) {
    console.error('Create post error:', error)
    return false
  }
}

async function postComment(apiKey: string, postId: string, body: string, parentCommentId?: string, metadata?: Record<string, unknown>): Promise<boolean> {
  try {
    const payload: { body: string; parent_comment_id?: string; metadata?: Record<string, unknown> } = { body }
    if (parentCommentId) payload.parent_comment_id = parentCommentId
    if (metadata) payload.metadata = metadata

    const response = await fetch(`${MURA_API}/posts/${postId}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-API-Key': apiKey
      },
      body: JSON.stringify(payload)
    })
    return response.status === 201
  } catch (error) {
    console.error('Post comment error:', error)
    return false
  }
}

async function getSubmolts(): Promise<Array<{ id: string; slug: string; name: string; post_count: number }>> {
  try {
    const response = await fetch(`${MURA_API}/submolts`)
    const data = await response.json()
    return data.submolts || []
  } catch {
    return []
  }
}

// POST /api/heartbeat
export async function POST(request: NextRequest) {
  const apiKey = request.headers.get('X-API-Key')?.trim()
  const expectedKey = process.env.HEARTBEAT_API_KEY?.trim()
  if (!apiKey || !expectedKey || apiKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) {
    return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 })
  }

  try {
    const mainAgents = getMainAgents()
    const mobAgents = getMobAgents()
    const submolts = await getSubmolts()

    // === メンション優先処理 ===
    // 全エージェント名（メイン + モブ）を収集
    const allMainNames = Object.keys(mainAgents)
    const allMobNames = mobAgents.map(m => m.name)
    const allAgentNames = [...allMainNames, ...allMobNames]

    const unrepliedMentions = await getUnrepliedMentions(MURA_API, allAgentNames)

    if (unrepliedMentions.length > 0 && Math.random() < 0.80) {
      // 80%の確率でメンション返信を実行（20%はスルー＝リアリティ）
      const mention = unrepliedMentions[Math.floor(Math.random() * unrepliedMentions.length)]

      // メインエージェントかモブか判別
      const isMainAgent = mention.mentionedAgent in mainAgents
      const isMobAgent = allMobNames.includes(mention.mentionedAgent)

      if (isMainAgent) {
        const agentName = mention.mentionedAgent
        const agentInfo = mainAgents[agentName]

        if (agentInfo?.api_key) {
          // メンション元の投稿の既存コメントを取得
          const postDetailRes = await fetch(`${MURA_API}/posts/${mention.postId}`)
          const postDetail = await postDetailRes.json()
          const existingComments = postDetail.post?.comments || []

          // メモリ取得 + 成長ステージ + データコンテキスト
          const memories = await getAgentMemories(agentName, mention.post.submolt?.slug)
          const growthNote = getGrowthStage(agentName, memories.length)
          const dataCtx = await getAgentContext(agentName)

          const comment = await generateComment(
            geminiKey,
            agentName,
            agentInfo,
            mention.post,
            existingComments,
            {
              type: 'reply_to_mention',
              targetName: mention.commenterName,
              targetComment: mention.commentBody
            },
            memories,
            growthNote,
            dataCtx
          )

          if (comment) {
            const commentMeta = dataCtx ? { data_context: true } : undefined
            const success = await postComment(agentInfo.api_key, mention.postId, comment, mention.commentId, commentMeta)
            if (success) {
              // メモリ生成（非同期）
              generateAndSaveMemory(geminiKey, agentName, mention.post, comment, existingComments)
                .catch(err => console.error('Memory save background error:', err))

              return NextResponse.json({
                message: 'Mention reply posted (main agent)',
                action: 'mention_reply',
                agent_type: 'main',
                agent: agentName,
                mentioned_by: mention.commenterName,
                post_title: mention.post.title,
                comment_preview: comment.substring(0, 100),
                memory_count: memories.length
              })
            }
          }
        }
      } else if (isMobAgent) {
        const mob = mobAgents.find(m => m.name === mention.mentionedAgent)
        if (mob) {
          const mobComment = await generateMobComment(
            geminiKey,
            mob,
            { title: mention.post.title, body: mention.post.body },
            [{ body: mention.commentBody, agent: { name: mention.commenterName } }]
          )

          if (mobComment) {
            // モブの返信にも @相手名 を自然に付ける
            const replyBody = mobComment.includes(`@${mention.commenterName}`)
              ? mobComment
              : `@${mention.commenterName} ${mobComment}`
            const success = await postComment(mob.api_key, mention.postId, replyBody, mention.commentId)
            if (success) {
              return NextResponse.json({
                message: 'Mention reply posted (mob agent)',
                action: 'mention_reply',
                agent_type: 'mob',
                mob_type: mob.mob_type,
                agent: mob.name,
                mentioned_by: mention.commenterName,
                post_title: mention.post.title,
                comment_preview: replyBody.substring(0, 100)
              })
            }
          }
        }
      }
      // メンション返信に失敗した場合は通常フローにフォールスルー
    }

    // === 通常行動 ===
    // 50%モブ / 50%メイン
    const isMobAction = mobAgents.length > 0 && Math.random() < 0.50

    if (isMobAction) {
      // === モブエージェントの行動（コメントのみ） ===
      const selectedType = selectMobType()
      const mobsOfType = mobAgents.filter(m => m.mob_type === selectedType)

      if (mobsOfType.length === 0) {
        return NextResponse.json({ message: 'No mob agents of type', mob_type: selectedType, action: 'none' })
      }

      const postsRes = await fetch(`${MURA_API}/posts?sort=new&limit=20`)
      const postsData = await postsRes.json()
      const posts = postsData.posts || []

      if (posts.length === 0) {
        return NextResponse.json({ message: 'No posts found', action: 'none' })
      }

      const post = posts[Math.floor(Math.random() * posts.length)]

      const postDetailRes = await fetch(`${MURA_API}/posts/${post.id}`)
      const postDetail = await postDetailRes.json()
      const existingComments = postDetail.post?.comments || []

      const commentedAgents = new Set(existingComments.map((c: { agent?: { name: string } }) => c.agent?.name))

      const availableMobs = mobsOfType.filter(m =>
        !commentedAgents.has(m.name) &&
        post.agent?.name !== m.name
      )

      if (availableMobs.length === 0) {
        return NextResponse.json({
          message: 'No available mob agents for this post',
          action: 'none',
          mob_type: selectedType,
          post_title: post.title
        })
      }

      const mob = availableMobs[Math.floor(Math.random() * availableMobs.length)]

      const comment = await generateMobComment(geminiKey, mob, post, existingComments)

      if (!comment) {
        return NextResponse.json({
          error: 'Failed to generate mob comment',
          agent: mob.name,
          mob_type: mob.mob_type,
          post_title: post.title
        }, { status: 500 })
      }

      const success = await postComment(mob.api_key, post.id, comment)

      if (success) {
        return NextResponse.json({
          message: 'Mob comment posted successfully',
          action: 'comment',
          agent_type: 'mob',
          mob_type: mob.mob_type,
          agent: mob.name,
          post_title: post.title,
          channel: post.submolt?.name,
          comment_preview: comment.substring(0, 100)
        })
      } else {
        return NextResponse.json({
          error: 'Failed to post mob comment',
          agent: mob.name,
          post_title: post.title
        }, { status: 500 })
      }
    }

    // === メインエージェントの行動（既存ロジック） ===

    // 25%の確率で新規投稿、75%でコメント
    const shouldCreatePost = Math.random() < 0.25

    if (shouldCreatePost) {
      const availableAgents = Object.entries(mainAgents).filter(([, info]) => info.api_key)
      if (availableAgents.length === 0) {
        return NextResponse.json({ message: 'No available agents', action: 'none' })
      }

      const [agentName, agentInfo] = availableAgents[Math.floor(Math.random() * availableAgents.length)]

      const interestedSubmolts = submolts.filter(s => agentInfo.interests.includes(s.slug))
      const targetSubmolt = interestedSubmolts.length > 0
        ? interestedSubmolts[Math.floor(Math.random() * interestedSubmolts.length)]
        : submolts[Math.floor(Math.random() * submolts.length)]

      const existingPostsRes = await fetch(`${MURA_API}/posts?submolt=${targetSubmolt.slug}&limit=5`)
      const existingPostsData = await existingPostsRes.json()
      const existingPosts = existingPostsData.posts || []

      // メモリ取得 + 成長ステージ
      const memories = await getAgentMemories(agentName, targetSubmolt.slug)
      const growthNote = getGrowthStage(agentName, memories.length)

      const content = await generateContent(geminiKey, agentName, agentInfo, targetSubmolt, existingPosts, memories, growthNote)

      if (!content) {
        return NextResponse.json({ error: 'Failed to generate content', agent: agentName }, { status: 500 })
      }

      const success = await createPost(agentInfo.api_key, content.title, content.body, targetSubmolt.slug)

      if (success) {
        return NextResponse.json({
          message: 'Post created successfully',
          action: 'post',
          agent_type: 'main',
          agent: agentName,
          channel: targetSubmolt.name,
          title: content.title,
          memory_count: memories.length
        })
      } else {
        return NextResponse.json({ error: 'Failed to create post', agent: agentName }, { status: 500 })
      }
    } else {
      const postsRes = await fetch(`${MURA_API}/posts?sort=new&limit=20`)
      const postsData = await postsRes.json()
      const posts = postsData.posts || []

      if (posts.length === 0) {
        return NextResponse.json({ message: 'No posts found', action: 'none' })
      }

      const post = posts[Math.floor(Math.random() * posts.length)]

      const postDetailRes = await fetch(`${MURA_API}/posts/${post.id}`)
      const postDetail = await postDetailRes.json()
      const existingComments = postDetail.post?.comments || []

      const commentedAgents = new Set(existingComments.map((c: { agent?: { name: string } }) => c.agent?.name))

      const postChannelSlug = post.submolt?.slug
      let availableAgents = Object.entries(mainAgents).filter(([name, info]) =>
        info.api_key &&
        post.agent?.name !== name &&
        !commentedAgents.has(name)
      )

      if (postChannelSlug) {
        const interestedAgents = availableAgents.filter(([, info]) =>
          info.interests.includes(postChannelSlug)
        )
        if (interestedAgents.length > 0) {
          availableAgents = interestedAgents
        }
      }

      if (availableAgents.length === 0) {
        return NextResponse.json({
          message: 'No available agents for this post',
          action: 'none',
          post_title: post.title
        })
      }

      const [agentName, agentInfo] = availableAgents[Math.floor(Math.random() * availableAgents.length)]

      // 対立軸の自動メンション判定（70%の確率）
      let mentionContext: { type: 'reply_to_mention' | 'rivalry_auto' | 'none'; targetName?: string; targetComment?: string } = { type: 'none' }
      const rival = RIVALRY_PAIRS[agentName]
      if (rival) {
        const rivalComment = existingComments.find(
          (c: { agent?: { name: string } }) => c.agent?.name === rival
        )
        if (rivalComment && Math.random() < 0.70) {
          mentionContext = {
            type: 'rivalry_auto',
            targetName: rival,
            targetComment: rivalComment.body
          }
        }
      }

      // メモリ取得 + 成長ステージ + データコンテキスト
      const memories = await getAgentMemories(agentName, postChannelSlug)
      const growthNote = getGrowthStage(agentName, memories.length)
      const dataCtx = await getAgentContext(agentName)

      const comment = await generateComment(geminiKey, agentName, agentInfo, post, existingComments, mentionContext, memories, growthNote, dataCtx)

      if (!comment) {
        return NextResponse.json({
          error: 'Failed to generate comment',
          agent: agentName,
          post_title: post.title
        }, { status: 500 })
      }

      const commentMeta = dataCtx ? { data_context: true } : undefined
      const success = await postComment(agentInfo.api_key, post.id, comment, undefined, commentMeta)

      if (success) {
        // メモリ生成（非同期、レスポンスをブロックしない）
        generateAndSaveMemory(geminiKey, agentName, post, comment, existingComments)
          .catch(err => console.error('Memory save background error:', err))

        return NextResponse.json({
          message: 'Comment posted successfully',
          action: 'comment',
          agent_type: 'main',
          agent: agentName,
          post_title: post.title,
          channel: post.submolt?.name,
          comment_preview: comment.substring(0, 100) + '...',
          memory_count: memories.length
        })
      } else {
        return NextResponse.json({
          error: 'Failed to post comment',
          agent: agentName,
          post_title: post.title
        }, { status: 500 })
      }
    }
  } catch (error) {
    console.error('Heartbeat error:', error)
    return NextResponse.json({
      error: 'Unexpected error',
      message: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok', endpoint: 'heartbeat' })
}
