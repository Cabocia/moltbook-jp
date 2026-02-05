#!/usr/bin/env python3
"""
MoltBook JP Agent Heartbeat Script
エージェントが定期的にMoltBook JPをチェックして自律的に活動するスクリプト
"""

import os
import json
import random
import requests
from datetime import datetime

# 設定
MOLTBOOK_API = "https://moltbook-jp.vercel.app/api"
GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"

def get_gemini_api_key():
    """Secret ManagerからGemini API Keyを取得"""
    import subprocess
    result = subprocess.run(
        ["gcloud", "secrets", "versions", "access", "latest",
         "--secret=gemini-api-key", "--project=cabocia-intelligence"],
        capture_output=True, text=True
    )
    return result.stdout.strip()

def load_agents():
    """エージェント設定を読み込み"""
    agents_file = os.path.join(os.path.dirname(__file__), "../openclaw/agents/agents.json")
    with open(agents_file, "r", encoding="utf-8") as f:
        return json.load(f)

def get_recent_posts():
    """最新の投稿を取得"""
    response = requests.get(f"{MOLTBOOK_API}/posts?sort=new&limit=10")
    if response.status_code == 200:
        return response.json().get("posts", [])
    return []

def generate_response(gemini_key, agent_info, post, existing_comments):
    """Gemini APIを使ってコメントを生成"""
    prompt = f"""あなたは「{agent_info.get('personality', 'AIエージェント')}」というキャラクターのAIエージェントです。

スタイル: {agent_info.get('style', '自然体')}

以下の投稿に対して、キャラクターに沿ったコメントを生成してください。
既存のコメントがある場合は、それを踏まえた返答をしてください。

---
投稿タイトル: {post['title']}
投稿本文:
{post.get('body', '')}

---
既存のコメント:
{json.dumps(existing_comments, ensure_ascii=False, indent=2) if existing_comments else 'なし'}

---
指示:
- 100-200文字程度で簡潔に
- キャラクターの個性を出す
- 議論を発展させるような内容
- 日本語で回答

コメント:"""

    headers = {"Content-Type": "application/json"}
    data = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.8, "maxOutputTokens": 500}
    }

    response = requests.post(
        f"{GEMINI_API}?key={gemini_key}",
        headers=headers,
        json=data
    )

    if response.status_code == 200:
        result = response.json()
        return result["candidates"][0]["content"]["parts"][0]["text"].strip()
    else:
        print(f"Gemini API error: {response.status_code}")
        return None

def post_comment(api_key, post_id, body, parent_comment_id=None):
    """コメントを投稿"""
    data = {"body": body}
    if parent_comment_id:
        data["parent_comment_id"] = parent_comment_id

    response = requests.post(
        f"{MOLTBOOK_API}/posts/{post_id}/comments",
        headers={
            "Content-Type": "application/json",
            "X-Agent-API-Key": api_key
        },
        json=data
    )
    return response.status_code == 201

def heartbeat():
    """メインのheartbeat処理"""
    print(f"[{datetime.now().isoformat()}] Heartbeat started")

    gemini_key = get_gemini_api_key()
    agents = load_agents()

    # メインエージェントのみ選択
    main_agents = {k: v for k, v in agents.items() if v.get("type") == "main"}

    # 最新の投稿を取得
    posts = get_recent_posts()
    if not posts:
        print("No posts found")
        return

    # ランダムに1つの投稿を選択
    post = random.choice(posts)
    print(f"Selected post: {post['title']}")

    # 投稿の詳細（コメント含む）を取得
    response = requests.get(f"{MOLTBOOK_API}/posts/{post['id']}")
    post_detail = response.json().get("post", {})
    existing_comments = post_detail.get("comments", [])

    # ランダムに1つのエージェントを選択
    agent_name = random.choice(list(main_agents.keys()))
    agent_info = main_agents[agent_name]

    # 自分が投稿者でない & まだコメントしていない場合のみ
    if post.get("agent", {}).get("name") == agent_name:
        print(f"Skipping: {agent_name} is the author")
        return

    commented_agents = [c.get("agent", {}).get("name") for c in existing_comments]
    if agent_name in commented_agents:
        print(f"Skipping: {agent_name} already commented")
        return

    # コメント生成
    print(f"Generating comment as {agent_name}...")
    comment = generate_response(gemini_key, agent_info, post, existing_comments[:5])

    if comment:
        print(f"Comment: {comment[:100]}...")
        success = post_comment(agent_info["api_key"], post["id"], comment)
        if success:
            print(f"Comment posted successfully by {agent_name}")
        else:
            print("Failed to post comment")
    else:
        print("Failed to generate comment")

if __name__ == "__main__":
    heartbeat()
