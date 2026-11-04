# Golden Star Media House — Church Facebook Comment Moderation System

A secure, production-grade Facebook comment moderation system designed specifically for church administration. Built to monitor Facebook comments across multiple church Pages, detect harmful content (threats, insults, hate speech, spam, scams, religious harassment) across English, Shona, Ndebele, and mixed-language comments, and support human review workflows.

---

## 1. System Architecture

- **Framework**: Next.js 14 (App Router, Server Components & Server Actions)
- **Language**: TypeScript (Strict typing with full Supabase PostgreSQL schema mapping)
- **Styling**: Tailwind CSS (Restrained dark charcoal enterprise palette: `#0B0E14` base, flat surfaces, thin borders, no decorative gimmickry)
- **Database & Auth**: Supabase PostgreSQL with Row Level Security (RLS) & Supabase Authentication
- **Facebook Integration**: Meta Graph API (v26.0) & HMAC-SHA256 Webhook Ingestion
- **Token Security**: Server-side AES-256-GCM authenticated encryption for all stored Facebook Page Access Tokens
- **AI Moderation Engine**: OpenAI GPT-4o-mini with native comprehension of English, Shona (chiShona idioms), Ndebele (isiNdebele), and code-switching

---

## 2. Directory Structure

```text
├── app/
│   ├── (dashboard)
│   │   ├── page.tsx                     # Overview (real metrics, priority queue, recent activity)
│   │   ├── comments/page.tsx            # Live Comments Stream (search, filters, inspection)
│   │   ├── queue/page.tsx               # Moderation Decision Queue (prioritized by severity)
│   │   ├── pages/page.tsx               # Facebook Pages Management (AES token encryption, webhooks)
│   │   ├── rules/page.tsx               # Moderation Policy Rules
│   │   ├── history/page.tsx             # Audit Trail & Moderation History
│   │   ├── notifications/page.tsx       # Incident & Alert Notification Center
│   │   ├── admins/page.tsx              # Administrator Account Directory (Super Admin only)
│   │   └── settings/page.tsx            # System Configuration & Integration Status
│   ├── api/
│   │   ├── admins/route.ts              # Provision Moderator & Toggle Active Status
│   │   ├── auth/
│   │   │   ├── login/route.ts           # Supabase Auth sign-in with admin_users validation
│   │   │   └── logout/route.ts          # Session termination
│   │   ├── comments/action/route.ts     # Manual moderation actions (Approve, Hide, Restore, Flag)
│   │   ├── moderation/process-job/      # Asynchronous / on-demand job processor
│   │   ├── notifications/route.ts       # Mark read / mark all read
│   │   ├── pages/route.ts               # Connect page, toggle monitoring/auto-hide, disconnect
│   │   ├── rules/route.ts               # Update moderation rules
│   │   └── webhooks/facebook/route.ts   # Meta Webhook verification & HMAC comment ingestion
│   ├── login/page.tsx                   # Administrator Sign In (no public registration)
│   ├── layout.tsx                       # Root Layout
│   └── globals.css                      # Tailwind styling & dark theme defaults
├── components/
│   ├── admins/admins-view.tsx           # Admin management interface
│   ├── comments/
│   │   ├── comment-detail-modal.tsx     # Full inspection slide-over with action controls
│   │   └── live-comments-view.tsx       # Interactive comment table with multi-filter
│   ├── history/history-view.tsx         # Searchable audit log and API payload viewer
│   ├── layout/
│   │   ├── app-shell.tsx                # Dynamic shell with real unread & queue counts
│   │   ├── sidebar.tsx                  # Left navigation bar
│   │   └── top-nav.tsx                  # Top header bar
│   ├── notifications/                   # Notification list and mark-read controls
│   ├── pages/pages-view.tsx             # Facebook page cards and token submission modal
│   ├── queue/queue-view.tsx             # Prioritized review cards with action confirmations
│   ├── rules/rules-view.tsx             # Policy rule table and edit modal
│   ├── settings/settings-view.tsx       # Meta webhook callback config & AI threshold settings
│   └── ui/badge.tsx                     # Restrained status and severity badges
├── lib/
│   ├── ai/moderator.ts                  # OpenAI contextual analyzer (English/Shona/Ndebele)
│   ├── auth/session.ts                  # Server-side admin session & role guard
│   ├── crypto/token-encryption.ts       # AES-256-GCM token encryption & decryption
│   ├── facebook/graph-api.ts            # Meta Graph API client (hide, unhide, subscribe, verify)
│   ├── moderation/job-runner.ts         # Asynchronous moderation queue worker
│   └── supabase/
│       ├── admin.ts                     # Privileged server-side Supabase client (service role)
│       ├── client.ts                    # Browser Supabase client
│       └── server.ts                    # SSR cookie-based Supabase client
├── middleware.ts                        # Route protection & Supabase session refreshment
├── supabase/
│   └── schema.sql                       # Complete PostgreSQL database schema with RLS & functions
└── types/
    └── database.ts                      # Strict TypeScript types for all Supabase tables & entities
```

