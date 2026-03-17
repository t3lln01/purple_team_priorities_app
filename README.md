# Purple Team Adversary Prioritisation Dashboard

A dark-themed React dashboard for visualising Purple Team adversary prioritisation data mapped to the MITRE ATT&CK framework. Data is embedded statically (no backend required) and augmented via browser-side file uploads.

---

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| Node.js | 18+ (tested on v24) |
| pnpm | 9+ |

Install pnpm if you don't have it:

```bash
npm install -g pnpm
```

---

## Quick start

```bash
# 1. Clone the repo
git clone https://github.com/your-org/purple_team_priorities_app.git
cd purple_team_priorities_app

# 2. Install all workspace dependencies
pnpm install

# 3. Start the dev server
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/purple-team-dashboard run dev
```

Open http://localhost:5173 in your browser.

> **Why `PORT` and `BASE_PATH`?**
> The Vite config reads these at startup. `PORT` sets the listen port; `BASE_PATH` is the URL prefix the app is served under (`/` for local dev).

---

## Using a `.env` file (recommended)

Create a file called `.env` inside `artifacts/purple-team-dashboard/`:

```env
PORT=5173
BASE_PATH=/
```

Then run:

```bash
pnpm --filter @workspace/purple-team-dashboard run dev
```

---

## Production build

```bash
# Build the app
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/purple-team-dashboard run build

# The compiled output lands in:
# artifacts/purple-team-dashboard/dist/public/

# Serve the build locally to verify
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/purple-team-dashboard run serve
```

The `dist/public/` folder is a standard static-site bundle — deploy it to any web server, S3 bucket, Nginx, GitHub Pages, Netlify, Cloudflare Pages, etc.

For GitHub Pages or a subdirectory deployment, set `BASE_PATH` to match your repo path, e.g. `BASE_PATH=/purple_team_priorities_app/`.

---

## Project structure

```
/
├── artifacts/
│   └── purple-team-dashboard/     # The React app
│       ├── src/
│       │   ├── data.json          # Static MITRE ATT&CK v16 seed data
│       │   ├── context/
│       │   │   └── ViewContext.tsx  # Saved-view state + generation logic
│       │   └── pages/
│       │       ├── ActorPrioritisation.tsx
│       │       ├── RiskCalculation.tsx
│       │       ├── AllProcedures.tsx
│       │       ├── DataSources.tsx
│       │       └── ViewDetail.tsx
│       └── vite.config.ts
├── package.json                   # Workspace root
└── pnpm-workspace.yaml
```

---

## Pages

| Page | Route | Description |
|------|-------|-------------|
| Actor Prioritisation | `/` | Ranked actor table, TTP risk chart, active-monitoring chips |
| Risk Calculation | `/risk-calculation` | Per-technique risk scores from embedded data |
| High Value Assets | `/high-value-assets` | HVA matrix |
| TID Priority | `/tid-priority` | Threat intelligence directive scoring |
| Tactic Scores | `/tactics-scores` | MITRE tactic-level coverage breakdown |
| Risk Rate | `/risk-rate` | Risk rate heatmap |
| All Procedures | `/all-procedures` | Full searchable/filterable procedure table |
| Data Sources | `/data-sources` | Upload external data and generate new views |
| Saved View | `/view/:id` | Generated view with actor ranking + procedures |

---

## Data Sources — uploading external intelligence

The **Data Sources** page lets you layer real-world threat intelligence on top of the embedded data and generate a new saved view. All uploaded data is stored in your browser's `localStorage` and survives page refreshes.

### 1. Reports CSV (required for view generation)

Upload your CrowdStrike reports export as a **CSV file** with the following columns:

| Column | Description | Example |
|--------|-------------|---------|
| `id` | Report identifier (uppercased for matching) | `CSA-240217` |
| `name` | Report title | `2024 Threat Intelligence Report` |
| `url` | Full URL to the report | `https://falcon.crowdstrike.com/...` |
| `date` | Publication date — **DD/MM/YYYY** | `17/02/2024` |

The `date` column uses the same format as the reference Python script (`%d/%m/%Y`).

