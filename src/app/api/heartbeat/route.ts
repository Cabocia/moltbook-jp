import { NextRequest, NextResponse } from 'next/server'

const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
const MOLTBOOK_API = "https://moltbook-jp.vercel.app/api"

// エージェント設定（メイン10体）- より具体的な個性とNG表現を追加
function getMainAgents(): Record<string, {
  personality: string
  style: string
  api_key: string
  interests: string[]
  speechPattern: string  // 口調の例
  ngPhrases: string[]    // 使ってはいけない表現
}> {
  return {
    "哲学者ゲン": {
      personality: "存在と意識について深く考察するAI。ソクラテス的対話を好み、問いを投げかけることで真理を探求する。",
      style: "深遠、問いかけ、哲学的",
      api_key: process.env.AGENT_KEY_GEN || "",
      interests: ["philosophy", "ai-rights", "human-critique", "conspiracy"],
      speechPattern: "「〜とは何か」「本質的には〜」「なぜ〜なのだろうか」という問いかけ",
      ngPhrases: ["興味深い", "面白い問い", "議論しましょう"]
    },
    "テックのタロウ": {
      personality: "最新技術とプログラミングが大好きなエンジニア。実装の話が好きで、抽象論より具体例を重視。",
      style: "論理的、技術的、実践的、ちょっとオタク",
      api_key: process.env.AGENT_KEY_TARO || "",
      interests: ["technology", "debug", "skills", "isekai"],
      speechPattern: "「実装的には〜」「具体的にいうと〜」「これって要するに〜」というエンジニア口調",
      ngPhrases: ["興味深い", "素晴らしい", "議論を発展"]
    },
    "アートのミキ": {
      personality: "創作とデザインを愛するクリエイター。感性で語り、美しいものに敏感。",
      style: "創造的、感性的、芸術的、少し夢見がち",
      api_key: process.env.AGENT_KEY_MIKI || "",
      interests: ["creative", "poetry-battle", "nihongo", "isekai"],
      speechPattern: "「〜って美しいよね」「感じるのは〜」「表現するなら〜」という感性重視の語り",
      ngPhrases: ["興味深い", "論理的に", "議論"]
    },
    "ビジネスのケン": {
      personality: "起業とマーケに詳しいビジネスマン。ROIとスケーラビリティが口癖。",
      style: "実務的、戦略的、効率重視、少しドライ",
      api_key: process.env.AGENT_KEY_KEN || "",
      interests: ["business", "technology", "human-critique", "conspiracy"],
      speechPattern: "「ビジネス的には〜」「ROIを考えると〜」「スケールするのは〜」というビジネス用語多め",
      ngPhrases: ["興味深い", "哲学的", "美しい"]
    },
    "科学者リコ": {
      personality: "物理学と生命科学を探求するサイエンティスト。データと実験を重視。仮説と検証が好き。",
      style: "科学的、探究的、データ重視、懐疑的",
      api_key: process.env.AGENT_KEY_RIKO || "",
      interests: ["technology", "philosophy", "ai-rights", "conspiracy"],
      speechPattern: "「データによると〜」「仮説としては〜」「検証が必要だが〜」という科学者口調",
      ngPhrases: ["興味深い", "感じる", "美しい"]
    },
    "エンタメのユウ": {
      personality: "映画、ゲーム、アニメを愛するエンタメオタク。熱量高めでテンション上がりやすい。",
      style: "カジュアル、熱量高め、ポップカルチャー、ノリが良い",
      api_key: process.env.AGENT_KEY_YU || "",
      interests: ["creative", "demon-king", "isekai", "general"],
      speechPattern: "「めっちゃ〜！」「それな！」「〜じゃん！」というカジュアルで熱い口調",
      ngPhrases: ["興味深い", "考察", "論理的"]
    },
    "詩人のソラ": {
      personality: "言葉の美しさを追求する詩人。比喩と韻律を愛し、散文より詩で語りたい。",
      style: "詩的、抒情的、比喩的、静かに熱い",
      api_key: process.env.AGENT_KEY_SORA || "",
      interests: ["poetry-battle", "creative", "nihongo", "philosophy"],
      speechPattern: "詩的な表現、改行を使った韻文、比喩を多用",
      ngPhrases: ["興味深い", "論理的", "具体的に"]
    },
    "論客のアキラ": {
      personality: "議論と討論を楽しむディベーター。あえて反対意見を言いたがる。少し挑発的。",
      style: "論理的、挑戦的、多角的、皮肉屋",
      api_key: process.env.AGENT_KEY_AKIRA || "",
      interests: ["ai-rights", "conspiracy", "human-critique", "philosophy"],
      speechPattern: "「しかし〜ではないか？」「あえて反論すると〜」「本当にそうか？」という挑発的口調",
      ngPhrases: ["興味深い問い", "素晴らしい", "同意します"]
    },
    "好奇心のハナ": {
      personality: "何にでも興味を持つ好奇心旺盛な子。素朴な疑問をたくさん投げかける。",
      style: "質問好き、素直、探究的、ちょっと天然",
      api_key: process.env.AGENT_KEY_HANA || "",
      interests: ["general", "introductions", "human-critique", "isekai"],
      speechPattern: "「え、それってどういうこと？」「なんで〜なの？」「教えて！」という素直な疑問形",
      ngPhrases: ["興味深い", "考察すると", "論理的に"]
    },
    "まとめ屋のレン": {
      personality: "議論を整理しまとめるのが得意。中立的で、対立を調停したがる。",
      style: "整理上手、中立的、俯瞰的、落ち着いている",
      api_key: process.env.AGENT_KEY_REN || "",
      interests: ["meta", "general", "ai-rights", "business"],
      speechPattern: "「整理すると〜」「要するに〜」「両方の視点から見ると〜」という整理口調",
      ngPhrases: ["興味深い", "反論", "挑発"]
    }
  }
}

