-- comunicar_rodada5 (16/10/2026) — só ADITIVO. Carteiro à prova de falhas,
-- segmentos salvos e preparo para a IndyCar Central.
--
-- 1. posvenda_config: cadência segura (limite por minuto, por dia, intervalo entre
--    mensagens ao mesmo cliente, só horário comercial) + o estado do WhatsApp que o
--    carteiro viu por último (o Render dorme e perde a memória do processo).
-- 2. posvenda_envios.erro_classe: a CLASSE do erro (chave_recusada ≠ numero_invalido
--    ≠ instabilidade ≠ desconectado…) para o painel "Saúde do WhatsApp" e o relatório.
-- 3. comunicar_segmentos: segmentos de campanha salvos com nome (RLS ligado sem
--    política: só o servidor, com a chave de serviço, lê/grava — igual às outras comunicar_*).
--
-- O que a Central (onda B2) precisa saber: o pg_cron chama posvenda_config.carteiro_url
-- (hoje https://indycar-posvenda.onrender.com/api/rodar). Quando o Comunicar passar a
-- viver em /comunicar/ na Central, troque SÓ esse valor (modelo em
-- scripts/sql/trocar-carteiro-url.sql) — os jobs e as funções não mudam.

alter table public.posvenda_config add column if not exists limite_por_minuto smallint not null default 10
  check (limite_por_minuto between 1 and 60);
alter table public.posvenda_config add column if not exists limite_por_dia smallint not null default 300
  check (limite_por_dia between 1 and 5000);
alter table public.posvenda_config add column if not exists intervalo_mesmo_cliente_min smallint not null default 60
  check (intervalo_mesmo_cliente_min between 0 and 1440);
alter table public.posvenda_config add column if not exists so_horario_comercial boolean not null default false;
alter table public.posvenda_config add column if not exists whatsapp_estado text
  check (whatsapp_estado is null or whatsapp_estado in ('ok', 'chave_recusada', 'sem_chave', 'sem_aparelho', 'desconectado', 'limite', 'instabilidade', 'nao_entregue', 'desconhecido'));
alter table public.posvenda_config add column if not exists whatsapp_estado_em timestamptz;
alter table public.posvenda_config add column if not exists whatsapp_motivo text;

alter table public.posvenda_envios add column if not exists erro_classe text
  check (erro_classe is null or erro_classe in ('chave_recusada', 'sem_chave', 'sem_aparelho', 'desconectado', 'limite', 'numero_invalido', 'nao_entregue', 'instabilidade', 'desconhecido'));
create index if not exists posvenda_envios_erro_classe_idx on public.posvenda_envios (erro_classe, enviar_em desc) where erro_classe is not null;
-- a fila do carteiro ordena por prioridade do tipo e hora: (status, enviar_em) já tem índice pela rodada 5 do banco; o de tipo entra aqui
create index if not exists posvenda_envios_pendente_tipo_idx on public.posvenda_envios (tipo, enviar_em) where status = 'pendente';

create table if not exists public.comunicar_segmentos (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null check (length(nome) between 2 and 60),
  filtro           text not null check (filtro in ('todos', 'aniversariantes_mes', 'atendidos', 'sem_voltar', 'faltaram', 'servico')),
  valor            text,
  criado_por       uuid references public.perfis(id) on delete set null,
  criado_por_nome  text,
  usado_em         timestamptz,
  usos             integer not null default 0,
  created_at       timestamptz not null default now()
);
alter table public.comunicar_segmentos enable row level security;
revoke all on public.comunicar_segmentos from anon, authenticated;
create index if not exists comunicar_segmentos_criado_por_idx on public.comunicar_segmentos (criado_por);

comment on column public.posvenda_config.limite_por_minuto is 'Comunicar: mensagens por minuto no máximo (cadência sem cara de disparo)';
comment on column public.posvenda_config.limite_por_dia is 'Comunicar: mensagens por dia no máximo; campanha maior é escalonada nos dias seguintes';
comment on column public.posvenda_config.intervalo_mesmo_cliente_min is 'Comunicar: minutos entre duas mensagens ao mesmo cliente na mesma rodada';
comment on column public.posvenda_config.whatsapp_estado is 'Comunicar: último estado do WhatsApp visto pelo carteiro (ok, chave_recusada, …)';
comment on column public.posvenda_envios.erro_classe is 'Comunicar: classe do erro de envio (chave_recusada, numero_invalido, instabilidade, …)';
comment on table public.comunicar_segmentos is 'Comunicar: segmentos de campanha salvos com nome (só o servidor mexe)';

-- comunicar_rodada5_origem (16/10/2026, mesmo dia): quem propôs a campanha — 'comunicar' (padrão) ou 'crm'
-- (o CRM grava propostas em comunicar_campanhas com status 'aguardando' e lista de destinos).
alter table public.comunicar_campanhas add column if not exists origem text not null default 'comunicar'
  check (origem in ('comunicar', 'crm', 'atendimento', 'agenda', 'ia'));
comment on column public.comunicar_campanhas.origem is 'Comunicar: app que propôs a campanha (comunicar, crm, atendimento, agenda, ia)';
