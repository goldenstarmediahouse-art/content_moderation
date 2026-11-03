-- ==============================================================================
-- GOLDEN STAR MEDIA HOUSE — CHURCH FACEBOOK COMMENT MODERATION SYSTEM
-- MIGRATION 002: COMPLETE HUMAN MODERATION WORKFLOW & CASE MANAGEMENT
-- ==============================================================================

-- 1. ADD CASE MANAGEMENT & ASSIGNMENT COLUMNS TO comments TABLE
ALTER TABLE comments 
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_escalated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS escalation_reason TEXT,
  ADD COLUMN IF NOT EXISTS escalation_priority TEXT CHECK (escalation_priority IN ('low', 'medium', 'high', 'urgent')),
  ADD COLUMN IF NOT EXISTS external_action_status TEXT NOT NULL DEFAULT 'none' 
    CHECK (external_action_status IN ('none', 'pending_facebook_sync', 'synced_facebook', 'failed_facebook'));

-- 2. EXPAND moderation_status CHECK CONSTRAINT TO INCLUDE 'escalated' AND 'deleted'
ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_moderation_status_check;
ALTER TABLE comments ADD CONSTRAINT comments_moderation_status_check 
  CHECK (moderation_status IN ('pending', 'approved', 'flagged', 'hidden', 'restored', 'review_required', 'escalated', 'deleted'));

-- 3. EXPAND moderation_actions action CHECK CONSTRAINT
ALTER TABLE moderation_actions DROP CONSTRAINT IF EXISTS moderation_actions_action_check;
ALTER TABLE moderation_actions ADD CONSTRAINT moderation_actions_action_check 
  CHECK (action IN ('approved', 'hidden', 'restored', 'flagged', 'threat_alerted', 'escalated', 'deleted', 'overridden', 'assigned', 'reassigned', 'claimed', 'released'));

-- 4. CREATE comment_notes TABLE FOR PRIVATE INTERNAL COLLABORATION
CREATE TABLE IF NOT EXISTS comment_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. INDEXES FOR WORKLOAD AND FILTER PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_comments_assigned_to ON comments(assigned_to);
CREATE INDEX IF NOT EXISTS idx_comments_is_escalated ON comments(is_escalated);
CREATE INDEX IF NOT EXISTS idx_comment_notes_comment_id ON comment_notes(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_notes_created_at ON comment_notes(created_at ASC);

-- 6. ROW LEVEL SECURITY (RLS) FOR comment_notes
ALTER TABLE comment_notes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'comment_notes' AND policyname = 'Active admins can view notes'
  ) THEN
    CREATE POLICY "Active admins can view notes"
      ON comment_notes FOR SELECT
      USING (is_active_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'comment_notes' AND policyname = 'Active admins can insert notes'
  ) THEN
    CREATE POLICY "Active admins can insert notes"
      ON comment_notes FOR INSERT
      WITH CHECK (is_active_admin() AND admin_id = auth.uid());
  END IF;
END $$;
