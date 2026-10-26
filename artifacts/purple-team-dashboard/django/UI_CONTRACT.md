# Django interface contract

This is a migration of the existing Purple Team app, not a new product. Preserve its recognizable branding and navigation. The main agent implements Python settings, models, services, forms, views, authentication and routes. The design helper owns ONLY `templates/` and `static/purple/` (except `auth.js` and `browser-import.js`, owned by main).

Use Django templates and plain HTML/CSS, not React, Vite, TypeScript, a CDN CSS framework or a JS business-logic layer. Small enhancement scripts for dialogs/search/dirty-form warnings are allowed. All calculations and writes are Python. No chart is needed. Do not fabricate data.

## Shared context
- `title`, `subtitle`, `page_slug`, `navigation` list of `{path,label}`
- `access`: `{user_id,email,is_admin,can_write}`; `auth_error` optional
- `clerk_key` (public), `clerk_script_url`, `clerk_proxy_url`; no secrets
- `messages`: Django messages; use `role=alert` for errors
- `selected_quarter`, `quarters` list of strings (only threat-model/dashboard)
- `request`: request context processor present
- URL root is `/`; assets `{% static 'purple/style.css' %}`.
- CSS full application styling, responsive mobile navigation, accessible labels/keyboard.
- Login `/sign-in`, logout button `id=sign-out`; auth.js handles Clerk.
- import browser data link `/data-sources/browser-import`

## Templates
### base.html
Shared app shell. Blocks `content`, `scripts`. Include auth.js with defer (main writes it); element `id=auth-status` for login failures. Script config via `{{ clerk_config|json_script:"clerk-config" }}`. Include logout only if signed in. Public navigation allowed except Users only for admins. Read-only notice for no write permission.

### table.html
Generic server-rendered browse page, extends base.
Context: `columns`: strings, `rows`: list of `{cells: list of display values, edit_url: optional, delete_url: optional}`. `stats`: `{label,value}` list. `filters`: `{name,label,value,options:list of {value,label}}`. `query`, `page_obj` Django Paginator, `pagination_query` encoded query without page.
GET search `q`, `sort` dropdown options `sort_options` = `{value,label}` list, `direction` asc/desc. Search preserves filter values, applies sort, resets page. Render table and links (escape values normally). `actions`: `{url,label}` links, `export_url` optional. `page_obj` pagination. `notice` optional. If `requires_signin` show sign-in message, not fake empty data.

### form.html
Extends base; context `form` Django Form, `cancel_url`, `submit_label`, `danger` bool, `description`. Standard method POST csrf multipart form with form.as_p. Button disabled/hidden if no write access. POST server action URL current path. Errors rendered.

### threat_model.html
Extends base. Context `actors` list containing `{name,index,description,origins,malware,intent,capability,monitored,is_custom,edit_url,delete_url,assessment_status,assessment_intent,assessment_capability}`. `saved_at`, `revision`, `seeded_from`, `quarter`, `pp_tap_text`, `sirt_text`.
GET quarter select `quarter` (not inside save form). Main form method POST `/threat-model?quarter=...`, csrf, hidden `revision`.
Each actor monitoring checkbox name `monitored` value actor.name. All actor rows must remain in the form (client-side filter hides rows, never removes them). Show description in `<details>`. Edit/delete links separate URLs; main saves full quarter monitoring and both textareas name `ppTapList` and `sirtList` (one entry per line). Prominent explicit Save quarter button, only writers. Add actor `/threat-model/actor/new?quarter=...`; automated assessment generation form POST `/threat-model/assess?quarter=...` csrf (outside main form). Assessment rows show approve/reject links to `/threat-model/assessment?quarter=...&actor=...` review form instead of automatic acceptance. Scoring framework `/scoring-framework`. Preserve quarter in links. Unsaved-change warning script for edits/navigation.

### sources.html
Extends base. `sync` `{status,lastSync,error,meta:{reportCount,actorCount}}`, `credentials_present`, `versions` list `{id,label,active}`, `source_forms` links through `actions`.
Links/forms: POST `/data-sources/sync` (csrf) button sync, GET `/data-sources/credentials` credential form, POST `/data-sources/disconnect` csrf confirmation, GET `/data-sources/import` file import, GET `/data-sources/browser-import`; GET `/data-sources/version` active MITRE version form. Show real counts/error/status; if running reload page 10 seconds (plain JS). Never display secrets. `can_write` gates writes.

### sign_in.html
Extends base; `id=clerk-sign-in` mount container and error display. Main auth.js implements Clerk.

### browser_import.html
Extends base; explanation that old local browser settings/imports will be copied into the current account without deleting originals. Button id `import-browser`, status id `import-status`, include main-owned browser-import.js. csrf hidden form for token. User action explicit.

### api_docs.html
Extends base; `endpoints`: `{path,description}` list, exports support format=json/csv, auth requirements. No claims about unsupported endpoints.

### error.html
Extends base; `error`, `status`, recovery link.

All writes use CSRF and existing can_write/admin gates. No role controls implemented client-only. Avoid emojis.
