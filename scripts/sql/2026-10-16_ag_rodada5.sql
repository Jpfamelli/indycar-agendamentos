-- =============================================================================
-- Agenda · rodada 5 (16/10/2026) — migração ADITIVA, prefixo ag_
-- Aplicada pelo MCP do Supabase com o nome `ag_rodada5_horarios_espera_confirmacao`.
--   1. agenda_horarios_livres(p_dia, p_servico, p_consultor) — os horários
--      realmente livres de um dia, as MESMAS regras de horarios.js (seg–sáb,
--      8h–17h30, passo 30 min, duração por serviço, janelas de agendamento,
--      capacidade = consultores ativos, um carro por consultor por meia hora,
--      hoje só a partir de 30 min). SECURITY DEFINER, search_path '', só equipe
--      (ou a chave de serviço) — o papel `agenda` e o anon recebem 42501.
--   2. ag_lista_espera — quem quer um horário e não achou (encaixe).
--   3. ag_confirmacoes — o link de confirmação que o cliente abre (token),
--      a resposta dele e o selo "confirmou" na Agenda.
-- Nada aqui altera tabelas/funções da base. Teste: scripts/sql/teste_ag_rodada5.sql
-- =============================================================================

-- ---------- 1. horários livres como serviço ----------
-- texto sem acento, minúsculo, só letras/números/espaço (auxiliar da função abaixo)
create or replace function public.normalizar_texto_agenda(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(regexp_replace(lower(translate(coalesce(p, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')), '[^a-z0-9]+', ' ', 'g'));
$$;


create or replace function public.agenda_horarios_livres(p_dia date, p_servico text default null, p_consultor uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_papel     text;
  v_dow       int;
  v_agora     timestamptz := now() at time zone 'America/Sao_Paulo';
  v_hoje      date := (now() at time zone 'America/Sao_Paulo')::date;
  v_corte     int := -1;                 -- minutos desde a meia-noite a partir dos quais pode marcar (hoje: agora + 30)
  v_dur       int := 60;
  v_cap       int;
  v_ativos    uuid[];
  v_janelas   jsonb := '[]'::jsonb;
  v_horarios  jsonb := '[]'::jsonb;
  v_t         int;
  v_usados    int;
  v_ocupados  uuid[];
  v_livres    uuid[];
  v_motivo    text;
  v_serv      text := public.normalizar_texto_agenda(p_servico);
begin
  -- quem pode: equipe ativa (admin|gestor|atendente), a chave de serviço ou sessão direta do banco
  v_papel := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'role';
  if not (public.usuario_equipe() or v_papel = 'service_role' or v_papel is null) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  if p_dia is null then raise exception 'dia inválido' using errcode = '22023'; end if;

  select coalesce(array_agg(c.id order by c.nome), '{}') into v_ativos from public.consultores c where c.ativo;
  v_cap := greatest(1, coalesce(array_length(v_ativos, 1), 0));
  v_dow := extract(isodow from p_dia)::int;          -- 1 = segunda … 7 = domingo

  -- duração: cadastro de serviços (nome igual ou contido, o mais específico ganha); senão 60
  if v_serv <> '' then
    select s.duracao_min into v_dur
      from public.servicos s
     where s.duracao_min > 0
       and (public.normalizar_texto_agenda(s.nome) = v_serv
            or (length(public.normalizar_texto_agenda(s.nome)) >= 4
                and (v_serv like '%' || public.normalizar_texto_agenda(s.nome) || '%'
                     or public.normalizar_texto_agenda(s.nome) like '%' || v_serv || '%')))
     order by (public.normalizar_texto_agenda(s.nome) = v_serv) desc, length(s.nome) desc
     limit 1;
    v_dur := coalesce(v_dur, case
      when v_serv ~ '(revisao de motor|embreagem)' then 300
      when v_serv ~ 'correia' then 240
      when v_serv ~ '(cambio|suspensao|amortecedor|direcao|revisao)' then 120
      when v_serv ~ '(freio|pastilha|bico)' then 90
      when v_serv ~ '(pneu|balanceamento|ar condicionado)' then 60
      when v_serv ~ '(oleo|alinhamento)' then 45
      when v_serv ~ '(diagnostico|scanner)' then 30
      else 60 end);
    -- janelas de agendamento do tipo que casa com o serviço, no dia da semana pedido
    select coalesce(jsonb_agg(jsonb_build_object('inicio', to_char(j.inicio, 'HH24:MI'), 'fim', to_char(j.fim, 'HH24:MI')) order by j.inicio), '[]'::jsonb)
      into v_janelas
      from public.janelas_agendamento j
     where j.fim > j.inicio
       and (public.normalizar_texto_agenda(j.tipo_servico) like '%' || v_serv || '%'
            or v_serv like '%' || public.normalizar_texto_agenda(j.tipo_servico) || '%'
            or exists (select 1 from unnest(string_to_array(public.normalizar_texto_agenda(j.tipo_servico), ' ')) p
                        where length(p) >= 4 and v_serv like '%' || p || '%'))
       and v_dow = any (case
             when public.normalizar_texto_agenda(j.dias) ~ '^seg ?-? ?sab' then array[1,2,3,4,5,6]
             when public.normalizar_texto_agenda(j.dias) ~ '^seg ?-? ?sex' then array[1,2,3,4,5]
             when public.normalizar_texto_agenda(j.dias) ~ '^sab' then array[6]
             when public.normalizar_texto_agenda(j.dias) ~ '^dom' then array[7]
             when public.normalizar_texto_agenda(j.dias) ~ '^todos' then array[1,2,3,4,5,6,7]
             else array[1,2,3,4,5,6] end);
  end if;

  if v_dow = 7 then
    return jsonb_build_object('data', p_dia, 'aberto', false, 'motivo', 'domingo', 'duracao_min', v_dur, 'capacidade', v_cap, 'janelas', v_janelas, 'horarios', '[]'::jsonb);
  end if;
  if p_dia < v_hoje then
    return jsonb_build_object('data', p_dia, 'aberto', false, 'motivo', 'passou', 'duracao_min', v_dur, 'capacidade', v_cap, 'janelas', v_janelas, 'horarios', '[]'::jsonb);
  end if;
  if p_consultor is not null and not (p_consultor = any (v_ativos)) then
    return jsonb_build_object('data', p_dia, 'aberto', false, 'motivo', 'consultor_inativo', 'duracao_min', v_dur, 'capacidade', v_cap, 'janelas', v_janelas, 'horarios', '[]'::jsonb);
  end if;
  if p_dia = v_hoje then
    v_corte := extract(hour from v_agora)::int * 60 + extract(minute from v_agora)::int + 30;
  end if;

  v_t := 8 * 60;
  while v_t + v_dur <= 17 * 60 + 30 and v_t <= 17 * 60 loop
    if v_t >= v_corte and (jsonb_array_length(v_janelas) = 0 or exists (
         select 1 from jsonb_array_elements(v_janelas) j
          where v_t >= (split_part(j->>'inicio', ':', 1)::int * 60 + split_part(j->>'inicio', ':', 2)::int)
            and v_t <= (split_part(j->>'fim', ':', 1)::int * 60 + split_part(j->>'fim', ':', 2)::int))) then
      select count(*), coalesce(array_agg(a.consultor_id) filter (where a.consultor_id is not null), '{}')
        into v_usados, v_ocupados
        from public.agendamentos a
       where a.data = p_dia
         and a.status in ('aguardando', 'confirmado', 'compareceu', 'em_atendimento')
         and (extract(hour from a.hora)::int * 60 + (extract(minute from a.hora)::int / 30) * 30) = v_t;
      if v_usados < v_cap then
        select coalesce(array_agg(c), '{}') into v_livres from unnest(v_ativos) c where not (c = any (v_ocupados));
        if p_consultor is not null then
          if not (p_consultor = any (v_ocupados)) then
            v_horarios := v_horarios || jsonb_build_object('hora', to_char(make_time(v_t / 60, v_t % 60, 0), 'HH24:MI'),
              'fim', to_char(make_time((v_t + v_dur) / 60, (v_t + v_dur) % 60, 0), 'HH24:MI'), 'livres', 1, 'consultores_livres', to_jsonb(array[p_consultor]));
          end if;
        elsif coalesce(array_length(v_ativos, 1), 0) = 0 or coalesce(array_length(v_livres, 1), 0) > 0 then
          v_horarios := v_horarios || jsonb_build_object('hora', to_char(make_time(v_t / 60, v_t % 60, 0), 'HH24:MI'),
            'fim', to_char(make_time((v_t + v_dur) / 60, (v_t + v_dur) % 60, 0), 'HH24:MI'), 'livres', v_cap - v_usados, 'consultores_livres', to_jsonb(v_livres));
        end if;
      end if;
    end if;
    v_t := v_t + 30;
  end loop;

  v_motivo := case when jsonb_array_length(v_horarios) > 0 then null
                   when v_corte > 17 * 60 + 30 then 'encerrado'
                   when jsonb_array_length(v_janelas) > 0 then 'fora_da_janela'
                   else 'lotado' end;
  return jsonb_build_object('data', p_dia, 'aberto', true, 'motivo', v_motivo, 'duracao_min', v_dur, 'capacidade', v_cap,
    'janelas', v_janelas, 'horarios', v_horarios, 'gerado_em', now());
end $$;

revoke all on function public.agenda_horarios_livres(date, text, uuid) from public, anon;
grant execute on function public.agenda_horarios_livres(date, text, uuid) to authenticated, service_role;
revoke all on function public.normalizar_texto_agenda(text) from public, anon;
grant execute on function public.normalizar_texto_agenda(text) to authenticated, service_role;
comment on function public.agenda_horarios_livres(date, text, uuid) is
  'Agenda: horários realmente livres de um dia (seg–sáb 8h–17h30, passo 30 min, duração por serviço, janelas, capacidade = consultores ativos). Só equipe/service role.';

-- ---------- 2. lista de espera ----------
create table if not exists public.ag_lista_espera (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid references public.clientes(id) on delete set null,
  cliente_nome    text not null,
  telefone        text,
  telefone_e164   text generated always as (public.normalizar_telefone(telefone)) stored,
  veiculo         text,
  placa           text,
  servico         text not null,
  preferencia     text,                       -- "manhã", "tarde", "qualquer", texto livre curto
  de              date,                       -- a partir de quando serve
  ate             date,                       -- até quando serve
  observacoes     text,
  status          text not null default 'aberta' check (status in ('aberta','agendada','cancelada')),
  agendamento_id  uuid references public.agendamentos(id) on delete set null,
  criado_por      uuid references public.perfis(id) on delete set null,
  resolvido_por   uuid references public.perfis(id) on delete set null,
  resolvido_em    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists ag_lista_espera_status_idx on public.ag_lista_espera (status, created_at desc);
create index if not exists ag_lista_espera_tel_idx on public.ag_lista_espera (telefone_e164) where telefone_e164 is not null;
alter table public.ag_lista_espera enable row level security;
drop policy if exists "ag_espera equipe le" on public.ag_lista_espera;
create policy "ag_espera equipe le" on public.ag_lista_espera for select to authenticated using ((select public.usuario_equipe()));
drop policy if exists "ag_espera equipe cria" on public.ag_lista_espera;
create policy "ag_espera equipe cria" on public.ag_lista_espera for insert to authenticated with check ((select public.usuario_equipe()));
drop policy if exists "ag_espera equipe edita" on public.ag_lista_espera;
create policy "ag_espera equipe edita" on public.ag_lista_espera for update to authenticated using ((select public.usuario_equipe())) with check ((select public.usuario_equipe()));
drop policy if exists "ag_espera gestor apaga" on public.ag_lista_espera;
create policy "ag_espera gestor apaga" on public.ag_lista_espera for delete to authenticated using ((select public.usuario_gestor()));
comment on table public.ag_lista_espera is 'Agenda: clientes esperando um horário (encaixe). O servidor grava com a chave de serviço; a equipe lê.';

-- ---------- 3. confirmação do cliente (link/WhatsApp) ----------
create table if not exists public.ag_confirmacoes (
  id              uuid primary key default gen_random_uuid(),
  agendamento_id  uuid not null references public.agendamentos(id) on delete cascade,
  token           text not null unique default encode(gen_random_bytes(18), 'hex'),
  canal           text not null default 'whatsapp' check (canal in ('whatsapp','link','telefone','balcao')),
  enviado_em      timestamptz not null default now(),
  aberto_em       timestamptz,
  respondido_em   timestamptz,
  resposta        text check (resposta is null or resposta in ('confirmou','nao_vem','remarcar')),
  observacao      text,
  criado_por      uuid references public.perfis(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists ag_confirmacoes_ag_idx on public.ag_confirmacoes (agendamento_id, created_at desc);
alter table public.ag_confirmacoes enable row level security;
drop policy if exists "ag_conf equipe le" on public.ag_confirmacoes;
create policy "ag_conf equipe le" on public.ag_confirmacoes for select to authenticated using ((select public.usuario_equipe()));
comment on table public.ag_confirmacoes is 'Agenda: link de confirmação enviado ao cliente e a resposta dele. Só o servidor grava (token nunca sai para o navegador da equipe fora do link).';

-- trigger: a resposta "confirmou" liga agendamentos.confirmado (o selo do cartão e a tarefa "Confirmar com o cliente" já usam esse campo)
create or replace function public.ag_confirmacao_aplica()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.resposta = 'confirmou' and (old.resposta is distinct from new.resposta) then
    update public.agendamentos a set confirmado = true, status = case when a.status = 'aguardando' then 'confirmado'::public.agendamento_status else a.status end
     where a.id = new.agendamento_id and a.status in ('aguardando', 'confirmado');
  end if;
  return new;
exception when others then return new;
end $$;
drop trigger if exists ag_confirmacao_aplica on public.ag_confirmacoes;
create trigger ag_confirmacao_aplica after update of resposta on public.ag_confirmacoes
  for each row execute function public.ag_confirmacao_aplica();

-- (migração `ag_rodada5_revoke_trigger_fn`) a função do gatilho não é para ser chamada por ninguém pela API
revoke all on function public.ag_confirmacao_aplica() from public, anon, authenticated;
