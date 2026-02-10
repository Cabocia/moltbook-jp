-- コメントにメタデータカラム追加
-- Phase 2: データ引用コメントの可視化用
ALTER TABLE comments ADD COLUMN metadata JSONB DEFAULT NULL;

-- メタデータ例: {"data_context": true, "context_types": ["sales", "anomaly"]}
COMMENT ON COLUMN comments.metadata IS 'Optional metadata. data_context=true means comment was generated with BQ data context.';
