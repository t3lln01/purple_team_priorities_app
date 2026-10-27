---
name: Python runtime constraints
description: Non-obvious launch constraints for the Django fork.
---
Development artifact commands execute from their artifact directories; production launch paths must be validated separately. Gunicorn config paths should be resolved absolutely by the launcher before changing directories.

**Why:** Relative config and workspace-root paths caused startup failures during conversion.

**How to apply:** Preserve the working portable launcher and explicit development directory change when changing process configuration.
