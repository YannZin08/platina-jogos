-- Tempo total jogado (em minutos), como reportado pela Steam. PSN não expõe
-- esse dado pela API, então fica nulo pra jogos dessa plataforma.
alter table user_games add column playtime_minutes int;
