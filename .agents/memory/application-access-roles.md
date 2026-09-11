---
name: Application access roles
description: Durable authentication and authorization rules for dashboard users.
---

Use Clerk email/password credentials with email addresses serving as usernames. Public sign-up and social-login choices are not part of the application flow.

The primary administrator can manage users. Accounts created by the administrator receive write access; authenticated accounts without that grant and unauthenticated guests remain view-only. API write authorization must enforce the same administrator-or-writer rule independently of the frontend.

**Why:** The application needs simple managed credentials and delegated editing without giving every authenticated user write access.

**How to apply:** Any new editing feature must use the shared write-access state in the UI and remain protected by server-side role verification. User-management operations remain administrator-only.