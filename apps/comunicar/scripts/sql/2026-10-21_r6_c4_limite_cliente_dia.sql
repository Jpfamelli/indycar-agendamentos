-- Rodada 6 · C4 (Comunicar): teto de mensagens automáticas por cliente por dia vira configuração (antes era fixo em 3).
-- Aditivo: uma coluna com padrão 3 (o mesmo valor de antes) e limite de 1 a 10; nada existente muda.
alter table public.posvenda_config
  add column if not exists max_mensagens_cliente_dia integer not null default 3;
alter table public.posvenda_config
  drop constraint if exists posvenda_config_max_mensagens_cliente_dia_chk;
alter table public.posvenda_config
  add constraint posvenda_config_max_mensagens_cliente_dia_chk check (max_mensagens_cliente_dia between 1 and 10);
comment on column public.posvenda_config.max_mensagens_cliente_dia is
  'Rodada 6: no máximo N mensagens automáticas por cliente no mesmo dia (lembrete e avisos do Pátio continuam fora da conta).';
