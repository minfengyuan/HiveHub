CREATE TABLE IF NOT EXISTS admins (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), username text NOT NULL UNIQUE, password_hash text NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (id text PRIMARY KEY, admin_id uuid NOT NULL REFERENCES admins(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS task_lists (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, inbox boolean NOT NULL DEFAULT false);
CREATE UNIQUE INDEX IF NOT EXISTS single_inbox ON task_lists(inbox) WHERE inbox;
CREATE TABLE IF NOT EXISTS tasks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),title text NOT NULL,notes text NOT NULL DEFAULT '',list_id uuid NOT NULL REFERENCES task_lists(id),completed boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS prompt_categories (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL);
CREATE TABLE IF NOT EXISTS prompts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),title text NOT NULL,body text NOT NULL,category_id uuid REFERENCES prompt_categories(id) ON DELETE SET NULL,tags jsonb NOT NULL DEFAULT '[]',favorite boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS servers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,host text NOT NULL,port integer NOT NULL DEFAULT 22,username text NOT NULL,secret text NOT NULL,group_name text NOT NULL DEFAULT '',tags jsonb NOT NULL DEFAULT '[]',notes text NOT NULL DEFAULT '',fingerprint text,metrics jsonb,last_success timestamptz,last_attempt timestamptz,error text);
INSERT INTO task_lists(name,inbox) VALUES ('收件箱',true) ON CONFLICT DO NOTHING;
