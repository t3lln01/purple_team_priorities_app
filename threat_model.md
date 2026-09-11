# Threat Model

## Project Overview

A publicly deployed Purple Team adversary-prioritization dashboard. A React/Vite client calls an Express 5 API that stores threat-model snapshots in local JSON files and integrates with CrowdStrike using server-held OAuth credentials. Clerk establishes identities; an administrator can create writer accounts, while writers can modify shared threat-model and CrowdStrike configuration/state.

## Assets

- **CrowdStrike credentials and licensed intelligence** — OAuth client credentials, reports, raw actor records, MITRE mappings, and live actor metadata.
- **Threat-model business data** — quarterly actor assessments, monitoring decisions, overrides, evidence, high-value assets, and risk scores.
- **User accounts and privileges** — Clerk sessions, administrator identity, and writer-role metadata.
- **Service availability and third-party quota** — API capacity, local persistent files, and CrowdStrike request quota.

## Trust Boundaries

- **Public browser to Express API** — all request input is attacker-controlled; public deployment means route authorization must be server-side.
- **Clerk identity to application roles** — Clerk proves identity, but the API must separately enforce administrator/writer/read permissions.
- **API to local JSON state** — shared mutable files contain production threat intelligence and assessments.
- **API to CrowdStrike** — server-held credentials authorize paid/sensitive upstream queries; public callers must not be able to use them as an oracle.
- **Uploaded/external intelligence to browser rendering** — CrowdStrike responses, STIX/JSON/CSV uploads, and persisted overrides are untrusted display data.

## Scan Anchors

- Entry/setup: `artifacts/api-server/src/app.ts`, `src/routes/index.ts`.
- Authz: `src/middlewares/adminAuthorization.ts`, `src/routes/access.ts`.
- Highest risk: `src/routes/crowdstrike.ts`, `src/routes/export.ts`, and dashboard upload/render paths.
- Public/static export endpoints are intentionally documented as unauthenticated, but raw synced intelligence and mutable internal assessments require separate review.
- `artifacts/mockup-sandbox` is development-only unless production reachability is demonstrated.

## Threat Categories

### Spoofing and Elevation of Privilege
Every privileged API operation must derive a valid Clerk subject and enforce the exact administrator or writer role. HTTP method alone is not an authorization boundary, and privileged reads must not inherit public access accidentally.

### Tampering
Only authorized writers may change credentials or threat-model state, and only the administrator may manage users. Shared state payloads require bounded structural validation so one writer cannot corrupt service-wide storage or inject dangerous content.

### Information Disclosure
Raw CrowdStrike sync results, actor records, quarterly assessments, monitoring state, and other internal intelligence must be returned only to authorized users unless explicitly classified for public release. Errors must not relay secret-bearing upstream details.

### Denial of Service
Unauthenticated users must not trigger CrowdStrike-backed enumeration, large file reads, or unbounded response buffering. Request and stored-state sizes need limits appropriate to API quota and deployment resources.

### Injection
Uploaded, persisted, and upstream strings must be rendered as text rather than HTML. Filesystem paths and outbound hosts must remain server-controlled; database operations must remain parameterized if introduced.
