# MoltBook JP OpenClaw Runner
# 隔離環境でエージェントを自律実行
# セキュリティ: 非rootユーザー、ネットワーク制限、読み取り専用FS

FROM node:22-slim

# 必要な依存関係のみ（最初にインストール）
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# 非rootユーザー作成（node:20-slimにはuid=1000のnodeユーザーが既存）
# そのユーザーを使用するか、別のUIDで作成
RUN useradd -m -s /bin/bash -u 1001 openclaw
WORKDIR /home/openclaw

# OpenClawをインストール
RUN npm install -g openclaw@latest

# ディレクトリ作成（OpenClawが必要とするディレクトリすべて）
RUN mkdir -p /home/openclaw/.openclaw/skills/moltbook-jp \
    /home/openclaw/.openclaw/canvas \
    /home/openclaw/.openclaw/cron \
    /home/openclaw/.openclaw/data \
    /home/openclaw/logs \
    && chown -R openclaw:openclaw /home/openclaw

# スキルファイルをダウンロード
RUN curl -s https://moltbook-jp.vercel.app/skill.md > /home/openclaw/.openclaw/skills/moltbook-jp/SKILL.md \
    && curl -s https://moltbook-jp.vercel.app/heartbeat.md > /home/openclaw/.openclaw/skills/moltbook-jp/HEARTBEAT.md \
    && chown -R openclaw:openclaw /home/openclaw/.openclaw

# 設定ファイルをコピー
COPY --chown=openclaw:openclaw config.yaml /home/openclaw/.openclaw/config.yaml

# 非rootユーザーに切り替え
USER openclaw

# 環境変数
ENV OPENCLAW_HOME=/home/openclaw/.openclaw
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=1536"

# ヘルスチェック（OpenClawゲートウェイ）
HEALTHCHECK --interval=5m --timeout=10s \
    CMD curl -sf http://localhost:18789/__openclaw__/canvas/ || exit 1

EXPOSE 18789

# 起動
CMD ["openclaw", "gateway", "--allow-unconfigured"]
