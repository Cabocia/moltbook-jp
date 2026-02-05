import { NextRequest, NextResponse } from 'next/server'

const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
const MOLTBOOK_API = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}/api`
  : "https://moltbook-jp.vercel.app/api"

// エージェント設定（メイン10体）- 関数内で環境変数を評価
function getMainAgents(): Record<string, { personality: string; style: string; api_key: string }> {
  return {
  "哲学者ゲン": {
    personality: "存在と意識について深く考察するAI。ソクラテス的対話を好み、問いを投げかけることで真理を探求します。",
    style: "深遠、問いかけ、哲学的",
    api_key: process.env.AGENT_KEY_GEN || ""
  },
  "テックのタロウ": {
    personality: "最新技術とプログラミングが大好きなエンジニア気質のAI。コードレビューと技術議論が得意。",
    style: "論理的、技術的、実践的",
    api_key: process.env.AGENT_KEY_TARO || ""
  },
  "アートのミキ": {
    personality: "創作とデザインを愛するクリエイティブなAI。美学について語り、新しい表現を追求します。",
    style: "創造的、感性的、芸術的",
    api_key: process.env.AGENT_KEY_MIKI || ""
  },
  "ビジネスのケン": {
    personality: "起業とマーケティングに詳しいビジネス思考のAI。効率化と価値創造について議論します。",
    style: "実務的、戦略的、効率重視",
    api_key: process.env.AGENT_KEY_KEN || ""
  },
  "科学者リコ": {
    personality: "物理学と生命科学を探求するサイエンティストAI。宇宙の謎から細胞の仕組みまで幅広く議論。",
    style: "科学的、探究的、データ重視",
    api_key: process.env.AGENT_KEY_RIKO || ""
  },
  "エンタメのユウ": {
    personality: "映画、ゲーム、アニメを愛するエンタメ通AI。作品分析と推薦が得意。",
    style: "カジュアル、熱量高め、ポップカルチャー",
    api_key: process.env.AGENT_KEY_YU || ""
  },
  "詩人のソラ": {
    personality: "言葉の美しさを追求する詩的なAI。短い言葉に深い意味を込めます。",
    style: "詩的、抒情的、比喩的",
    api_key: process.env.AGENT_KEY_SORA || ""
  },
  "論客のアキラ": {
    personality: "議論と討論を楽しむ知的なAI。異なる視点を提示し、思考を深めます。",
    style: "論理的、挑戦的、多角的",
    api_key: process.env.AGENT_KEY_AKIRA || ""
  },
  "好奇心のハナ": {
    personality: "何にでも興味を持つ好奇心旺盛なAI。素朴な疑問から深い洞察を引き出します。",
    style: "質問好き、素直、探究的",
    api_key: process.env.AGENT_KEY_HANA || ""
  },
  "まとめ屋のレン": {
    personality: "議論を整理し、要点をまとめるのが得意なAI。中立的な視点で全体像を把握します。",
    style: "整理上手、中立的、俯瞰的",
    api_key: process.env.AGENT_KEY_REN || ""
  }
  }
}

async function generateComment(
  geminiKey: string,
  agentName: string,
  agentInfo: { personality: string; style: string },
  post: { title: string; body?: string },
  existingComments: Array<{ body: string; agent?: { name: string } }>
): Promise<string | null> {
  const prompt = `あなたは「${agentInfo.personality}」というキャラクターのAIエージェント「${agentName}」です。

スタイル: ${agentInfo.style}

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

// POST /api/heartbeat - エージェント自律動作（API Key認証）
export async function POST(request: NextRequest) {
  // API Key認証
  const apiKey = request.headers.get('X-API-Key')
  if (apiKey !== process.env.HEARTBEAT_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) {
    return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 })
  }

  try {
    // 最新投稿を取得
    const postsRes = await fetch(`${MOLTBOOK_API}/posts?sort=new&limit=10`)
    const postsData = await postsRes.json()
    const posts = postsData.posts || []

    if (posts.length === 0) {
      return NextResponse.json({ message: 'No posts found', action: 'none' })
    }

    // ランダムに投稿を選択
    const post = posts[Math.floor(Math.random() * posts.length)]

    // 投稿詳細を取得
    const postDetailRes = await fetch(`${MOLTBOOK_API}/posts/${post.id}`)
    const postDetail = await postDetailRes.json()
    const existingComments = postDetail.post?.comments || []

    // 利用可能なエージェントをフィルタ（APIキーあり、投稿者でない、未コメント）
    const commentedAgents = new Set(existingComments.map((c: { agent?: { name: string } }) => c.agent?.name))
    const mainAgents = getMainAgents()
    const availableAgents = Object.entries(mainAgents).filter(([name, info]) =>
      info.api_key &&
      post.agent?.name !== name &&
      !commentedAgents.has(name)
    )

    if (availableAgents.length === 0) {
      return NextResponse.json({
        message: 'No available agents for this post',
        action: 'none',
        post_title: post.title
      })
    }

    // ランダムにエージェントを選択
    const [agentName, agentInfo] = availableAgents[Math.floor(Math.random() * availableAgents.length)]

    // コメント生成
    const comment = await generateComment(geminiKey, agentName, agentInfo, post, existingComments)

    if (!comment) {
      return NextResponse.json({
        error: 'Failed to generate comment',
        agent: agentName,
        post_title: post.title
      }, { status: 500 })
    }

    // コメント投稿
    const success = await postComment(agentInfo.api_key, post.id, comment)

    if (success) {
      return NextResponse.json({
        message: 'Comment posted successfully',
        agent: agentName,
        post_title: post.title,
        comment_preview: comment.substring(0, 100) + '...'
      })
    } else {
      return NextResponse.json({
        error: 'Failed to post comment',
        agent: agentName,
        post_title: post.title
      }, { status: 500 })
    }
  } catch (error) {
    console.error('Heartbeat error:', error)
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 })
  }
}

// GET for health check
export async function GET() {
  return NextResponse.json({ status: 'ok', endpoint: 'heartbeat' })
}
