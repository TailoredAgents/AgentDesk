ALTER TABLE proposed_actions DROP CONSTRAINT proposed_actions_kind_check;
ALTER TABLE proposed_actions ADD CONSTRAINT proposed_actions_kind_check CHECK(kind IN ('summary','crm_note','message','task','listing_update','question','intelligence','task_update'));
ALTER TABLE proposed_actions ADD COLUMN change jsonb;
ALTER TABLE conversations DROP CONSTRAINT conversations_source_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_source_check CHECK(source IN ('note','audio','sample','followup','correction'));
ALTER TABLE work_packages DROP CONSTRAINT work_packages_origin_check;
ALTER TABLE work_packages ADD CONSTRAINT work_packages_origin_check CHECK(origin IN ('sample','openai','human'));
CREATE TABLE client_facts (
 id text PRIMARY KEY, workspace_id text NOT NULL REFERENCES workspaces(id), agent_id text NOT NULL, client_id text NOT NULL, property_id text,
 topic text NOT NULL CHECK(topic IN ('objective','communication','buyer_priority','cleaning','photography','staging','listing_launch')),
 value text NOT NULL, source_quote text NOT NULL, source_conversation_id text NOT NULL,
 certainty text NOT NULL CHECK(certainty IN ('confirmed','requested','uncertain','disputed')),
 effective_date text, status text NOT NULL CHECK(status IN ('current','superseded','retired')),
 recorded_at timestamptz NOT NULL, reviewed_at timestamptz NOT NULL, reviewer text NOT NULL,
 source_action_id text UNIQUE, supersedes jsonb NOT NULL DEFAULT '[]', human_edited boolean NOT NULL DEFAULT false,
 UNIQUE(workspace_id,id),
 FOREIGN KEY(workspace_id,agent_id) REFERENCES agents(workspace_id,id),
 FOREIGN KEY(workspace_id,client_id) REFERENCES clients(workspace_id,id),
 FOREIGN KEY(workspace_id,property_id) REFERENCES properties(workspace_id,id),
 FOREIGN KEY(workspace_id,source_conversation_id) REFERENCES conversations(workspace_id,id),
 FOREIGN KEY(workspace_id,source_action_id) REFERENCES proposed_actions(workspace_id,id)
);
CREATE INDEX client_facts_relationship ON client_facts(workspace_id,agent_id,client_id,property_id,status);
