---
name: Dependency remediation constraints
description: Non-obvious compatibility rules for pnpm security overrides and Orval with patched js-yaml.
---

Keep pnpm override replacements constrained to the dependency's requested major version. In particular, an open-ended replacement range can cross majors even when the original parent request cannot.

**Why:** An automated audit fix used an open-ended Picomatch replacement, which resolved a 2.x request to a vulnerable 4.x version and left the audit failing.

**How to apply:** Prefer a patched exact version or a same-major bounded range for transitive overrides, then inspect the lockfile and run the audit.

The patched ESM release of js-yaml has no default export, while the current Orval bundle imports one.

**Why:** Keeping js-yaml fully patched broke OpenAPI code generation until Orval's import was changed to a namespace import.

**How to apply:** Preserve the pnpm package patch when upgrading Orval or js-yaml, and remove it only after upstream Orval no longer imports js-yaml's default export.