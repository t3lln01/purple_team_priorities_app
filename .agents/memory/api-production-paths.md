---
name: API production paths
description: Path-resolution constraint for the API's bundled production server.
---

The API production bundle is CommonJS. Server modules that load workspace data must resolve paths from the current working directory rather than using `import.meta.url`, accounting for development starting inside the API artifact and production starting at workspace root.

**Why:** esbuild empties `import.meta` in CommonJS output. Calling `fileURLToPath(import.meta.url)` then crashes the published process before it opens its configured port, even though the build command itself succeeds.

**How to apply:** When adding server-side file reads or writes, detect whether the current directory is already the API artifact before appending its workspace-relative path. Verify both the managed development workflow and the exact production build/run commands, including the configured health endpoint.