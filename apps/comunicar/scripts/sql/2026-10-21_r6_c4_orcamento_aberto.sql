-- Rodada 6 · C4 (Comunicar): cliente com orçamento esperando resposta no Orçador não recebe "sumiu" nem "não fechou".
-- Aditivo: uma coluna com padrão ligado; nada existente muda.
alter table public.posvenda_config
  add column if not exists bloquear_com_orcamento_aberto boolean not null default true;
comment on column public.posvenda_config.bloquear_com_orcamento_aberto is
  'Rodada 6: reativação e "não fechou" esperam enquanto o cliente tem orçamento enviado e sem decisão no Orçador.';
