-- Comunicar — rodada 3 (13/10/2026): migração `comunicar_aprovacao` (só ADITIVA)
--   • comunicar_campanhas: campanha criada por atendente espera a aprovação do gestor
--   • posvenda_envios: quem mandou (criado_por_id), de que campanha veio, tarefa gerada
--   • posvenda_config.resumo_equipe_em: último resumo semanal mandado aos gestores
--   • comunicar_gestores(): quem recebe os avisos do Comunicar (admin, ou gestor com o app)
--   • gatilho comunicar_tarefa_da_resposta: "não ficou bom" no pós-venda vira TAREFA para
--     o dono da conversa (ou o gestor) + notificação imediata aos gestores
-- RLS ligado sem política nas tabelas novas: só o servidor (service role) lê/grava.

create table if not exists public.comunicar_campanhas (
  id               uuid primary key default gen_random_uuid(),
  status           text not null default 'aguardando'
                   check (status in ('aguardando', 'aprovada', 'recusada', 'cancelada')),
  corpo            text not null check (length(corpo) between 1 and 2000),
  detalhe          text,
  segmento         jsonb,          -- {filtro, valor} quando é por grupo
  destinos         jsonb,          -- [{cliente_id, telefone, nome, carro, placa}] quando é lista
  total_previsto   integer,
  enviar_em        timestamptz,
  criado_por       uuid references public.perfis(id) on delete set null,
  criado_por_nome  text,
  decidido_por     uuid references public.perfis(id) on delete set null,
  decidido_por_nome text,
  decidido_em      timestamptz,
  motivo_recusa    text,
  lote             uuid,
  enfileirados     integer,
  pulados          integer,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.comunicar_campanhas enable row level security;
revoke all on public.comunicar_campanhas from anon, authenticated;
create index if not exists comunicar_campanhas_aguardando_idx on public.comunicar_campanhas (created_at desc) where status = 'aguardando';
create index if not exists comunicar_campanhas_criado_por_idx on public.comunicar_campanhas (criado_por);
create index if not exists comunicar_campanhas_decidido_por_idx on public.comunicar_campanhas (decidido_por);

alter table public.posvenda_envios add column if not exists criado_por_id uuid references public.perfis(id) on delete set null;
alter table public.posvenda_envios add column if not exists campanha_id   uuid references public.comunicar_campanhas(id) on delete set null;
alter table public.posvenda_envios add column if not exists tarefa_id     uuid references public.tarefas(id) on delete set null;
create index if not exists posvenda_envios_criado_por_id_idx on public.posvenda_envios (criado_por_id) where criado_por_id is not null;
create index if not exists posvenda_envios_campanha_id_idx   on public.posvenda_envios (campanha_id)   where campanha_id is not null;
create index if not exists posvenda_envios_tarefa_id_idx     on public.posvenda_envios (tarefa_id)     where tarefa_id is not null;
create index if not exists posvenda_envios_falhou_idx        on public.posvenda_envios (tipo, created_at desc) where status = 'falhou';

alter table public.posvenda_config add column if not exists resumo_equipe_em timestamptz;

-- Quem recebe os avisos do Comunicar: admin sempre; gestor só se tem o app.
-- p_tipo: respeita perfis.preferencias -> 'notificacoes' -> <tipo> = false (a pessoa desligou).
create or replace function public.comunicar_gestores(p_tipo text default null)
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select p.id from public.perfis p
   where p.ativo
     and (p.papel = 'admin' or (p.papel = 'gestor' and 'comunicar' = any(coalesce(p.apps, '{}'))))
     and (p_tipo is null or coalesce(p.preferencias -> 'notificacoes' ->> p_tipo, 'true') <> 'false')
   order by (p.papel = 'admin') desc, p.recebe_leads desc nulls last, p.created_at;
$$;
revoke execute on function public.comunicar_gestores(text) from public, anon, authenticated;

-- "Não ficou bom" no pós-venda: tarefa para quem cuida do cliente + aviso aos gestores.
-- BEFORE UPDATE OF resposta_tipo: grava new.tarefa_id na mesma linha (a IA não duplica).
-- Nunca derruba a resposta do cliente: qualquer erro aqui só pula a automação.
create or replace function public.comunicar_tarefa_da_resposta()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_conv uuid; v_dono uuid; v_resp uuid; v_tarefa uuid; v_nome text; g uuid;
begin
  v_nome := coalesce(nullif(trim(new.nome), ''), new.telefone, 'Cliente');
  v_conv := new.conversa_id;
  if v_conv is null then
    select c.id into v_conv from public.conversas c
     where c.telefone_e164 = public.normalizar_telefone(new.telefone) limit 1;
  end if;
  if v_conv is not null then
    select c.atribuida_a into v_dono from public.conversas c where c.id = v_conv;
  end if;
  -- o dono só vale se está ativo e é da equipe
  if v_dono is not null and not exists (select 1 from public.perfis p where p.id = v_dono and p.ativo
                                          and p.papel in ('admin', 'gestor', 'atendente')) then
    v_dono := null;
  end if;
  v_resp := coalesce(v_dono, (select x from public.comunicar_gestores() x limit 1));

  insert into public.tarefas (titulo, descricao, responsavel_id, cliente_id, conversa_id, agendamento_id,
                              origem, prioridade, vence_em)
  values (left('Cliente insatisfeito no pós-venda: ' || v_nome, 200),
          'Respondeu ao pós-venda: "' || left(coalesce(new.resposta, ''), 300) || '". Ligue ou responda hoje.',
          v_resp, new.cliente_id, v_conv, new.agendamento_id, 'comunicar', 1, now() + interval '4 hours')
  returning id into v_tarefa;
  new.tarefa_id := v_tarefa;

  for g in select x from public.comunicar_gestores('reclamacao') x loop
    perform public.notificar(g, 'reclamacao', left(v_nome || ' não gostou do serviço', 140),
      left(coalesce(new.resposta, ''), 300),
      case when new.cliente_id is not null then '/?cliente=' || new.cliente_id else null end,
      'comunicar', 'reclamacao:' || new.id);
  end loop;
  return new;
exception when others then
  return new;
end $$;
revoke execute on function public.comunicar_tarefa_da_resposta() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'comunicar_tarefa_da_resposta'
                  and tgrelid = 'public.posvenda_envios'::regclass) then
    create trigger comunicar_tarefa_da_resposta
      before update of resposta_tipo on public.posvenda_envios
      for each row
      when (new.tipo = 'posvenda' and new.resposta_tipo = 'negativa'
            and old.resposta_tipo is distinct from 'negativa' and new.tarefa_id is null)
      execute function public.comunicar_tarefa_da_resposta();
  end if;
end $$;
