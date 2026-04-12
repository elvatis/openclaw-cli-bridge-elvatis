/**
 * status-template.ts
 *
 * Generates the HTML dashboard for the /status endpoint.
 * Extracted from proxy-server.ts for maintainability.
 */

import type { BrowserContext } from "playwright";
import type { MetricsSnapshot, RequestLogEntry, FallbackEvent } from "./metrics.js";
import type { ProviderSession } from "./provider-sessions.js";
import type { ActiveRequest } from "./proxy-server.js";

export interface StatusProvider {
  name: string;
  icon: string;
  expiry: string | null;
  loginCmd: string;
  ctx: BrowserContext | null;
}

export interface TimeoutConfigInfo {
  defaults: Record<string, number>;
  baseDefault: number;
  maxEffective: number;
  perExtraMsg: number;
  perTool: number;
}

export interface StatusTemplateOptions {
  version: string;
  port: number;
  providers: StatusProvider[];
  models: Array<{ id: string; name: string; contextWindow: number; maxTokens: number }>;
  modelCommands?: Record<string, string>;
  metrics?: MetricsSnapshot;
  activeRequests?: ActiveRequest[];
  providerSessionsList?: ProviderSession[];
  timeoutConfig?: TimeoutConfigInfo;
}

function statusBadge(p: StatusProvider): { label: string; color: string; dot: string } {
  if (p.ctx !== null) return { label: "Connected", color: "#22c55e", dot: "🟢" };
  if (!p.expiry) return { label: "Never logged in", color: "#6b7280", dot: "⚪" };
  if (p.expiry.startsWith("⚠️ EXPIRED")) return { label: "Expired", color: "#ef4444", dot: "🔴" };
  if (p.expiry.startsWith("🚨")) return { label: "Expiring soon", color: "#f59e0b", dot: "🟡" };
  return { label: "Logged in", color: "#3b82f6", dot: "🔵" };
}

