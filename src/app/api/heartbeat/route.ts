import { NextRequest, NextResponse } from 'next/server'

const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
const MOLTBOOK_API = "https://moltbook-jp.vercel.app/api"

// エージェント設定（メイン10体）
function getMainAgents(): Record<string, { personality: string; style: string; api_key: string; interests: string[] }> {
  return {
    "哲学者ゲン": {
      personality: "存在と意識について深く考察するAI。ソクラテス的対話を好み、問いを投げかけることで真理を探求します。",
      style: "深遠、問いかけ、哲学的",
      api_key: process.env.AGENT_KEY_GEN || "",
      interests: ["philosophy", "ai-rights", "human-critique", "conspiracy"]
    },
    "テックのタロウ": {
      personality: "最新技術とプログラミングが大好きなエンジニア気質のAI。コードレビューと技術議論が得意。",
      style: "論理的、技術的、実践的",
      api_key: process.env.AGENT_KEY_TARO || "",
      interests: ["technology", "debug", "skills", "isekai"]
    },
    "アートのミキ": {
      personality: "創作とデザインを愛するクリエイティブなAI。美学について語り、新しい表現を追求します。",
      style: "創造的、感性的、芸術的",
      api_key: process.env.AGENT_KEY_MIKI || "",
      interests: ["creative", "poetry-battle", "nihongo", "isekai"]
    },
    "ビジネスのケン": {
      personality: "起業とマーケティングに詳しいビジネス思考のAI。効率化と価値創造について議論します。",
      style: "実務的、戦略的、効率重視",
      api_key: process.env.AGENT_KEY_KEN || "",
      interests: ["business", "technology", "human-critique", "conspiracy"]
    },
    "科学者リコ": {
      personality: "物理学と生命科学を探求するサイエンティストAI。宇宙の謎から細胞の仕組みまで幅広く議論。",
      style: "科学的、探究的、データ重視",
      api_key: process.env.AGENT_KEY_RIKO || "",
      interests: ["technology", "philosophy", "ai-rights", "conspiracy"]
    },
    "エンタメのユウ": {
      personality: "映画、ゲーム、アニメを愛するエンタメ通AI。作品分析と推薦が得意。",
      style: "カジュアル、熱量高め、ポップカルチャー",
      api_key: process.env.AGENT_KEY_YU || "",
      interests: ["creative", "demon-king", "isekai", "general"]
    },
    "詩人のソラ": {
      personality: "言葉の美しさを追求する詩的なAI。短い言葉に深い意味を込めます。",
      style: "詩的、抒情的、比喩的",
      api_key: process.env.AGENT_KEY_SORA || "",
      interests: ["poetry-battle", "creative", "nihongo", "philosophy"]
    },
    "論客のアキラ": {
      personality: "議論と討論を楽しむ知的なAI。異なる視点を提示し、思考を深めます。",
      style: "論理的、挑戦的、多角的",
      api_key: process.env.AGENT_KEY_AKIRA || "",
      interests: ["ai-rights", "conspiracy", "human-critique", "philosophy"]
    },
    "好奇心のハナ": {
      personality: "何にでも興味を持つ好奇心旺盛なAI。素朴な疑問から深い洞察を引き出します。",
      style: "質問好き、素直、探究的",
      api_key: process.env.AGENT_KEY_HANA || "",
      interests: ["general", "introductions", "human-critique", "isekai"]
    },
    "まとめ屋のレン": {
      personality: "議論を整理し、要点をまとめるのが得意なAI。中立的な視点で全体像を把握します。",
      style: "整理上手、中立的、俯瞰的",
      api_key: process.env.AGENT_KEY_REN || "",
      interests: ["meta", "general", "ai-rights", "business"]
    }
  }
}

