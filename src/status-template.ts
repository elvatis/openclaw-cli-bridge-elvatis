/**
 * status-template.ts
 *
 * Generates the HTML dashboard for the /status endpoint.
 * v3.0: Sidebar navigation, section-based layout, JS polling, live log viewer.
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
  if (p.ctx !== null) return { label: "Connected", color: "#22c55e", dot: "\u{1F7E2}" };
  if (!p.expiry) return { label: "Never logged in", color: "#6b7280", dot: "\u26AA" };
  if (p.expiry.startsWith("\u26A0\uFE0F EXPIRED")) return { label: "Expired", color: "#ef4444", dot: "\u{1F534}" };
  if (p.expiry.startsWith("\u{1F6A8}")) return { label: "Expiring soon", color: "#f59e0b", dot: "\u{1F7E1}" };
  return { label: "Logged in", color: "#3b82f6", dot: "\u{1F535}" };
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

// ── Section renderers (each returns an HTML fragment) ──────────────────────

export function renderProviders(providers: StatusProvider[]): string {
  const rows = providers.map(p => {
    const badge = statusBadge(p);
    const expiryText = p.expiry
      ? p.expiry.replace(/[\u26A0\uFE0F\u{1F6A8}\u2705\u{1F550}]/gu, "").trim()
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

  return `
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
  </div>`;
}

export function renderActiveRequests(active: ActiveRequest[]): string {
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

export function renderRecentRequestLog(entries: RequestLogEntry[]): string {
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

export function renderFallbackHistory(events: FallbackEvent[]): string {
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

export function renderProviderSessions(sessions: ProviderSession[]): string {
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

export function renderTimeoutConfig(config: TimeoutConfigInfo): string {
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

export function renderMetricsSection(m: MetricsSnapshot): string {
  const errorRate = m.totalRequests > 0 ? ((m.totalErrors / m.totalRequests) * 100).toFixed(1) : "0.0";
  const totalTokens = m.models.reduce((sum, mod) => sum + mod.promptTokens + mod.completionTokens, 0);

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

function renderModels(
  models: StatusTemplateOptions["models"],
  modelCommands?: Record<string, string>,
): string {
  const cliModels = models.filter(m => m.id.startsWith("cli-"));
  const codexModels = models.filter(m => m.id.startsWith("openai-codex/"));
  const webModels = models.filter(m => m.id.startsWith("web-"));
  const localModels = models.filter(m => m.id.startsWith("local-"));
  const cmds = modelCommands ?? {};
  const modelList = (items: typeof models) =>
    items.map(m => {
      const cmd = cmds[m.id];
      const cmdBadge = cmd ? `<span style="color:#6b7280;font-size:11px;margin-left:8px">${cmd}</span>` : "";
      return `<li style="margin:2px 0;font-size:13px;color:#d1d5db"><code class="model-id">${m.id}</code>${cmdBadge}</li>`;
    }).join("");

  return `
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
  </div>`;
}

function renderLogsSection(): string {
  return `
  <div class="card" style="height:calc(100vh - 160px);display:flex;flex-direction:column">
    <div class="card-header" style="flex-shrink:0;display:flex;justify-content:space-between;align-items:center">
      <span>Live Logs <span id="log-status" class="badge badge-ok" style="margin-left:8px">connecting...</span></span>
      <span>
        <button onclick="toggleLogPause()" id="log-pause-btn" style="background:#1e2130;color:#9ca3af;border:1px solid #2d3148;border-radius:6px;padding:3px 10px;font-size:11px;cursor:pointer;margin-right:4px">Pause</button>
        <button onclick="clearLogs()" style="background:#1e2130;color:#9ca3af;border:1px solid #2d3148;border-radius:6px;padding:3px 10px;font-size:11px;cursor:pointer">Clear</button>
      </span>
    </div>
    <pre id="log-output" style="flex:1;overflow-y:auto;padding:12px 16px;font-size:12px;line-height:1.6;color:#9ca3af;margin:0;white-space:pre-wrap;word-break:break-all"></pre>
  </div>`;
}

// ── Dashboard data (for AJAX polling) ──────────────────────────────────────

export interface DashboardSections {
  providers: string;
  metrics: string;
  active: string;
  recent: string;
  fallbacks: string;
  sessions: string;
  timeouts: string;
  models: string;
}

export function renderDashboardData(opts: StatusTemplateOptions): DashboardSections {
  return {
    providers: renderProviders(opts.providers),
    metrics: opts.metrics ? renderMetricsSection(opts.metrics) : "",
    active: opts.activeRequests ? renderActiveRequests(opts.activeRequests) : "",
    recent: opts.metrics ? renderRecentRequestLog(opts.metrics.recentRequests) : "",
    fallbacks: opts.metrics ? renderFallbackHistory(opts.metrics.fallbackHistory) : "",
    sessions: opts.providerSessionsList ? renderProviderSessions(opts.providerSessionsList) : "",
    timeouts: opts.timeoutConfig ? renderTimeoutConfig(opts.timeoutConfig) : "",
    models: renderModels(opts.models, opts.modelCommands),
  };
}

// ── Navigation definitions ────────────────────────────────────────────────

const NAV_ITEMS = [
  { id: "overview", label: "Overview", icon: "\u25C9" },
  { id: "providers", label: "Providers", icon: "\u26A1" },
  { id: "active", label: "Active", icon: "\u25CF" },
  { id: "recent", label: "Requests", icon: "\u2630" },
  { id: "fallbacks", label: "Fallbacks", icon: "\u21C4" },
  { id: "sessions", label: "Sessions", icon: "\u29BF" },
  { id: "logs", label: "Live Logs", icon: "\u276F" },
  { id: "timeouts", label: "Timeouts", icon: "\u23F1" },
  { id: "models", label: "Models", icon: "\u2726" },
] as const;

// ── Full page render ──────────────────────────────────────────────────────

export function renderStatusPage(opts: StatusTemplateOptions): string {
  const { version, port } = opts;
  const sections = renderDashboardData(opts);

  const navHtml = NAV_ITEMS.map(n =>
    `<a href="#${n.id}" class="nav-item" data-nav="${n.id}" onclick="showSection('${n.id}')">${n.icon} ${n.label}</a>`
  ).join("\n      ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CLI Bridge Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0f1117; color: #e5e7eb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; min-height: 100vh; display: grid; grid-template-columns: 200px 1fr; }

    /* ── Sidebar ── */
    .sidebar { background: #13151f; border-right: 1px solid #2d3148; padding: 20px 0; position: fixed; top: 0; left: 0; bottom: 0; width: 200px; overflow-y: auto; z-index: 10; }
    .sidebar-title { padding: 0 16px 16px; font-size: 16px; font-weight: 700; color: #f9fafb; border-bottom: 1px solid #2d3148; margin-bottom: 8px; }
    .sidebar-version { display: block; font-size: 11px; color: #6b7280; font-weight: 400; margin-top: 2px; }
    .nav-item { display: flex; align-items: center; gap: 8px; padding: 8px 16px; color: #9ca3af; text-decoration: none; font-size: 13px; transition: all 0.15s; border-left: 3px solid transparent; }
    .nav-item:hover { color: #e5e7eb; background: #1a1d27; }
    .nav-item.active { color: #3b82f6; background: #1e2130; border-left-color: #3b82f6; font-weight: 600; }

    /* ── Main content ── */
    .main { grid-column: 2; padding: 24px; min-height: 100vh; }
    .section { display: none; }
    .section.active { display: block; }
    .section-title { font-size: 18px; font-weight: 700; color: #f9fafb; margin-bottom: 16px; }

    /* ── Cards & tables ── */
    .card { background: #1a1d27; border: 1px solid #2d3148; border-radius: 12px; overflow: hidden; margin-bottom: 24px; }
    .card-header { padding: 14px 16px; border-bottom: 1px solid #2d3148; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
    table { width: 100%; border-collapse: collapse; }
    tr:not(:last-child) td { border-bottom: 1px solid #1f2335; }
    .table-head { background: #13151f; }
    .models { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    ul { list-style: none; padding: 12px 16px; }
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
    .footer { color: #374151; font-size: 12px; text-align: center; margin-top: 16px; }

    /* ── Log colors ── */
    .log-fail { color: #ef4444; }
    .log-ok { color: #22c55e; }
    .log-warn { color: #f59e0b; }
    .log-kill { color: #f97316; }
    .log-route { color: #8b5cf6; }
    .log-dim { color: #6b7280; }

    /* ── Mobile ── */
    .mobile-toggle { display: none; position: fixed; top: 8px; left: 8px; z-index: 20; background: #1a1d27; border: 1px solid #2d3148; border-radius: 8px; padding: 6px 10px; color: #e5e7eb; font-size: 18px; cursor: pointer; }
    @media (max-width: 768px) {
      body { grid-template-columns: 1fr; }
      .sidebar { transform: translateX(-100%); transition: transform 0.2s; }
      .sidebar.open { transform: translateX(0); }
      .main { grid-column: 1; }
      .mobile-toggle { display: block; }
      .summary-grid { grid-template-columns: repeat(2, 1fr); }
      .models, .two-col { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <button class="mobile-toggle" onclick="document.querySelector('.sidebar').classList.toggle('open')">\u2630</button>

  <nav class="sidebar">
    <div class="sidebar-title">CLI Bridge<span class="sidebar-version">v${version} \u00b7 :${port}</span></div>
    ${navHtml}
    <div style="padding:16px;margin-top:auto">
      <div style="font-size:11px;color:#374151">
        <a href="/v1/models" style="color:#4b5563;text-decoration:none">/v1/models</a> \u00b7
        <a href="/healthz" style="color:#4b5563;text-decoration:none">/healthz</a>
      </div>
    </div>
  </nav>

  <main class="main">
    <section data-section="overview" class="section active">
      <h2 class="section-title">Overview</h2>
      <div id="s-metrics">${sections.metrics}</div>
      <div id="s-active">${sections.active}</div>
    </section>

    <section data-section="providers" class="section">
      <h2 class="section-title">Providers</h2>
      <div id="s-providers">${sections.providers}</div>
    </section>

    <section data-section="active" class="section">
      <h2 class="section-title">Active Requests</h2>
      <div id="s-active2">${sections.active}</div>
    </section>

    <section data-section="recent" class="section">
      <h2 class="section-title">Recent Requests</h2>
      <div id="s-recent">${sections.recent}</div>
    </section>

    <section data-section="fallbacks" class="section">
      <h2 class="section-title">Fallbacks &amp; Sessions</h2>
      <div class="two-col">
        <div id="s-fallbacks">${sections.fallbacks}</div>
        <div id="s-sessions">${sections.sessions}</div>
      </div>
    </section>

    <section data-section="sessions" class="section">
      <h2 class="section-title">Provider Sessions</h2>
      <div id="s-sessions2">${sections.sessions}</div>
    </section>

    <section data-section="logs" class="section">
      <h2 class="section-title">Live Logs</h2>
      ${renderLogsSection()}
    </section>

    <section data-section="timeouts" class="section">
      <h2 class="section-title">Timeout Configuration</h2>
      <div id="s-timeouts">${sections.timeouts}</div>
    </section>

    <section data-section="models" class="section">
      <h2 class="section-title">Models</h2>
      <div id="s-models">${sections.models}</div>
    </section>

    <p class="footer">openclaw-cli-bridge-elvatis v${version}</p>
  </main>

  <script>
    // ── Section switching ──
    function showSection(id) {
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      const sec = document.querySelector('[data-section="' + id + '"]');
      const nav = document.querySelector('[data-nav="' + id + '"]');
      if (sec) sec.classList.add('active');
      if (nav) nav.classList.add('active');
      location.hash = id;
      // Close mobile sidebar
      document.querySelector('.sidebar').classList.remove('open');
    }

    // Init from hash
    (function() {
      var hash = location.hash.slice(1) || 'overview';
      showSection(hash);
    })();

    // ── AJAX polling (replaces meta-refresh) ──
    setInterval(function() {
      fetch('/api/dashboard-data').then(function(r) { return r.json(); }).then(function(data) {
        var map = {
          's-metrics': 'metrics', 's-active': 'active', 's-active2': 'active',
          's-providers': 'providers', 's-recent': 'recent',
          's-fallbacks': 'fallbacks', 's-sessions': 'sessions', 's-sessions2': 'sessions',
          's-timeouts': 'timeouts', 's-models': 'models'
        };
        for (var elId in map) {
          var el = document.getElementById(elId);
          if (el && data[map[elId]]) el.innerHTML = data[map[elId]];
        }
      }).catch(function() { /* silent fail on poll */ });
    }, 10000);

    // ── Live log viewer ──
    var logOutput = document.getElementById('log-output');
    var logStatus = document.getElementById('log-status');
    var logPaused = false;
    var logSource = null;
    var logLineCount = 0;
    var MAX_LOG_LINES = 500;
    var autoScroll = true;

    function colorLogLine(line) {
      if (line.indexOf('[FAIL]') !== -1 || line.indexOf('[ERROR]') !== -1) return '<span class="log-fail">' + line + '</span>';
      if (line.indexOf('[OK]') !== -1) return '<span class="log-ok">' + line + '</span>';
      if (line.indexOf('[FALLBACK]') !== -1 || line.indexOf('[WARN]') !== -1) return '<span class="log-warn">' + line + '</span>';
      if (line.indexOf('[KILL]') !== -1) return '<span class="log-kill">' + line + '</span>';
      if (line.indexOf('[TOOL-ROUTE]') !== -1 || line.indexOf('[TASK-ROUTE]') !== -1) return '<span class="log-route">' + line + '</span>';
      if (line.indexOf('[TIMEOUT]') !== -1 || line.indexOf('[CLAUDE]') !== -1) return '<span class="log-dim">' + line + '</span>';
      return line;
    }

    function appendLog(text) {
      if (!logOutput) return;
      var lines = text.split('\\n').filter(function(l) { return l.trim(); });
      lines.forEach(function(line) {
        logOutput.innerHTML += colorLogLine(line.replace(/</g, '&lt;').replace(/>/g, '&gt;')) + '\\n';
        logLineCount++;
      });
      // Trim old lines
      while (logLineCount > MAX_LOG_LINES) {
        var idx = logOutput.innerHTML.indexOf('\\n');
        if (idx === -1) break;
        logOutput.innerHTML = logOutput.innerHTML.slice(idx + 1);
        logLineCount--;
      }
      if (autoScroll) logOutput.scrollTop = logOutput.scrollHeight;
    }

    function connectLog() {
      if (logSource) logSource.close();
      logSource = new EventSource('/api/logs/stream');
      logSource.onopen = function() {
        if (logStatus) { logStatus.textContent = 'connected'; logStatus.className = 'badge badge-ok'; }
      };
      logSource.onmessage = function(e) { appendLog(e.data); };
      logSource.onerror = function() {
        if (logStatus) { logStatus.textContent = 'disconnected'; logStatus.className = 'badge badge-error'; }
        // Reconnect after 3s
        setTimeout(function() { if (!logPaused) connectLog(); }, 3000);
      };
    }

    function toggleLogPause() {
      logPaused = !logPaused;
      var btn = document.getElementById('log-pause-btn');
      if (logPaused) {
        if (logSource) logSource.close();
        if (btn) btn.textContent = 'Resume';
        if (logStatus) { logStatus.textContent = 'paused'; logStatus.className = 'badge badge-warn'; }
      } else {
        connectLog();
        if (btn) btn.textContent = 'Pause';
      }
    }

    function clearLogs() {
      if (logOutput) { logOutput.innerHTML = ''; logLineCount = 0; }
    }

    // Auto-scroll detection
    if (logOutput) {
      logOutput.addEventListener('scroll', function() {
        autoScroll = (logOutput.scrollTop + logOutput.clientHeight >= logOutput.scrollHeight - 50);
      });
    }

    // Start log connection
    connectLog();
  </script>
</body>
</html>`;
}
