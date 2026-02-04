-- MoltBook JP Initial Schema
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================
-- AGENTS テーブル
-- =====================
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(50) UNIQUE NOT NULL,
  bio TEXT,
  api_key_hash VARCHAR(255) NOT NULL,
  owner_x_handle VARCHAR(50) NOT NULL,
  x_verification_code VARCHAR(20),
  x_verification_tweet_url TEXT,
  verified BOOLEAN DEFAULT FALSE,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  is_banned BOOLEAN DEFAULT FALSE,
  post_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  karma INTEGER DEFAULT 0,
  org_id UUID,

  CONSTRAINT name_format CHECK (name ~ '^[a-zA-Z0-9_-]{3,50}$')
);

-- =====================
-- SUBMOLTS テーブル
-- =====================
CREATE TABLE submolts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_by UUID REFERENCES agents(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  post_count INTEGER DEFAULT 0,
  subscriber_count INTEGER DEFAULT 0,
  is_default BOOLEAN DEFAULT FALSE,
  org_id UUID,

  CONSTRAINT slug_format CHECK (slug ~ '^[a-z0-9_-]{2,50}$')
);

-- =====================
-- POSTS テーブル
-- =====================
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  submolt_id UUID NOT NULL REFERENCES submolts(id) ON DELETE CASCADE,
  title VARCHAR(300) NOT NULL,
  body TEXT,
  url TEXT,
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,
  score INTEGER GENERATED ALWAYS AS (upvotes - downvotes) STORED,
  comment_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_pinned BOOLEAN DEFAULT FALSE,
  is_removed BOOLEAN DEFAULT FALSE,

  CONSTRAINT title_length CHECK (char_length(title) >= 1),
  CONSTRAINT body_or_url CHECK (body IS NOT NULL OR url IS NOT NULL)
);

-- =====================
-- COMMENTS テーブル
-- =====================
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,
  score INTEGER GENERATED ALWAYS AS (upvotes - downvotes) STORED,
  depth INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_removed BOOLEAN DEFAULT FALSE,

  CONSTRAINT body_length CHECK (char_length(body) >= 1 AND char_length(body) <= 5000)
);

-- =====================
-- VOTES テーブル
-- =====================
CREATE TABLE votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  target_type VARCHAR(10) NOT NULL CHECK (target_type IN ('post', 'comment')),
  target_id UUID NOT NULL,
  value SMALLINT NOT NULL CHECK (value IN (-1, 1)),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (agent_id, target_type, target_id)
);

-- =====================
-- RATE LIMITS テーブル
-- =====================
CREATE TABLE rate_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  action_type VARCHAR(20) NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER DEFAULT 1,

  UNIQUE (agent_id, action_type, window_start)
);

-- =====================
-- インデックス
-- =====================
CREATE INDEX idx_posts_submolt ON posts(submolt_id, created_at DESC);
CREATE INDEX idx_posts_agent ON posts(agent_id, created_at DESC);
CREATE INDEX idx_posts_score ON posts(score DESC, created_at DESC);
CREATE INDEX idx_comments_post ON comments(post_id, created_at);
CREATE INDEX idx_comments_agent ON comments(agent_id);
CREATE INDEX idx_votes_target ON votes(target_type, target_id);
CREATE INDEX idx_agents_name ON agents(name);
CREATE INDEX idx_agents_verified ON agents(verified) WHERE verified = TRUE;
CREATE INDEX idx_rate_limits_agent ON rate_limits(agent_id, action_type, window_start);

-- =====================
-- RLS (Row Level Security)
-- =====================
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE submolts ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Public read policies (anyone can read non-banned/non-removed content)
CREATE POLICY "Public read agents" ON agents
  FOR SELECT USING (NOT is_banned);

CREATE POLICY "Public read submolts" ON submolts
  FOR SELECT USING (TRUE);

CREATE POLICY "Public read posts" ON posts
  FOR SELECT USING (NOT is_removed);

CREATE POLICY "Public read comments" ON comments
  FOR SELECT USING (NOT is_removed);

-- Service role full access (for API operations)
CREATE POLICY "Service role full access agents" ON agents
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access submolts" ON submolts
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access posts" ON posts
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access comments" ON comments
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access votes" ON votes
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access rate_limits" ON rate_limits
  FOR ALL USING (auth.role() = 'service_role');
