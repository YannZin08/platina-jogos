-- Nome/descrição em português das conquistas Steam, quando a Steam fornece
-- essa tradução (nem todo jogo tem localização pt-BR). Nulo = usa o original.
alter table trophies add column name_pt text;
alter table trophies add column description_pt text;
