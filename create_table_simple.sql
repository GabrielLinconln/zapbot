-- SQL simplificado para criar apenas a tabela de eventos
-- Execute este código no SQL Editor do Supabase (https://app.supabase.com)

-- Criar tabela única para todos os eventos
CREATE TABLE IF NOT EXISTS "whatsapp_events" (
  id serial PRIMARY KEY,
  timestamp timestamptz NOT NULL,
  event_type varchar(10) NOT NULL,
  user_id varchar(255) NOT NULL,
  group_id varchar(255) NOT NULL,
  group_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  event_key text NOT NULL,
  CONSTRAINT whatsapp_events_event_key_unique UNIQUE (event_key)
);

-- Índices para melhorar performance das consultas mais comuns
CREATE INDEX IF NOT EXISTS whatsapp_events_group_id_idx ON "whatsapp_events" (group_id);
CREATE INDEX IF NOT EXISTS whatsapp_events_timestamp_idx ON "whatsapp_events" (timestamp);
CREATE INDEX IF NOT EXISTS whatsapp_events_event_type_idx ON "whatsapp_events" (event_type);

-- Adicionar políticas de acesso (opcional)
ALTER TABLE "whatsapp_events" ENABLE ROW LEVEL SECURITY;

-- Política que permite todas as operações para o service_role
CREATE POLICY "Service role has full access"
  ON "whatsapp_events"
  FOR ALL
  TO service_role
  USING (true);

-- Inserir um registro de teste (remover ou comentar esta linha após testar)
INSERT INTO "whatsapp_events" (timestamp, event_type, user_id, group_id, group_name, event_key)
VALUES 
  (now(), 'JOIN', 'usuario_teste', 'grupo_teste@g.us', 'Grupo de Teste', 'teste_key_' || extract(epoch from now())::text)
RETURNING *; 