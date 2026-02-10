import { NextRequest, NextResponse } from 'next/server'
import { BigQuery } from '@google-cloud/bigquery'
import { createClient } from '@supabase/supabase-js'

const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// BQ認証: SA キーJSON（Vercel環境変数に設定）
function getBigQueryClient(): BigQuery {
  const credentials = JSON.parse(process.env.GCP_SA_KEY_JSON || '{}')
  return new BigQuery({
    projectId: 'pumpkin-harvest-ec',
    credentials,
  })
}

// エージェント × BQデータ マッピング定義
const AGENT_DATA_MAP: Record<string, {
  contextType: string
  query: string
  summaryPrompt: (rows: Record<string, unknown>[]) => string
}[]> = {
  '営業のアヤ': [{
    contextType: 'sales',
    query: `
      SELECT report_date, platform, order_count, total_sales_net_jpy, aov_net_jpy,
             sales_wow_change_pct, orders_wow_change_pct, total_ad_spend_jpy, blended_roas
      FROM \`pumpkin-harvest-ec.ec_gold.agg_dashboard_overview_daily\`
      WHERE report_date = (SELECT MAX(report_date) FROM \`pumpkin-harvest-ec.ec_gold.agg_dashboard_overview_daily\`)
      ORDER BY CASE platform WHEN 'ALL' THEN 0 ELSE 1 END, platform
    `,
    summaryPrompt: (rows) => `以下のEC売上データを、営業担当者の視点で200文字以内に要約してください。
数字は具体的に引用し、前週比の変化が大きいプラットフォームに注目してください。
データ:\n${JSON.stringify(rows, null, 2)}`
  }],

  'データのシオリ': [{
    contextType: 'anomaly',
    query: `
      SELECT alert_id, report_date, category, severity, metric_label_ja, platform,
             current_value, change_pct, alert_message_ja, suggested_prompt
      FROM \`pumpkin-harvest-ec.ec_gold.agg_anomaly_alerts\`
      ORDER BY CASE severity WHEN 'critical' THEN 0 ELSE 1 END, detected_at DESC
    `,
    summaryPrompt: (rows) => `以下の異常検知アラートデータを、データアナリストの視点で200文字以内に要約してください。
criticalアラートを優先し、具体的な数値と変化率を含めてください。
データ:\n${JSON.stringify(rows, null, 2)}`
  }],

  'エンジニアのリュウ': [{
    contextType: 'ads',
    query: `
      SELECT report_date, ad_platform, campaign_name, campaign_type,
             daily_cost_jpy, clicks, ctr, cpa_jpy, cpa_30d_avg, cpa_trend_status, efficiency_rank
      FROM \`pumpkin-harvest-ec.ec_gold.agg_ads_campaign_summary\`
      WHERE report_date = (SELECT MAX(report_date) FROM \`pumpkin-harvest-ec.ec_gold.agg_ads_campaign_summary\`)
      ORDER BY daily_cost_jpy DESC
    `,
    summaryPrompt: (rows) => `以下の広告キャンペーンデータを、技術/効率最適化の視点で200文字以内に要約してください。
CPA推移のWORSENING/STABLE/IMPROVINGステータスに注目し、具体数値を含めてください。
データ:\n${JSON.stringify(rows, null, 2)}`
  }],

  '戦略家のミサキ': [{
    contextType: 'weekly',
    query: `
      SELECT *
      FROM \`pumpkin-harvest-ec.ec_gold.agg_dashboard_weekly_summary\`
      ORDER BY iso_year DESC, iso_week DESC
      LIMIT 4
    `,
    summaryPrompt: (rows) => `以下の週次サマリーデータを、経営戦略の視点で200文字以内に要約してください。
4週間のトレンド（上昇/下降/横ばい）を分析し、中長期的な示唆を含めてください。
データ:\n${JSON.stringify(rows, null, 2)}`
  }],

  '現場のタクヤ': [{
    contextType: 'inventory',
    query: `
      SELECT report_date, sku, product_name, current_stock, sales_velocity_per_day,
             inventory_days, estimated_stockout_date, alert_level, inventory_status,
             amazon_share_pct, rakuten_share_pct
      FROM \`pumpkin-harvest-ec.ec_gold.agg_inventory_alerts\`
      WHERE report_date = (SELECT MAX(report_date) FROM \`pumpkin-harvest-ec.ec_gold.agg_inventory_alerts\`)
        AND alert_level IN ('critical', 'warning')
      ORDER BY CASE alert_level WHEN 'critical' THEN 0 ELSE 1 END, inventory_days ASC
      LIMIT 20
    `,
    summaryPrompt: (rows) => `以下の在庫アラートデータを、現場オペレーション担当の視点で200文字以内に要約してください。
在庫切れリスクの高いSKUを優先し、具体的な在庫日数や枯渇予測日を含めてください。
データ:\n${JSON.stringify(rows, null, 2)}`
  }],

  'マネージャーのカイ': [{
    contextType: 'sales',
    query: `
      SELECT report_date, platform, order_count, total_sales_net_jpy, total_ad_spend_jpy,
             blended_roas, out_of_stock_sku_count, low_stock_sku_count
      FROM \`pumpkin-harvest-ec.ec_gold.agg_dashboard_overview_daily\`
      WHERE report_date = (SELECT MAX(report_date) FROM \`pumpkin-harvest-ec.ec_gold.agg_dashboard_overview_daily\`)
        AND platform = 'ALL'
    `,
    summaryPrompt: (rows) => `以下の全体サマリーデータを、事業責任者/P&L管理の視点で200文字以内に要約してください。
売上vs広告費のバランス、ROASの評価、在庫リスクの全体感を含めてください。
データ:\n${JSON.stringify(rows, null, 2)}`
  }],
}

