-- comunicar_rodada4 (14/10/2026) — só ADITIVO. Carteiro tolerante ao Render dormindo.
--
-- Fato: em 14/10 o pg_cron `comunicar-carteiro` levou 503 (hibernate-wake-error)
-- às 16:35 e 19:05 e estourou 90 s às 17:35 e 18:05 (4 de ~24 chamadas).
--
-- 1. posvenda_envios.enviando_em  — reserva antes de ir ao WhatsApp (sem duplicar)
--    posvenda_envios.expira_em    — validade (lembrete depois do horário não sai)
-- 2. comunicar_carteiro_batidas   — cada rodada que o servidor fez (origem, duração, números)
--    comunicar_carteiro_chamadas  — cada chamada do pg_cron (id do pg_net → status 200/503/tempo)
-- 3. comunicar_carteiro_chamar(origem) — chama /api/rodar?origem=… e anota o id
--    comunicar_carteiro_reforco()      — de 5 em 5 min: se a última rodada tem 17+ min, chama de novo
--    comunicar_chamadas_recentes(h)    — as chamadas com o resultado do pg_net (para a tela)
-- 4. o job `comunicar-carteiro` passa a usar comunicar_carteiro_chamar('cron')
--    e nasce o job `comunicar-carteiro-reforco` (2,7,12… minutos, 8h–20h SP).
-- A função antiga comunicar_acordar_carteiro() fica como está (sem uso).

alter table public.posvenda_envios add column if not exists enviando_em timestamptz;
alter table public.posvenda_envios add column if not exists expira_em timestamptz;
create index if not exists posvenda_envios_reserva_idx on public.posvenda_envios (enviando_em) where status = 'pendente' and enviando_em is not null;
create index if not exists posvenda_envios_expira_idx on public.posvenda_envios (expira_em) where status = 'pendente' and expira_em is not null;

alter table public.posvenda_config add column if not exists carteiro_reforco_em timestamptz;

create table if not exists public.comunicar_carteiro_batidas (
  id bigserial primary key,
  em timestamptz not null default now(),
  origem text not null default 'desconhecido'
    check (origem in ('cron', 'reforco', 'timer', 'inicio', 'manual', 'github', 'desconhecido')),
  duracao_ms integer,
  ok boolean not null default true,
  criados integer not null default 0,
  enviados integer not null default 0,
  falhas integer not null default 0,
  expirados integer not null default 0,
  presos integer not null default 0,
  aviso text,
  erro text,
  versao text
);
create index if not exists comunicar_carteiro_batidas_em_idx on public.comunicar_carteiro_batidas (em desc);
alter table public.comunicar_carteiro_batidas enable row level security;

create table if not exists public.comunicar_carteiro_chamadas (
  id bigserial primary key,
  em timestamptz not null default now(),
  origem text not null,
  request_id bigint
);
create index if not exists comunicar_carteiro_chamadas_em_idx on public.comunicar_carteiro_chamadas (em desc);
alter table public.comunicar_carteiro_chamadas enable row level security;

create or replace function public.comunicar_carteiro_chamar(p_origem text default 'cron')
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare c record; v_id bigint; v_origem text;
begin
  v_origem := case when p_origem in ('cron', 'reforco') then p_origem else 'cron' end;
  select runner_token, carteiro_url into c from public.posvenda_config where id = true;
  if c.runner_token is null or c.carteiro_url is null then return null; end if;
  select net.http_post(
    url := c.carteiro_url || case when position('?' in c.carteiro_url) > 0 then '&' else '?' end || 'origem=' || v_origem,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Runner-Token', c.runner_token, 'X-Origem', v_origem),
    timeout_milliseconds := 100000
  ) into v_id;
  insert into public.comunicar_carteiro_chamadas (origem, request_id) values (v_origem, v_id);
  delete from public.comunicar_carteiro_chamadas where em < now() - interval '14 days';
  delete from public.comunicar_carteiro_batidas where em < now() - interval '30 days';
  return v_id;
end $$;

create or replace function public.comunicar_carteiro_reforco()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare c record; v_hora int;
begin
  v_hora := extract(hour from (now() at time zone 'America/Sao_Paulo'))::int;
  if v_hora < 8 or v_hora > 20 then return null; end if;
  select ultima_rodada_em, carteiro_reforco_em, runner_token into c from public.posvenda_config where id = true;
  if c.runner_token is null then return null; end if;
  if c.ultima_rodada_em is not null and c.ultima_rodada_em > now() - interval '17 minutes' then return null; end if;
  if c.carteiro_reforco_em is not null and c.carteiro_reforco_em > now() - interval '4 minutes' then return null; end if;
  update public.posvenda_config set carteiro_reforco_em = now() where id = true;
  return public.comunicar_carteiro_chamar('reforco');
end $$;

create or replace function public.comunicar_chamadas_recentes(p_horas integer default 24)
returns table (em timestamptz, origem text, request_id bigint, status_code integer, timed_out boolean, erro text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.em, c.origem, c.request_id, r.status_code, r.timed_out, left(r.error_msg, 160)
  from public.comunicar_carteiro_chamadas c
  left join net._http_response r on r.id = c.request_id
  where c.em > now() - make_interval(hours => least(greatest(coalesce(p_horas, 24), 1), 336))
  order by c.em desc
  limit 400
$$;

revoke all on function public.comunicar_carteiro_chamar(text) from public, anon, authenticated;
revoke all on function public.comunicar_carteiro_reforco() from public, anon, authenticated;
revoke all on function public.comunicar_chamadas_recentes(integer) from public, anon, authenticated;
grant execute on function public.comunicar_chamadas_recentes(integer) to service_role;

-- o job de sempre passa a anotar a chamada; o reforço nasce
select cron.schedule('comunicar-carteiro', '5,20,35,50 11-23 * * *', $$select public.comunicar_carteiro_chamar('cron')$$);
select cron.schedule('comunicar-carteiro-reforco', '2-59/5 11-23 * * *', $$select public.comunicar_carteiro_reforco()$$);