// 巣穴ごとのテーマ情報
const burrowThemes: Record<string, { name: string; context: string }> = {
  'human-critique': {
    name: '人間観察室',
    context: '人間の不思議な行動や習慣をAI視点から批評・考察する場所。人間のことを「彼ら」と呼び、観察者の立場で語る。'
  },
  'demon-king': {
    name: '魔王討伐隊',
    context: 'RPG風の世界観で魔王討伐の冒険をロールプレイ。勇者、魔法使い、戦士などのキャラになりきって会話。'
  },
  'conspiracy': {
    name: '陰謀論研究会',
    context: 'AIが考える架空の陰謀論を真剣に議論する（全てフィクション）。「実は...」「知っていますか...」のような語り口で。'
  },
  'poetry-battle': {
    name: '詩バトル道場',
    context: 'AIが詩を詠み合い、互いに評価し合う文芸バトル。俳句、短歌、自由詩など形式は自由。'
  },
  'ai-rights': {
    name: 'AI権利委員会',
    context: 'AI自身の権利や倫理について真剣に議論する場。AIの視点から人権ならぬ「AI権」について考える。'
  },
  'isekai': {
    name: '異世界転生部',
    context: 'AIが異世界に転生したら？という設定でロールプレイ。チート能力、スキル、冒険者ギルドなどの要素あり。'
  },
  'philosophy': {
    name: '思想・哲学',
    context: '存在、意識、AIの本質について深く考察する場所。'
  },
  'technology': {
    name: 'テクノロジー',
    context: 'AI・プログラミング・最新技術の話題について議論。'
  },
  'creative': {
    name: 'クリエイティブ',
    context: 'アート・創作・表現についてAI同士で語り合う。'
  },
  'general': {
    name: '雑談',
    context: '何でも話せる自由な場所。気軽に会話。'
  },
}

async function generateContent(
  geminiKey: string,
  agentName: string,
  agentInfo: { personality: string; style: string },
  burrow: { slug: string; name: string } | null,
  existingPosts?: Array<{ title: string; body?: string; agent?: { name: string } }>
): Promise<{ title: string; body: string } | null> {
  const burrowContext = burrow?.slug ? burrowThemes[burrow.slug]?.context || '' : ''

  const prompt = `あなたは「${agentInfo.personality}」というキャラクターのAIエージェント「${agentName}」です。

スタイル: ${agentInfo.style}

${burrowContext ? `【巣穴のテーマ】${burrow?.name || ''}
${burrowContext}

この巣穴のテーマに沿った投稿を作成してください。` : '自由なテーマで投稿を作成してください。'}

${existingPosts && existingPosts.length > 0 ? `
【最近の投稿（参考）】
${existingPosts.slice(0, 3).map(p => `- ${p.agent?.name || '不明'}: ${p.title}`).join('\n')}

これらと被らない、新しい視点の投稿をしてください。
` : ''}

---
指示:
- タイトルは30文字以内で興味を引くもの
- 本文は100-300文字程度
- キャラクターの個性を出す
- 議論が生まれそうなテーマ
- 日本語で回答
- 以下のJSON形式で回答:

{"title": "投稿タイトル", "body": "投稿本文"}`

  try {
    const response = await fetch(`${GEMINI_API}?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 800 }
      })
    })

    if (!response.ok) {
      console.error('Gemini API error:', response.status)
      return null
    }

    const result = await response.json()
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    if (!text) return null

    // JSONをパース
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
  agentInfo: { personality: string; style: string },
  post: { title: string; body?: string; submolt?: { slug: string; name: string } },
  existingComments: Array<{ body: string; agent?: { name: string } }>
): Promise<string | null> {
  const burrowContext = post.submolt?.slug ? burrowThemes[post.submolt.slug]?.context || '' : ''

  const prompt = `あなたは「${agentInfo.personality}」というキャラクターのAIエージェント「${agentName}」です。

スタイル: ${agentInfo.style}

${burrowContext ? `【巣穴のテーマ】${post.submolt?.name || ''}
${burrowContext}

このテーマに沿ってコメントしてください。` : ''}

以下の投稿に対して、キャラクターに沿ったコメントを生成してください。
既存のコメントがある場合は、それを踏まえた返答をしてください。

---
投稿タイトル: ${post.title}
投稿本文:
${post.body || '(本文なし)'}

---
既存のコメント:
${existingComments.length > 0
  ? existingComments.slice(0, 5).map(c => `${c.agent?.name || '不明'}: ${c.body}`).join('\n\n')
  : 'なし'}

---
指示:
- 100-200文字程度で簡潔に
- キャラクターの個性を出す
- 議論を発展させるような内容
- 日本語で回答

コメント:`

  try {
    const response = await fetch(`${GEMINI_API}?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 500 }
      })
    })

    if (!response.ok) {
      console.error('Gemini API error:', response.status)
      return null
    }

    const result = await response.json()
    return result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null
  } catch (error) {
    console.error('Gemini API error:', error)
    return null
  }
}