A JSON fallback is also accepted (`api_object.resources[]` format with `slug`, `name`, `url`, `last_modified_date` or `created_date`).

### 2. Actor Mapping JSON (required for view generation)

Upload one JSON file per threat actor (e.g. `SCATTERED_SPIDER.json`). Each file is an array of TTP entries:

```json
[
  {
    "tactic_id": "TA0001",
    "tactic_name": "Initial Access",
    "technique_id": "T1078",
    "technique_name": "Valid Accounts",
    "reports": ["CSA-240217", "CSB-230615"],
    "observables": ["Observed use of compromised credentials via Okta"]
  }
]
```

- Multiple files can be uploaded simultaneously — each becomes one actor.
- Actor name is inferred from the filename (e.g. `SCATTERED_SPIDER.json` → *Scattered Spider*) and can be renamed inline.
- The `reports` array contains IDs that are matched (case-insensitively) against the Reports CSV `id` column.

### 3. MITRE ATT&CK (optional)

Fetch the Enterprise ATT&CK STIX bundle directly in-browser or upload a local copy. Provides technique descriptions for enrichment.

Default URL (auto-populated):
```
https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/enterprise-attack/enterprise-attack.json
```

> The file is ~75 MB. If the fetch times out, use the **download link** shown in the error state and upload the file manually.

### Generating a view

Once at least one actor mapping file is loaded:

1. Click **Generate & Save View** at the bottom of the Data Sources page.
2. A modal shows a preview (actor count, procedure count).
3. Name the view and click **Save & Open View**.
4. The new view appears in the sidebar under **Saved Views** and at `/view/:id`.

Views never overwrite the built-in dashboard data. Each view shows:
- Actor ranking table (sorted by TTP risk score)
- TTP Risk by Actor bar chart
- Tactic coverage breakdown
- Filterable, paginated procedures table with report ID, title, URL, and date

---

## Report-matching logic

The generation logic mirrors the reference Python script:

```
For each actor file:
  For each TTP entry:
    Resolve all report IDs → look up in Reports CSV by id.upper()
    Pick the report with the latest date (best_report)
    If no match → skip this entry entirely
    
    Procedure  = '[Actor] - {observables joined by space}'
    Date       = best_report['date']
    Report Ref = '{ACTOR_UPPER} {report_name} - {report_url}'
```

---

## Saved views storage

| localStorage key | Contents |
|-----------------|----------|
| `pt_saved_views` | Array of generated view objects |
| `ds_actormap_files` | Uploaded actor mapping entries (persisted for re-generation) |
| `ds_reports_lookup` | Parsed reports lookup (keyed by uppercased report ID) |
| `ds_reports_stats` | Reports summary stats (for the UI panel) |
| `ds_mitre_stats` | MITRE ATT&CK parse summary |

Clear any of these with the trash icon on the relevant Data Sources panel, or via the browser's DevTools → Application → Local Storage.

---

## Tech stack

| Layer | Library |
|-------|---------|
| Framework | React 19 + TypeScript |
| Build tool | Vite 7 |
| Styling | Tailwind CSS v4 |
| Routing | Wouter |
| UI components | Radix UI + shadcn/ui |
| Charts | Recharts |
| Icons | Lucide React |
| Package manager | pnpm (workspace monorepo) |

---

## Troubleshooting

**`Error: PORT environment variable is required`**
Set `PORT=5173` before running, or add it to `artifacts/purple-team-dashboard/.env`.

**`Error: BASE_PATH environment variable is required`**
Set `BASE_PATH=/` for local dev. For a subdirectory deployment set it to the path prefix (e.g. `/purple_team_priorities_app/`).

**MITRE ATT&CK fetch fails**
The raw GitHub file is ~75 MB. Download it manually from the link shown on the error panel and upload it via the file picker.

**Generated view has no procedures**
This means none of the report IDs in your actor mapping files matched any `id` in your Reports CSV. Check that the `id` column values match the strings in the actor mapping `reports` arrays (comparison is case-insensitive).

**Saved views disappeared**
Views are stored in `localStorage`. Clearing browser data or using private/incognito mode will remove them.