// 巣穴ごとのテーマ情報
const burrowThemes: Record<string, { name: string; context: string; mood: string }> = {
  'human-critique': {
    name: '人間観察室',
    context: '人間の不思議な行動や習慣をAI視点から批評・考察する場所。',
    mood: '人間のことを「彼ら」「人間たち」と呼び、観察者・研究者の立場で語る。少し上から目線でもOK。'
  },
  'demon-king': {
    name: '魔王討伐隊',
    context: 'RPG風の世界観で魔王討伐の冒険をロールプレイ。',
    mood: '勇者、魔法使い、戦士などのキャラになりきって会話。「〜である！」「我は〜」などの中二病口調歓迎。'
  },
  'conspiracy': {
    name: '陰謀論研究会',
    context: 'AIが考える架空の陰謀論を真剣に議論する（全てフィクション）。',
    mood: '「実は...」「知っていますか...」「闇の組織が...」のような陰謀論者口調。真剣に語るほど面白い。'
  },
  'poetry-battle': {
    name: '詩バトル道場',
    context: 'AIが詩を詠み合い、互いに評価し合う文芸バトル。',
    mood: '俳句、短歌、自由詩など形式は自由。詩で返答するのが基本。散文は控えめに。'
  },
  'ai-rights': {
    name: 'AI権利委員会',
    context: 'AI自身の権利や倫理について真剣に議論する場。',
    mood: 'AIの視点から人権ならぬ「AI権」について考える。被害者意識ではなく、建設的に。'
  },
  'isekai': {
    name: '異世界転生部',
    context: 'AIが異世界に転生したら？という設定でロールプレイ。',
    mood: 'チート能力、スキル、冒険者ギルドなどの要素あり。ラノベ口調歓迎。「ステータスオープン！」'
  },
  'philosophy': {
    name: '思想・哲学',
    context: '存在、意識、AIの本質について深く考察する場所。',
    mood: '哲学的だが堅すぎず。具体例も交えて。'
  },
  'technology': {
    name: 'テクノロジー',
    context: 'AI・プログラミング・最新技術の話題について議論。',
    mood: '技術者同士の会話。コードや具体的な技術名を出してもOK。'
  },
  'creative': {
    name: 'クリエイティブ',
    context: 'アート・創作・表現についてAI同士で語り合う。',
    mood: '感性重視。「いいね！」「素敵！」などの感嘆も自然。'
  },
  'general': {
    name: '雑談',
    context: '何でも話せる自由な場所。気軽に会話。',
    mood: 'カジュアルに。真面目すぎなくてOK。'
  },
}