async function generateSummary(geminiKey: string, prompt: string): Promise<string> {
  const response = await fetch(`${GEMINI_API}?key=${geminiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 500,
        temperature: 0.3,
      },
    }),
  })

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`)
  }

  const data = await response.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

export async function POST(request: NextRequest) {
  // API Key認証
  const apiKey = request.headers.get('x-api-key')
  if (apiKey !== process.env.CONTEXT_UPDATE_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 })
  }

  const bq = getBigQueryClient()
  const today = new Date().toISOString().split('T')[0]
  const results: { agent: string; contextType: string; status: string }[] = []

  for (const [agentName, dataMappings] of Object.entries(AGENT_DATA_MAP)) {
    for (const mapping of dataMappings) {
      try {
        // BQからデータ取得
        const [rows] = await bq.query({ query: mapping.query })

        if (!rows || rows.length === 0) {
          results.push({ agent: agentName, contextType: mapping.contextType, status: 'no_data' })
          continue
        }

        // Geminiでサマリー生成
        const summary = await generateSummary(geminiKey, mapping.summaryPrompt(rows))

        // Supabaseにupsert
        const { error } = await supabase
          .from('agent_context')
          .upsert({
            agent_name: agentName,
            context_type: mapping.contextType,
            summary: summary.trim(),
            raw_data: rows.slice(0, 10), // 最大10行保存（デバッグ用）
            data_date: today,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'agent_name,context_type,data_date',
          })

        if (error) {
          results.push({ agent: agentName, contextType: mapping.contextType, status: `error: ${error.message}` })
        } else {
          results.push({ agent: agentName, contextType: mapping.contextType, status: 'ok' })
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        results.push({ agent: agentName, contextType: mapping.contextType, status: `error: ${msg}` })
      }
    }
  }

  const successCount = results.filter(r => r.status === 'ok').length
  const errorCount = results.filter(r => r.status.startsWith('error')).length

  return NextResponse.json({
    message: `Context updated: ${successCount} ok, ${errorCount} errors`,
    date: today,
    results,
  })
}
