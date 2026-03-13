/**
 * status-template.ts
 *
 * Generates the HTML dashboard for the /status endpoint.
 * Extracted from proxy-server.ts for maintainability.
 */

import type { BrowserContext } from "playwright";

export interface StatusProvider {
  name: string;
  icon: string;
  expiry: string | null;
  loginCmd: string;
  ctx: BrowserContext | null;
}

export interface StatusTemplateOptions {
  version: string;
  port: number;
  providers: StatusProvider[];
  models: Array<{ id: string; name: string; contextWindow: number; maxTokens: number }>;
  /** Maps model ID → slash command name (e.g. "openai-codex/gpt-5.3-codex" → "/cli-codex") */
  modelCommands?: Record<string, string>;
}

function statusBadge(p: StatusProvider): { label: string; color: string; dot: string } {
  if (p.ctx !== null) return { label: "Connected", color: "#22c55e", dot: "🟢" };
  if (!p.expiry) return { label: "Never logged in", color: "#6b7280", dot: "⚪" };
  if (p.expiry.startsWith("⚠️ EXPIRED")) return { label: "Expired", color: "#ef4444", dot: "🔴" };
  if (p.expiry.startsWith("🚨")) return { label: "Expiring soon", color: "#f59e0b", dot: "🟡" };
  return { label: "Logged in", color: "#3b82f6", dot: "🔵" };
}

export function renderStatusPage(opts: StatusTemplateOptions): string {
  const { version, port, providers, models } = opts;

  const rows = providers.map(p => {
    const badge = statusBadge(p);
    const expiryText = p.expiry
      ? p.expiry.replace(/[⚠️🚨✅🕐]/gu, "").trim()
      : `Not logged in — run <code>${p.loginCmd}</code>`;
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
      return `<li style="margin:2px 0;font-size:13px;color:#d1d5db"><code style="color:#93c5fd">${m.id}</code>${cmdBadge}</li>`;
    }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CLI Bridge Status</title>
  <meta http-equiv="refresh" content="30">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0f1117; color: #e5e7eb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; min-height: 100vh; padding: 32px 24px; }
    h1 { font-size: 22px; font-weight: 700; color: #f9fafb; margin-bottom: 4px; }
    .subtitle { color: #6b7280; font-size: 13px; margin-bottom: 28px; }
    .card { background: #1a1d27; border: 1px solid #2d3148; border-radius: 12px; overflow: hidden; margin-bottom: 24px; }
    .card-header { padding: 14px 16px; border-bottom: 1px solid #2d3148; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
    table { width: 100%; border-collapse: collapse; }
    tr:not(:last-child) td { border-bottom: 1px solid #1f2335; }
    .models { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    ul { list-style: none; padding: 12px 16px; }
    .footer { color: #374151; font-size: 12px; text-align: center; margin-top: 16px; }
    code { background: #1e2130; padding: 1px 5px; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>CLI Bridge</h1>
  <p class="subtitle">v${version} &nbsp;&middot;&nbsp; Port ${port} &nbsp;&middot;&nbsp; Auto-refreshes every 30s</p>

  <div class="card">
    <div class="card-header">Web Session Providers</div>
    <table>
      <thead>
        <tr style="background:#13151f">
          <th style="padding:10px 16px;text-align:left;font-size:12px;color:#4b5563;font-weight:600">Provider</th>
          <th style="padding:10px 16px;text-align:left;font-size:12px;color:#4b5563;font-weight:600">Status</th>
          <th style="padding:10px 16px;text-align:left;font-size:12px;color:#4b5563;font-weight:600">Session</th>
          <th style="padding:10px 16px;text-align:left;font-size:12px;color:#4b5563;font-weight:600">Login</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>

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

  <p class="footer">openclaw-cli-bridge-elvatis v${version} &nbsp;&middot;&nbsp; <a href="/v1/models" style="color:#4b5563">/v1/models</a> &nbsp;&middot;&nbsp; <a href="/health" style="color:#4b5563">/health</a> &nbsp;&middot;&nbsp; <a href="/healthz" style="color:#4b5563">/healthz</a></p>
</body>
</html>`;
}
