CREATE TABLE copilot_conversations (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_id text NOT NULL,
  agent_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE(workspace_id, owner_id, agent_id)
);
CREATE TABLE copilot_turns (
  id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES copilot_conversations(id) ON DELETE CASCADE,
  request_hash text NOT NULL,
  state jsonb NOT NULL,
  checkpoint jsonb NOT NULL DEFAULT '[]',
  lease_token text,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX copilot_turns_conversation ON copilot_turns(conversation_id, created_at);
CREATE INDEX copilot_conversations_expiry ON copilot_conversations(expires_at);
CREATE TABLE copilot_draft_edits (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  package_id text NOT NULL,
  action_id text NOT NULL,
  request_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
