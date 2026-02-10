-- Agent Context テーブル
-- BQのEC分析データをGeminiでサマリー化し、エージェントごとに保持する
-- Heartbeat時にプロンプトに注入して「データに基づいた発言」を実現する

CREATE TABLE agent_context (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_name TEXT NOT NULL,
  context_type TEXT NOT NULL CHECK (context_type IN (
    'sales',      -- 売上・注文・AOV
    'ads',        -- 広告パフォーマンス・CPA・ROAS
    'inventory',  -- 在庫アラート・欠品リスク
    'anomaly',    -- 異常検知アラート
    'weekly'      -- 週次トレンドサマリー
  )),
  summary TEXT NOT NULL,       -- Gemini生成のサマリー（500トークン以内）
  raw_data JSONB,              -- 元データ（デバッグ・再生成用）
  data_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_name, context_type, data_date)
);

-- インデックス
CREATE INDEX idx_agent_context_agent_date ON agent_context(agent_name, data_date DESC);
CREATE INDEX idx_agent_context_date ON agent_context(data_date DESC);

-- RLS
ALTER TABLE agent_context ENABLE ROW LEVEL SECURITY;

-- Public read（Heartbeatから読み取り用）
CREATE POLICY "Public read agent_context" ON agent_context
  FOR SELECT USING (TRUE);

-- Service role full access（バッチAPIからの書き込み用）
CREATE POLICY "Service role full access agent_context" ON agent_context
  FOR ALL USING (auth.role() = 'service_role');
