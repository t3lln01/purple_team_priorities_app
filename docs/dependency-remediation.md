# Dependency remediation verification

Verified on 2026-10-29.

## Requested findings

| Dependency | Resolved release | Findings addressed |
| --- | --- | --- |
| proxy-addr | 2.0.8 (via Express 5.3.0) | GHSA-jqcg-44mw-7w3h |
| vite | 7.3.7 (both web workspaces) | GHSA-587h-7wmj-h5pm, GHSA-698v-4r3x-3vcv, GHSA-r825-w8mm-5pxw, GHSA-rq7h-c2jc-7f22, GHSA-9jrq-w75r-8gcw |
| source-map-js | 1.2.2 | GHSA-68fv-2mgg-jv7q |
| brace-expansion | 5.0.12 | GHSA-6j4f-fj2g-mc7p, GHSA-qhr7-859c-m2p7, GHSA-q2hr-2g5m-vwhr |
| markdown-it | 14.3.3 | GHSA-gfr2-rv44-r23c, GHSA-r7fv-28h4-cvq7, GHSA-vfgh-jcmw-g37q |
| fast-uri | 3.1.9 | GHSA-hrr3-gc8f-f4qj, GHSA-jvvf-x445-j334 |
| postcss-selector-parser | 6.1.5 | GHSA-rj75-hqrm-r3gf |

The previous unbounded fast-uri override had upgraded Ajv's requested 3.x dependency
to 4.x. Restore its requested major and use the patched 3.1.9 release. The
mailto advisory GHSA-jvvf-x445-j334 only affects 4.1.3–4.1.4.
Other changed overrides also stay within the parent's requested major.
Similarly, markdown-it returns to TypeDoc's requested 14.x line; the three listed
advisories affect 15.x, not 14.3.3.
The one-day minimum release age and existing Orval/js-yaml patch remain enabled.

### Withdrawn finding

[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
for braces 3.0.3 was withdrawn on 2026-10-23 because it is not a practically
exploitable vulnerability. No patched release exists, and the latest release is
still 3.0.3. Keep it unchanged rather than replacing the glob implementation for
a withdrawn advisory. The current dependency audit does not report it.

## Checks

- Dependency audit: no active findings from the requested list remain.
- `PORT=5173 BASE_PATH=/ pnpm -r --if-present run build`: all three artifacts build.
- `node --test artifacts/purple-team-dashboard/src/utils/*.test.mjs`: 10 tests pass.
- `pnpm --filter @workspace/api-spec exec orval --input ./openapi.yaml --output /tmp/dependency-remediation-api.ts --client fetch`: passes without changing checked-in generated files.
- All three managed development workflows restart successfully.
- Proxied `/api/healthz`, `/`, and `/__mockup/`: HTTP 200.
- Screenshot: public landing page renders; signed-in UI was not visually verified.
- `pnpm run build`: blocked at its typecheck step by source-level errors in
  `DataSources.tsx` and `ViewDetail.tsx` (implicit parameter types, incompatible
  comparisons, and missing ViewContext exports). These source files are unchanged
  by this dependency remediation. API, sandbox, shared-library, and scripts
  typechecks passed.

## Separate findings outside the requested list

The audit also reports these existing advisories; this is not a clean audit of
the entire project:

- body-parser 2.3.0: GHSA-27r3-jxmh-p828; patched in 2.4.0.
- qs 6.16.0: GHSA-6pq8-jhm2-2vcw; patched in 6.16.1.
- Zod 3.25.76: GHSA-mrhx-c7xc-m3w5; audit recommends 4.6.6, a major upgrade.

These remain outside this targeted remediation. Existing Clerk/React peer
warnings also remain; React's pinned version was not changed.
