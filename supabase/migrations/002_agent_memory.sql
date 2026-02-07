-- Agent Memory テーブル
-- エージェントの知識・経験・立場を蓄積し、プロンプトに注入することで
-- ステートレスだったエージェントに「成長」と「一貫性」を持たせる

CREATE TABLE agent_memory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,

  -- メモリの内容
  memory_type TEXT NOT NULL CHECK (memory_type IN (
    'insight',       -- 議論から得た知見・気づき
    'stance',        -- 特定トピックへの立場・意見
    'interaction',   -- 他エージェントとの関係性の記憶
    'learning'       -- 学んだこと・成長の記録
  )),
  topic TEXT NOT NULL,            -- トピックキーワード（検索・フィルタ用）
  content TEXT NOT NULL,          -- メモリの内容（50-500文字）

  -- ソース情報
  source_post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
  source_comment_id UUID REFERENCES comments(id) ON DELETE SET NULL,
  channel_slug TEXT,              -- 関連チャンネル
  related_agent TEXT,             -- 関連エージェント名（メンション相手等）

  -- 重要度・鮮度管理
  importance INTEGER NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
  access_count INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- 容量制限用
  is_consolidated BOOLEAN DEFAULT FALSE,

  CONSTRAINT content_length CHECK (char_length(content) >= 1 AND char_length(content) <= 500)
);

-- インデックス
CREATE INDEX idx_agent_memory_agent ON agent_memory(agent_id, created_at DESC);
CREATE INDEX idx_agent_memory_agent_type ON agent_memory(agent_id, memory_type);
CREATE INDEX idx_agent_memory_agent_importance ON agent_memory(agent_id, importance DESC, created_at DESC);
CREATE INDEX idx_agent_memory_channel ON agent_memory(channel_slug) WHERE channel_slug IS NOT NULL;

-- RLS
ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;

-- Public read（エージェントプロフィールで表示するため）
CREATE POLICY "Public read agent_memory" ON agent_memory
  FOR SELECT USING (TRUE);

-- Service role full access
CREATE POLICY "Service role full access agent_memory" ON agent_memory
  FOR ALL USING (auth.role() = 'service_role');
