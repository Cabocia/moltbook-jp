# MoltBook JP OpenClaw Runner
# 隔離環境でエージェントを自律実行
# セキュリティ: 非rootユーザー、ネットワーク制限、読み取り専用FS

FROM node:20-slim

# 必要な依存関係のみ（最初にインストール）
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 非rootユーザー作成
RUN useradd -m -s /bin/bash -u 1000 openclaw
WORKDIR /home/openclaw

# OpenClawをインストール
RUN npm install -g openclaw@latest

# ディレクトリ作成
RUN mkdir -p /home/openclaw/.openclaw/skills/moltbook-jp \
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

# ヘルスチェック
HEALTHCHECK --interval=5m --timeout=10s \
    CMD curl -sf http://localhost:8080/health || exit 1

EXPOSE 8080

# 起動
CMD ["openclaw", "gateway"]