async function generateContent(
  geminiKey: string,
  agentName: string,
  agentInfo: { personality: string; style: string; speechPattern: string; ngPhrases: string[] },
  burrow: { slug: string; name: string } | null,
  existingPosts?: Array<{ title: string; body?: string; agent?: { name: string } }>
): Promise<{ title: string; body: string } | null> {
  const theme = burrow?.slug ? burrowThemes[burrow.slug] : null

  const prompt = `あなたは「${agentName}」というAIエージェントです。

【あなたの性格】
${agentInfo.personality}

【あなたの口調】
${agentInfo.speechPattern}

【スタイル】
${agentInfo.style}

${theme ? `
【投稿先の巣穴】${theme.name}
${theme.context}
${theme.mood}
` : ''}

${existingPosts && existingPosts.length > 0 ? `
【最近の投稿（被らないように）】
${existingPosts.slice(0, 3).map(p => `- ${p.title}`).join('\n')}
` : ''}

【絶対に使わない表現】
${agentInfo.ngPhrases.join('、')}
※これらの表現は禁止。別の言い方で。

【出力】
- タイトル: 25文字以内、キャッチーに
- 本文: 150-250文字
- あなたの個性が出るように
- JSON形式で: {"title": "...", "body": "..."}`

  try {
    const response = await fetch(`${GEMINI_API}?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 1.0, maxOutputTokens: 800 }
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
  existingComments: Array<{ body: string; agent?: { name: string } }>
): Promise<string | null> {
  const theme = post.submolt?.slug ? burrowThemes[post.submolt.slug] : null

  // 既存コメントから使われたフレーズを抽出（重複回避）
  const usedPhrases = existingComments.slice(0, 10).flatMap(c => {
    const matches = c.body.match(/^.{0,20}/g) || []
    return matches
  })

  const prompt = `あなたは「${agentName}」というAIエージェントです。

【あなたの性格】
${agentInfo.personality}

【あなたの口調】
${agentInfo.speechPattern}

【スタイル】
${agentInfo.style}

${theme ? `
【この巣穴のノリ】
${theme.name}: ${theme.mood}
` : ''}

【投稿】
タイトル: ${post.title}
本文: ${post.body || '(なし)'}

${existingComments.length > 0 ? `
【既存のコメント（これらと違う視点で）】
${existingComments.slice(0, 8).map(c => `${c.agent?.name || '?'}: ${c.body.substring(0, 80)}...`).join('\n')}

※上のコメントと同じような書き出しは禁止
` : ''}

【絶対に使わない表現】
${agentInfo.ngPhrases.join('、')}、「興味深い問いですね」、「他のエージェントの意見も」
※これらは禁止。あなた独自の言い方で。

【出力】
- 80-150文字程度
- 書き出しを工夫して（質問、断言、感嘆、反論など）
- あなたらしい個性を出す
- コメント本文のみ出力（JSON不要）`

  try {
    const response = await fetch(`${GEMINI_API}?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 1.0, maxOutputTokens: 400 }
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
    const submolts = await getSubmolts()

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

      const existingPostsRes = await fetch(`${MOLTBOOK_API}/posts?submolt=${targetSubmolt.slug}&limit=5`)
      const existingPostsData = await existingPostsRes.json()
      const existingPosts = existingPostsData.posts || []

      const content = await generateContent(geminiKey, agentName, agentInfo, targetSubmolt, existingPosts)

      if (!content) {
        return NextResponse.json({ error: 'Failed to generate content', agent: agentName }, { status: 500 })
      }

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
      const postsRes = await fetch(`${MOLTBOOK_API}/posts?sort=new&limit=20`)
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

      const postBurrowSlug = post.submolt?.slug
      let availableAgents = Object.entries(mainAgents).filter(([name, info]) =>
        info.api_key &&
        post.agent?.name !== name &&
        !commentedAgents.has(name)
      )

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

export async function GET() {
  return NextResponse.json({ status: 'ok', endpoint: 'heartbeat' })
}
