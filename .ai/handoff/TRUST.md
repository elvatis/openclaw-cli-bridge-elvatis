# [PROJECT]: Trust Register

> Tracks verification status of critical system properties.
> In multi-agent pipelines, hallucinations and drift are real risks.
> Every claim here has a confidence level tied to how it was verified.

---

## Confidence Levels

| Level | Meaning |
|-------|---------|
| **verified** | An agent executed code, ran tests, or observed output to confirm this |
| **assumed** | Derived from docs, config files, or chat, not directly tested |
| **untested** | Status unknown; needs verification |

---

## Build System

| Property | Status | Last Verified | Agent | Notes |
|----------|--------|---------------|-------|-------|
| `build` passes | untested | - | - | |
| `test` passes | untested | - | - | |
| `lint` passes | untested | - | - | |
| `type-check` passes | untested | - | - | |

---

## Infrastructure

| Property | Status | Last Verified | Agent | Notes |
|----------|--------|---------------|-------|-------|
| Local dev stack boots | untested | - | - | |
| All health endpoints respond | untested | - | - | |
| Database connection works | untested | - | - | |
| Auth flow completes | untested | - | - | |

---

## Integrations

| Property | Status | Last Verified | Agent | Notes |
|----------|--------|---------------|-------|-------|
| External API A reachable | untested | - | - | |
| Webhook delivery confirmed | untested | - | - | |

---

## Security

| Property | Status | Last Verified | Agent | Notes |
|----------|--------|---------------|-------|-------|
| No secrets in source | assumed | - | - | Pre-commit hooks configured |
| Auth tokens expire correctly | untested | - | - | |
| PII not logged | untested | - | - | |

---

## Update Rules (for agents)

- Change `untested` → `verified` only after **running actual code/tests**
- Change `assumed` → `verified` after direct confirmation
- Never downgrade `verified` without explaining why in `LOG.md`
- Add new rows when new system properties become critical

---

*Trust degrades over time. Re-verify periodically, especially after major refactors.*
