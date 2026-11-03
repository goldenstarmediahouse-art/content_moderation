-- ==============================================================================
-- GOLDEN STAR MEDIA HOUSE — CHURCH FACEBOOK COMMENT MODERATION SYSTEM
-- SUPABASE POSTGRESQL DATABASE SCHEMA
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. REUSABLE DATABASE FUNCTIONS
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. ADMIN USERS TABLE
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'moderator')),
  full_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Active Admin Check Function (Security Definer)
CREATE OR REPLACE FUNCTION is_active_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admin_users
    WHERE id = auth.uid() AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Super Admin Check Function (Security Definer)
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admin_users
    WHERE id = auth.uid() AND role = 'super_admin' AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. FACEBOOK PAGES TABLE
CREATE TABLE IF NOT EXISTS facebook_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT,
  is_monitored BOOLEAN NOT NULL DEFAULT true,
  auto_hide_enabled BOOLEAN NOT NULL DEFAULT false, -- Strict requirement: disabled by default
  auto_approve_safe BOOLEAN NOT NULL DEFAULT true,
  webhook_subscribed BOOLEAN NOT NULL DEFAULT false,
  connection_status TEXT NOT NULL DEFAULT 'connected' 
    CHECK (connection_status IN ('connected', 'missing_permissions', 'token_expired', 'connection_error', 'disconnected')),
  last_sync_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. PAGE TOKENS TABLE (Encrypted Access Tokens)
CREATE TABLE IF NOT EXISTS page_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES facebook_pages(id) ON DELETE CASCADE UNIQUE,
  encrypted_access_token BYTEA NOT NULL,
  token_type TEXT NOT NULL DEFAULT 'page_access_token',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. POSTS TABLE
CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES facebook_pages(id) ON DELETE CASCADE,
  facebook_post_id TEXT NOT NULL UNIQUE,
  message TEXT,
  permalink_url TEXT,
  created_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. COMMENTS TABLE
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES facebook_pages(id) ON DELETE CASCADE,
  post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
  facebook_comment_id TEXT NOT NULL UNIQUE,
  facebook_post_id TEXT,
  parent_comment_id TEXT,
  source_event_id TEXT UNIQUE, -- for webhook deduplication
  commenter_id TEXT,
  commenter_name TEXT,
  message TEXT NOT NULL,
  created_time TIMESTAMPTZ NOT NULL,
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  moderation_status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (moderation_status IN ('pending', 'approved', 'flagged', 'hidden', 'restored', 'review_required')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. MODERATION RULES TABLE
CREATE TABLE IF NOT EXISTS moderation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  action TEXT NOT NULL CHECK (action IN ('allow', 'flag', 'hide', 'alert', 'human_review')),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. MODERATION RESULTS TABLE
CREATE TABLE IF NOT EXISTS moderation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE UNIQUE,
  detected_category TEXT NOT NULL,
  confidence_score NUMERIC(4, 3) NOT NULL CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
  severity TEXT NOT NULL CHECK (severity IN ('safe', 'low', 'medium', 'high', 'critical')),
  recommended_action TEXT NOT NULL CHECK (recommended_action IN ('approve', 'flag', 'hide', 'alert', 'human_review')),
  explanation TEXT NOT NULL,
  detected_language TEXT NOT NULL DEFAULT 'en',
  model_info TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. MODERATION JOBS TABLE (Asynchronous Job Processing Queue)
CREATE TABLE IF NOT EXISTS moderation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_error TEXT,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. MODERATION ACTIONS TABLE
CREATE TABLE IF NOT EXISTS moderation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('approved', 'hidden', 'restored', 'flagged', 'threat_alerted')),
  reason TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('ai', 'super_admin', 'moderator', 'system')),
  actor_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  api_response JSONB,
  outcome TEXT NOT NULL DEFAULT 'success' CHECK (outcome IN ('success', 'failed', 'pending')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES admin_users(id) ON DELETE CASCADE, -- null means broad admin notification
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('threat', 'review_required', 'integration_error', 'job_failure', 'system')),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  page_id UUID REFERENCES facebook_pages(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- INDEXES FOR HIGH-PERFORMANCE QUERYING
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_comments_page_id ON comments(page_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_time ON comments(created_time DESC);
CREATE INDEX IF NOT EXISTS idx_comments_moderation_status ON comments(moderation_status);
CREATE INDEX IF NOT EXISTS idx_moderation_jobs_status_next_run ON moderation_jobs(status, next_run_at);
CREATE INDEX IF NOT EXISTS idx_moderation_results_severity ON moderation_results(severity);
CREATE INDEX IF NOT EXISTS idx_notifications_admin_is_read ON notifications(admin_id, is_read);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- ==============================================================================
-- TRIGGERS FOR AUTO-UPDATING updated_at
-- ==============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trig_admin_users_updated_at') THEN
    CREATE TRIGGER trig_admin_users_updated_at BEFORE UPDATE ON admin_users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trig_facebook_pages_updated_at') THEN
    CREATE TRIGGER trig_facebook_pages_updated_at BEFORE UPDATE ON facebook_pages FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trig_page_tokens_updated_at') THEN
    CREATE TRIGGER trig_page_tokens_updated_at BEFORE UPDATE ON page_tokens FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trig_posts_updated_at') THEN
    CREATE TRIGGER trig_posts_updated_at BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trig_comments_updated_at') THEN
    CREATE TRIGGER trig_comments_updated_at BEFORE UPDATE ON comments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trig_moderation_rules_updated_at') THEN
    CREATE TRIGGER trig_moderation_rules_updated_at BEFORE UPDATE ON moderation_rules FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trig_moderation_jobs_updated_at') THEN
    CREATE TRIGGER trig_moderation_jobs_updated_at BEFORE UPDATE ON moderation_jobs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE facebook_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 1. admin_users policies
CREATE POLICY "Active admins can view admin accounts"
  ON admin_users FOR SELECT
  USING (is_active_admin());

CREATE POLICY "Super admins can manage admin accounts"
  ON admin_users FOR ALL
  USING (is_super_admin());

-- 2. facebook_pages policies
CREATE POLICY "Active admins can view facebook pages"
  ON facebook_pages FOR SELECT
  USING (is_active_admin());

CREATE POLICY "Super admins can manage facebook pages"
  ON facebook_pages FOR ALL
  USING (is_super_admin());

-- 3. page_tokens policies (CRITICAL SECURITY: Strictly Super Admin or Server Service Role)
CREATE POLICY "Super admins can view tokens"
  ON page_tokens FOR SELECT
  USING (is_super_admin());

CREATE POLICY "Super admins can manage tokens"
  ON page_tokens FOR ALL
  USING (is_super_admin());

-- 4. posts policies
CREATE POLICY "Active admins can view posts"
  ON posts FOR SELECT
  USING (is_active_admin());

-- 5. comments policies
CREATE POLICY "Active admins can view comments"
  ON comments FOR SELECT
  USING (is_active_admin());

CREATE POLICY "Active admins can update comment moderation status"
  ON comments FOR UPDATE
  USING (is_active_admin())
  WITH CHECK (is_active_admin());

-- 6. moderation_rules policies
CREATE POLICY "Active admins can view moderation rules"
  ON moderation_rules FOR SELECT
  USING (is_active_admin());

CREATE POLICY "Super admins can manage moderation rules"
  ON moderation_rules FOR ALL
  USING (is_super_admin());

-- 7. moderation_results policies
CREATE POLICY "Active admins can view moderation results"
  ON moderation_results FOR SELECT
  USING (is_active_admin());

-- 8. moderation_jobs policies
CREATE POLICY "Active admins can view moderation jobs"
  ON moderation_jobs FOR SELECT
  USING (is_active_admin());

-- 9. moderation_actions policies
CREATE POLICY "Active admins can view moderation actions"
  ON moderation_actions FOR SELECT
  USING (is_active_admin());

CREATE POLICY "Active admins can insert moderation actions"
  ON moderation_actions FOR INSERT
  WITH CHECK (is_active_admin());

-- 10. audit_logs policies
CREATE POLICY "Active admins can view audit logs"
  ON audit_logs FOR SELECT
  USING (is_active_admin());

CREATE POLICY "Active admins can insert audit logs"
  ON audit_logs FOR INSERT
  WITH CHECK (is_active_admin());

-- 11. notifications policies
CREATE POLICY "Active admins can view their notifications"
  ON notifications FOR SELECT
  USING (is_active_admin() AND (admin_id IS NULL OR admin_id = auth.uid()));

CREATE POLICY "Active admins can update their notifications"
  ON notifications FOR UPDATE
  USING (is_active_admin() AND (admin_id IS NULL OR admin_id = auth.uid()));

-- ==============================================================================
-- DEFAULT SEED MODERATION RULES (Initial Church Baseline)
-- ==============================================================================
INSERT INTO moderation_rules (name, category, description, severity, action, is_enabled)
VALUES
  ('Threat Detection', 'threat', 'Explicit violent threats, physical harm threats towards church staff or members', 'critical', 'alert', true),
  ('Hate Speech', 'hate_speech', 'Dehumanizing language, racial slurs, tribalistic abuse, xenophobia (English/Shona/Ndebele)', 'high', 'human_review', true),
  ('Religious Harassment & Blasphemy Abuses', 'religious_harassment', 'Targeted malicious harassment or desecration targeting church pastors, leaders, or beliefs', 'high', 'human_review', true),
  ('Personal Defamation & Insults', 'insult', 'Direct personal attacks, slanderous claims, or vulgar harassment towards individuals', 'medium', 'flag', true),
  ('Commercial & Financial Scams', 'scam', 'Fake miracle promises requiring money, deceptive financial offers, loan sharks, phishing links', 'high', 'flag', true),
  ('Spam & Off-Topic Promotion', 'spam', 'Repeated copy-pasted advertisements, unrelated commercial links, broadcast noise', 'low', 'flag', true),
  ('Profanity & Obscene Vulgarities', 'profanity', 'Explicit sexual terms, foul obscenities, or coarse vulgarities', 'medium', 'flag', true),
  ('Respectful Disagreement & Constructive Questions', 'discussion', 'Doctrinal questions, genuine church feedback, or respectful critique (Must NOT be suppressed)', 'low', 'allow', true)
ON CONFLICT DO NOTHING;