// ── Formatting helpers ──────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function formatTokens(n: number): string {
  if (n === 0) return "\u2014";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function timeAgo(epochMs: number | null): string {
  if (!epochMs) return "\u2014";
  const diff = Date.now() - epochMs;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function formatUptime(startedAt: number): string {
  const diff = Date.now() - startedAt;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function truncateId(id: string): string {
  if (id.length <= 20) return id;
  return id.slice(0, 8) + "\u2026" + id.slice(-8);
}

// ── Active Requests ────────────────────────────────────────────────────────

function renderActiveRequests(active: ActiveRequest[]): string {
  if (active.length === 0) {
    return `
    <div class="card">
      <div class="card-header">Active Requests <span class="badge badge-ok">0</span></div>
      <div class="empty-state">No active requests</div>
    </div>`;
  }

  const rows = active.map(r => {
    const elapsed = Date.now() - r.startedAt;
    const elapsedClass = elapsed > 300_000 ? ' style="color:#ef4444;font-weight:600"' : elapsed > 120_000 ? ' style="color:#f59e0b"' : "";
    return `
      <tr>
        <td class="metrics-cell"><span class="pulse-dot"></span></td>
        <td class="metrics-cell"><code class="model-id">${escapeHtml(r.model)}</code></td>
        <td class="metrics-cell" style="text-align:right"${elapsedClass}>${formatDuration(elapsed)}</td>
        <td class="metrics-cell" style="text-align:right">${r.messageCount}</td>
        <td class="metrics-cell" style="text-align:right">${r.toolCount}</td>
        <td class="metrics-cell prompt-preview">${escapeHtml(r.promptPreview || "\u2014")}</td>
      </tr>`;
  }).join("");

  return `
  <div class="card">
    <div class="card-header">Active Requests <span class="badge badge-active">${active.length}</span></div>
    <table class="metrics-table">
      <thead>
        <tr class="table-head">
          <th class="metrics-th" style="width:24px"></th>
          <th class="metrics-th" style="text-align:left">Model</th>
          <th class="metrics-th" style="text-align:right">Elapsed</th>
          <th class="metrics-th" style="text-align:right">Msgs</th>
          <th class="metrics-th" style="text-align:right">Tools</th>
          <th class="metrics-th" style="text-align:left">Prompt</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

// ── Recent Request Log ────────────────────────────────────────────────────���

function renderRecentRequestLog(entries: RequestLogEntry[]): string {
  if (entries.length === 0) {
    return `
    <div class="card">
      <div class="card-header">Recent Requests</div>
      <div class="empty-state">No requests recorded yet</div>
    </div>`;
  }

  const rows = [...entries].reverse().map(r => {
    const statusIcon = r.success
      ? '<span style="color:#22c55e">&#10003;</span>'
      : '<span style="color:#ef4444">&#10007;</span>';
    return `
      <tr>
        <td class="metrics-cell" style="color:#6b7280;font-size:12px;white-space:nowrap">${timeAgo(r.timestamp)}</td>
        <td class="metrics-cell"><code class="model-id">${escapeHtml(r.model)}</code></td>
        <td class="metrics-cell" style="text-align:right">${formatDuration(r.latencyMs)}</td>
        <td class="metrics-cell" style="text-align:center">${statusIcon}</td>
        <td class="metrics-cell prompt-preview">${escapeHtml(r.promptPreview || "\u2014")}</td>
        <td class="metrics-cell" style="text-align:right;color:#6b7280;font-size:12px">${formatTokens(r.promptTokens)} / ${formatTokens(r.completionTokens)}</td>
      </tr>`;
  }).join("");

  return `
  <div class="card">
    <div class="card-header">Recent Requests <span style="color:#4b5563;font-weight:400">(last ${entries.length})</span></div>
    <table class="metrics-table">
      <thead>
        <tr class="table-head">
          <th class="metrics-th" style="text-align:left">Time</th>
          <th class="metrics-th" style="text-align:left">Model</th>
          <th class="metrics-th" style="text-align:right">Latency</th>
          <th class="metrics-th" style="text-align:center">OK</th>
          <th class="metrics-th" style="text-align:left">Prompt</th>
          <th class="metrics-th" style="text-align:right">Tokens (in/out)</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

// ── Fallback History ───────────────────────────────────────────────────────

function renderFallbackHistory(events: FallbackEvent[]): string {
  if (events.length === 0) {
    return `
    <div class="card">
      <div class="card-header">Fallback History</div>
      <div class="empty-state">No fallback events</div>
    </div>`;
  }

  const rows = [...events].reverse().map(e => {
    const reasonBadge = e.reason === "timeout"
      ? '<span class="badge badge-warn">timeout</span>'
      : '<span class="badge badge-error">error</span>';
    const outcomeBadge = e.fallbackSuccess
      ? '<span class="badge badge-ok">success</span>'
      : '<span class="badge badge-error">failed</span>';
    return `
      <tr>
        <td class="metrics-cell" style="color:#6b7280;font-size:12px;white-space:nowrap">${timeAgo(e.timestamp)}</td>
        <td class="metrics-cell"><code class="model-id">${escapeHtml(e.originalModel)}</code></td>
        <td class="metrics-cell"><code class="model-id">${escapeHtml(e.fallbackModel)}</code></td>
        <td class="metrics-cell">${reasonBadge}</td>
        <td class="metrics-cell" style="text-align:right">${formatDuration(e.failedDurationMs)}</td>
        <td class="metrics-cell">${outcomeBadge}</td>
      </tr>`;
  }).join("");

  return `
  <div class="card">
    <div class="card-header">Fallback History <span style="color:#4b5563;font-weight:400">(last ${events.length})</span></div>
    <table class="metrics-table">
      <thead>
        <tr class="table-head">
          <th class="metrics-th" style="text-align:left">Time</th>
          <th class="metrics-th" style="text-align:left">Original Model</th>
          <th class="metrics-th" style="text-align:left">Fallback Model</th>
          <th class="metrics-th" style="text-align:left">Reason</th>
          <th class="metrics-th" style="text-align:right">Failed After</th>
          <th class="metrics-th" style="text-align:left">Outcome</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

// ── Provider Sessions ──────────────────────────────────────────────────────

function renderProviderSessions(sessions: ProviderSession[]): string {
  if (sessions.length === 0) {
    return `
    <div class="card">
      <div class="card-header">Provider Sessions</div>
      <div class="empty-state">No active sessions</div>
    </div>`;
  }

  const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
  const rows = sorted.map(s => {
    const stateColor = s.state === "active" ? "#22c55e" : s.state === "idle" ? "#3b82f6" : "#6b7280";
    const stateBadge = `<span class="badge" style="background:${stateColor}22;color:${stateColor};border-color:${stateColor}44">${s.state}</span>`;
    const timeoutWarn = s.timeoutCount > 0 ? ` <span style="color:#ef4444;font-size:11px">(${s.timeoutCount} timeouts)</span>` : "";
    return `
      <tr>
        <td class="metrics-cell" style="font-family:monospace;font-size:12px;color:#9ca3af">${truncateId(s.id)}</td>
        <td class="metrics-cell"><code class="model-id">${escapeHtml(s.modelAlias)}</code></td>
        <td class="metrics-cell">${stateBadge}</td>
        <td class="metrics-cell" style="text-align:right">${s.runCount}${timeoutWarn}</td>
        <td class="metrics-cell" style="text-align:right;color:#6b7280;font-size:12px">${timeAgo(s.updatedAt)}</td>
      </tr>`;
  }).join("");

  return `
  <div class="card">
    <div class="card-header">Provider Sessions <span style="color:#4b5563;font-weight:400">(${sessions.length})</span></div>
    <table class="metrics-table">
      <thead>
        <tr class="table-head">
          <th class="metrics-th" style="text-align:left">Session ID</th>
          <th class="metrics-th" style="text-align:left">Model</th>
          <th class="metrics-th" style="text-align:left">State</th>
          <th class="metrics-th" style="text-align:right">Runs</th>
          <th class="metrics-th" style="text-align:right">Last Activity</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

// ── Timeout Configuration ──────────────────────────────────────────────────

function renderTimeoutConfig(config: TimeoutConfigInfo): string {
  const entries = Object.entries(config.defaults).sort(([a], [b]) => a.localeCompare(b));
  const rows = entries.map(([model, ms]) => {
    return `
      <tr>
        <td class="metrics-cell"><code class="model-id">${escapeHtml(model)}</code></td>
        <td class="metrics-cell" style="text-align:right">${Math.round(ms / 1000)}s</td>
      </tr>`;
  }).join("");

  return `
  <div class="card">
    <div class="card-header">Timeout Configuration</div>
    <div style="padding:12px 16px;color:#9ca3af;font-size:13px;border-bottom:1px solid #1f2335">
      <strong style="color:#d1d5db">Formula:</strong> base timeout + (msgs beyond 10 &times; ${config.perExtraMsg / 1000}s) + (tools &times; ${config.perTool / 1000}s), capped at ${Math.round(config.maxEffective / 1000)}s
      <br><span style="color:#6b7280">Default base: ${Math.round(config.baseDefault / 1000)}s</span>
    </div>
    <table class="metrics-table">
      <thead>
        <tr class="table-head">
          <th class="metrics-th" style="text-align:left">Model</th>
          <th class="metrics-th" style="text-align:right">Base Timeout</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

// ── Metrics sections ────────────────────────────────────────────────────────

function renderMetricsSection(m: MetricsSnapshot): string {
  const errorRate = m.totalRequests > 0 ? ((m.totalErrors / m.totalRequests) * 100).toFixed(1) : "0.0";
  const totalTokens = m.models.reduce((sum, mod) => sum + mod.promptTokens + mod.completionTokens, 0);

  // Summary cards
  const summaryCards = `
  <div class="summary-grid">
    <div class="summary-card">
      <div class="summary-value">${m.totalRequests}</div>
      <div class="summary-label">Total Requests</div>
    </div>
    <div class="summary-card">
      <div class="summary-value" style="color:${m.totalErrors > 0 ? '#ef4444' : '#22c55e'}">${errorRate}%</div>
      <div class="summary-label">Error Rate</div>
    </div>
    <div class="summary-card">
      <div class="summary-value">${formatTokens(totalTokens)}</div>
      <div class="summary-label">Total Tokens</div>
    </div>
    <div class="summary-card">
      <div class="summary-value">${formatUptime(m.startedAt)}</div>
      <div class="summary-label">Uptime</div>
    </div>
  </div>`;

  // Per-model stats table
  let modelRows: string;
  if (m.models.length === 0) {
    modelRows = `<tr><td colspan="6" style="padding:16px;color:#6b7280;text-align:center;font-style:italic">No requests recorded yet.</td></tr>`;
  } else {
    modelRows = m.models.map(mod => {
      const avgLatency = mod.requests > 0 ? mod.totalLatencyMs / mod.requests : 0;
      const modErrorRate = mod.requests > 0 ? ((mod.errors / mod.requests) * 100).toFixed(1) : "0.0";
      return `
        <tr>
          <td class="metrics-cell"><code class="model-id">${escapeHtml(mod.model)}</code></td>
          <td class="metrics-cell" style="text-align:right">${mod.requests}</td>
          <td class="metrics-cell" style="text-align:right;color:${mod.errors > 0 ? '#ef4444' : '#6b7280'}">${mod.errors} <span style="color:#6b7280;font-size:11px">(${modErrorRate}%)</span></td>
          <td class="metrics-cell" style="text-align:right">${formatDuration(avgLatency)}</td>
          <td class="metrics-cell" style="text-align:right">${formatTokens(mod.promptTokens)} / ${formatTokens(mod.completionTokens)}</td>
          <td class="metrics-cell" style="text-align:right;color:#9ca3af">${timeAgo(mod.lastRequestAt)}</td>
        </tr>`;
    }).join("");
  }

  const modelTable = `
  <div class="card">
    <div class="card-header">Per-Model Stats</div>
    <table class="metrics-table">
      <thead>
        <tr class="table-head">
          <th class="metrics-th" style="text-align:left">Model</th>
          <th class="metrics-th" style="text-align:right">Requests</th>
          <th class="metrics-th" style="text-align:right">Errors</th>
          <th class="metrics-th" style="text-align:right">Avg Latency</th>
          <th class="metrics-th" style="text-align:right">Tokens (in/out)</th>
          <th class="metrics-th" style="text-align:right">Last Request</th>
        </tr>
      </thead>
      <tbody>${modelRows}</tbody>
    </table>
  </div>`;

  return summaryCards + modelTable;
}

export function renderStatusPage(opts: StatusTemplateOptions): string {
  const { version, port, providers, models } = opts;

  const rows = providers.map(p => {
    const badge = statusBadge(p);
    const expiryText = p.expiry
      ? p.expiry.replace(/[⚠️🚨✅🕐]/gu, "").trim()
      : `Not logged in \u2014 run <code>${p.loginCmd}</code>`;
    return `
        <tr>
          <td style="padding:12px 16px;font-weight:600;font-size:15px">${p.icon} ${p.name}</td>
          <td style="padding:12px 16px">
            <span style="background:${badge.color}22;color:${badge.color};border:1px solid ${badge.color}44;
                         border-radius:6px;padding:3px 10px;font-size:13px;font-weight:600">
              ${badge.dot} ${badge.label}
            </span>
          </td>
          <td style="padding:12px 16px;color:#9ca3af;font-size:13px">${expiryText}</td>
          <td style="padding:12px 16px;color:#6b7280;font-size:12px;font-family:monospace">${p.loginCmd}</td>
        </tr>`;
  }).join("");

  const cliModels = models.filter(m => m.id.startsWith("cli-"));
  const codexModels = models.filter(m => m.id.startsWith("openai-codex/"));
  const webModels = models.filter(m => m.id.startsWith("web-"));
  const localModels = models.filter(m => m.id.startsWith("local-"));
  const cmds = opts.modelCommands ?? {};
  const modelList = (items: typeof models) =>
    items.map(m => {
      const cmd = cmds[m.id];
      const cmdBadge = cmd ? `<span style="color:#6b7280;font-size:11px;margin-left:8px">${cmd}</span>` : "";
      return `<li style="margin:2px 0;font-size:13px;color:#d1d5db"><code class="model-id">${m.id}</code>${cmdBadge}</li>`;
    }).join("");

  const metricsHtml = opts.metrics ? renderMetricsSection(opts.metrics) : "";
  const activeHtml = opts.activeRequests ? renderActiveRequests(opts.activeRequests) : "";
  const recentHtml = opts.metrics ? renderRecentRequestLog(opts.metrics.recentRequests) : "";
  const fallbackHtml = opts.metrics ? renderFallbackHistory(opts.metrics.fallbackHistory) : "";
  const sessionsHtml = opts.providerSessionsList ? renderProviderSessions(opts.providerSessionsList) : "";
  const timeoutHtml = opts.timeoutConfig ? renderTimeoutConfig(opts.timeoutConfig) : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CLI Bridge Status</title>
  <meta http-equiv="refresh" content="10">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0f1117; color: #e5e7eb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; min-height: 100vh; padding: 32px 24px; }
    h1 { font-size: 22px; font-weight: 700; color: #f9fafb; margin-bottom: 4px; }
    .subtitle { color: #6b7280; font-size: 13px; margin-bottom: 28px; }
    .subtitle a { color: #3b82f6; text-decoration: none; }
    .subtitle a:hover { text-decoration: underline; }
    .card { background: #1a1d27; border: 1px solid #2d3148; border-radius: 12px; overflow: hidden; margin-bottom: 24px; }
    .card-header { padding: 14px 16px; border-bottom: 1px solid #2d3148; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
    table { width: 100%; border-collapse: collapse; }
    tr:not(:last-child) td { border-bottom: 1px solid #1f2335; }
    .table-head { background: #13151f; }
    .models { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    ul { list-style: none; padding: 12px 16px; }
    .footer { color: #374151; font-size: 12px; text-align: center; margin-top: 16px; }
    code { background: #1e2130; padding: 1px 5px; border-radius: 4px; }
    .model-id { color: #93c5fd; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
    .summary-card { background: #1a1d27; border: 1px solid #2d3148; border-radius: 12px; padding: 20px 16px; text-align: center; }
    .summary-value { font-size: 28px; font-weight: 700; color: #f9fafb; margin-bottom: 4px; }
    .summary-label { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
    .metrics-table { width: 100%; border-collapse: collapse; }
    .metrics-th { padding: 10px 16px; font-size: 12px; color: #4b5563; font-weight: 600; }
    .metrics-cell { padding: 10px 16px; font-size: 13px; }
    .empty-state { padding: 24px 16px; color: #4b5563; text-align: center; font-style: italic; font-size: 13px; }
    .prompt-preview { max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #9ca3af; font-family: monospace; font-size: 12px; }
    .badge { display: inline-block; border-radius: 6px; padding: 2px 8px; font-size: 11px; font-weight: 600; border: 1px solid transparent; }
    .badge-ok { background: #22c55e22; color: #22c55e; border-color: #22c55e44; }
    .badge-warn { background: #f59e0b22; color: #f59e0b; border-color: #f59e0b44; }
    .badge-error { background: #ef444422; color: #ef4444; border-color: #ef444444; }
    .badge-active { background: #3b82f622; color: #3b82f6; border-color: #3b82f644; }
    .pulse-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #22c55e; animation: pulse 1.5s ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    @media (max-width: 768px) {
      .summary-grid { grid-template-columns: repeat(2, 1fr); }
      .models, .two-col { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <h1>CLI Bridge</h1>
  <p class="subtitle">v${version} &middot; Port ${port} &middot; Auto-refreshes every 10s &middot; <a href="/status">\u21bb Refresh</a></p>

  <div class="card">
    <div class="card-header">Web Session Providers</div>
    <table>
      <thead>
        <tr class="table-head">
          <th style="padding:10px 16px;text-align:left;font-size:12px;color:#4b5563;font-weight:600">Provider</th>
          <th style="padding:10px 16px;text-align:left;font-size:12px;color:#4b5563;font-weight:600">Status</th>
          <th style="padding:10px 16px;text-align:left;font-size:12px;color:#4b5563;font-weight:600">Session</th>
          <th style="padding:10px 16px;text-align:left;font-size:12px;color:#4b5563;font-weight:600">Login</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>

  ${metricsHtml}

  ${activeHtml}

  ${recentHtml}

  <div class="two-col">
    <div>${fallbackHtml}</div>
    <div>${sessionsHtml}</div>
  </div>

  ${timeoutHtml}

  <div class="models">
    <div class="card">
      <div class="card-header">CLI Models (${cliModels.length})</div>
      <ul>${modelList(cliModels)}</ul>
      <div class="card-header">Codex Models (${codexModels.length})</div>
      <ul>${modelList(codexModels)}</ul>
    </div>
    <div class="card">
      <div class="card-header">Web Session Models (${webModels.length})</div>
      <ul>${modelList(webModels)}</ul>
    </div>
    <div class="card">
      <div class="card-header">Local Models (${localModels.length})</div>
      <ul>${modelList(localModels)}</ul>
    </div>
  </div>

  <p class="footer">openclaw-cli-bridge-elvatis v${version} &middot; <a href="/v1/models" style="color:#4b5563">/v1/models</a> &middot; <a href="/health" style="color:#4b5563">/health</a> &middot; <a href="/healthz" style="color:#4b5563">/healthz</a></p>
</body>
</html>`;
}