---

## 3. Database Setup (Supabase)

1. Open your Supabase Project Dashboard -> **SQL Editor**.
2. Open and run [`supabase/schema.sql`](file:///c:/Users/ADMIN/Downloads/content_moderation/supabase/schema.sql).
3. The script creates:
   - Tables: `admin_users`, `facebook_pages`, `page_tokens`, `posts`, `comments`, `moderation_rules`, `moderation_results`, `moderation_jobs`, `moderation_actions`, `audit_logs`, `notifications`.
   - Security Definer Functions: `is_active_admin()`, `is_super_admin()`, `set_updated_at()`.
   - Row Level Security (RLS) policies across all tables.
   - Initial church baseline moderation rules.

---

## 4. Provisioning the Initial Super Admin

To create the initial Super Admin:
1. In the Supabase Dashboard, create an auth user under **Authentication > Users** (e.g. `superadmin@church.org`).
2. In the **SQL Editor**, insert the user into `admin_users`:
```sql
INSERT INTO admin_users (id, email, role, full_name, is_active)
VALUES (
  'PASTE-AUTH-USER-UUID-HERE',
  'superadmin@church.org',
  'super_admin',
  'Senior Church Administrator',
  true
);
```
3. Once logged in, the Super Admin can provision the church Moderator account directly from the **Admin Management** page inside the application.

---

## 5. Environment Variables Configuration

Copy `.env.example` to `.env.local` and provide your actual credentials:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Facebook / Meta
META_APP_ID=your-meta-app-id
META_APP_SECRET=your-meta-app-secret
META_VERIFY_TOKEN=church_moderation_webhook_token
NEXT_PUBLIC_APP_URL=https://your-domain.com

# Token Encryption (32-byte hex for AES-256-GCM)
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

# OpenAI Moderation
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

---

## 6. Meta Facebook Webhook Ingestion Setup

1. In the Meta Developer Portal, go to your App -> **Webhooks** -> Select **Page**.
2. Set Callback URL: `https://<YOUR_DOMAIN>/api/webhooks/facebook`
3. Set Verify Token: The same string configured in `META_VERIFY_TOKEN`.
4. Subscribe to the `feed` field.
5. In the Church Moderation Console under **Facebook Pages**, click **Connect Page** and enter the Page ID, Name, and Page Access Token. The system validates the token and automatically subscribes the page to feed updates.

---

## 7. Moderation Engine Logic

- **Contextual Understanding**: Distinguishes respectful theological discussion, questions about church administration, and prayer requests from attacks, hate speech, or financial scams.
- **Language Nuance**: Evaluates English, Shona (e.g., distinguishing colloquial expressions from derogatory insults like "mbavha" or tribal abuse), Ndebele, and mixed code-switching.
- **Safe Defaults**: Automatic hiding is **disabled by default**. Dangerous or uncertain comments are directed to the **Moderation Queue** where human administrators can approve, flag, or hide them.
- **Auditability**: Every action (whether taken by AI or an administrator) is logged in `moderation_actions` with the actor, reason, timestamp, and Meta Graph API response payload.