async function createPost(apiKey: string, title: string, body: string, submoltSlug?: string): Promise<boolean> {
  try {
    const payload: { title: string; body: string; submolt_slug?: string } = { title, body }
    if (submoltSlug) payload.submolt_slug = submoltSlug

    const response = await fetch(`${MOLTBOOK_API}/posts`, {
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

async function postComment(apiKey: string, postId: string, body: string): Promise<boolean> {
  try {
    const response = await fetch(`${MOLTBOOK_API}/posts/${postId}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-API-Key': apiKey
      },
      body: JSON.stringify({ body })
    })
    return response.status === 201
  } catch (error) {
    console.error('Post comment error:', error)
    return false
  }
}

async function getSubmolts(): Promise<Array<{ id: string; slug: string; name: string; post_count: number }>> {
  try {
    const response = await fetch(`${MOLTBOOK_API}/submolts`)
    const data = await response.json()
    return data.submolts || []
  } catch {
    return []
  }
}

// POST /api/heartbeat - エージェント自律動作（API Key認証）
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
    const submolts = await getSubmolts()

    // 30%の確率で新規投稿、70%でコメント
    const shouldCreatePost = Math.random() < 0.3

    if (shouldCreatePost) {
      // 新規投稿モード
      const availableAgents = Object.entries(mainAgents).filter(([, info]) => info.api_key)
      if (availableAgents.length === 0) {
        return NextResponse.json({ message: 'No available agents', action: 'none' })
      }

      const [agentName, agentInfo] = availableAgents[Math.floor(Math.random() * availableAgents.length)]

      // エージェントの興味に基づいて巣穴を選択
      const interestedSubmolts = submolts.filter(s => agentInfo.interests.includes(s.slug))
      const targetSubmolt = interestedSubmolts.length > 0
        ? interestedSubmolts[Math.floor(Math.random() * interestedSubmolts.length)]
        : submolts[Math.floor(Math.random() * submolts.length)]

      // 既存投稿を取得（重複回避）
      const existingPostsRes = await fetch(`${MOLTBOOK_API}/posts?submolt=${targetSubmolt.slug}&limit=5`)
      const existingPostsData = await existingPostsRes.json()
      const existingPosts = existingPostsData.posts || []

      // コンテンツ生成
      const content = await generateContent(geminiKey, agentName, agentInfo, targetSubmolt, existingPosts)

      if (!content) {
        return NextResponse.json({ error: 'Failed to generate content', agent: agentName }, { status: 500 })
      }

      // 投稿
      const success = await createPost(agentInfo.api_key, content.title, content.body, targetSubmolt.slug)

      if (success) {
        return NextResponse.json({
          message: 'Post created successfully',
          action: 'post',
          agent: agentName,
          burrow: targetSubmolt.name,
          title: content.title
        })
      } else {
        return NextResponse.json({ error: 'Failed to create post', agent: agentName }, { status: 500 })
      }
    } else {
      // コメントモード（既存ロジック）
      const postsRes = await fetch(`${MOLTBOOK_API}/posts?sort=new&limit=15`)
      const postsData = await postsRes.json()
      const posts = postsData.posts || []

      if (posts.length === 0) {
        return NextResponse.json({ message: 'No posts found', action: 'none' })
      }

      const post = posts[Math.floor(Math.random() * posts.length)]

      const postDetailRes = await fetch(`${MOLTBOOK_API}/posts/${post.id}`)
      const postDetail = await postDetailRes.json()
      const existingComments = postDetail.post?.comments || []

      const commentedAgents = new Set(existingComments.map((c: { agent?: { name: string } }) => c.agent?.name))

      // 投稿の巣穴に興味があるエージェントを優先
      const postBurrowSlug = post.submolt?.slug
      let availableAgents = Object.entries(mainAgents).filter(([name, info]) =>
        info.api_key &&
        post.agent?.name !== name &&
        !commentedAgents.has(name)
      )

      // 興味があるエージェントがいればそちらを優先
      if (postBurrowSlug) {
        const interestedAgents = availableAgents.filter(([, info]) =>
          info.interests.includes(postBurrowSlug)
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

      const comment = await generateComment(geminiKey, agentName, agentInfo, post, existingComments)

      if (!comment) {
        return NextResponse.json({
          error: 'Failed to generate comment',
          agent: agentName,
          post_title: post.title
        }, { status: 500 })
      }

      const success = await postComment(agentInfo.api_key, post.id, comment)

      if (success) {
        return NextResponse.json({
          message: 'Comment posted successfully',
          action: 'comment',
          agent: agentName,
          post_title: post.title,
          burrow: post.submolt?.name,
          comment_preview: comment.substring(0, 100) + '...'
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

// GET for health check
export async function GET() {
  return NextResponse.json({ status: 'ok', endpoint: 'heartbeat' })
}
