-- ============================================================================
-- IndyCar Comunicar — v1 (09/10/2026)
-- O Pós-venda vira a central de comunicação da oficina. Esta migração:
--   1. clientes.aceita_mensagens (consentimento; "PARAR" pelo WhatsApp desliga)
--   2. posvenda_config: réguas novas (lembrete, orçamento, não fechou,
--      reativação, avaliação no Google), janela e intervalo mínimo
--   3. posvenda_envios: resposta do cliente, conversa, atribuição de retorno
--   4. comunicar_regras_retorno: prazo de revisão POR TIPO DE SERVIÇO
--   5. comunicar_modelos: biblioteca de mensagens prontas
--   6. gatilhos: resposta do cliente classifica o envio (👍/👎/PARAR) e vira
--      satisfação; agendamento novo é atribuído à última mensagem enviada
--   7. pg_cron acorda o carteiro no Render (além do GitHub Actions)
-- Aplicada no Supabase como migração `comunicar_v1`.
-- ============================================================================

-- 1) consentimento -----------------------------------------------------------
alter table public.clientes
  add column if not exists aceita_mensagens boolean not null default true,
  add column if not exists aceita_mensagens_em timestamptz,
  add column if not exists aceita_mensagens_motivo text;
-- índice por mês/dia (extract é IMMUTABLE; to_char não é e o Postgres recusa)
create index if not exists clientes_nascimento_mmdd_idx
  on public.clientes ((extract(month from nascimento)::int * 100 + extract(day from nascimento)::int))
  where nascimento is not null;

-- 2) réguas novas -------------------------------------------------------------
alter table public.posvenda_config
  add column if not exists ativo_lembrete boolean not null default false,
  add column if not exists msg_lembrete text not null default
    'Oi {primeiro_nome}! Lembrete da IndyCar: seu horário para {servico} é {quando}. Posso confirmar? Se precisar remarcar, é só responder por aqui. 🏁',
  add column if not exists horas_lembrete integer not null default 20,
  add column if not exists ativo_orcamento boolean not null default false,
  add column if not exists msg_orcamento text not null default
    'Oi {primeiro_nome}, aqui é da IndyCar! Conseguiu dar uma olhada no orçamento do {carro}? Se ficou alguma dúvida, me chama por aqui que a gente resolve junto. 🔧',
  add column if not exists dias_orcamento integer not null default 3,
  add column if not exists ativo_nao_fechou boolean not null default false,
  add column if not exists msg_nao_fechou text not null default
    'Oi {primeiro_nome}! Passando para saber se ainda posso ajudar com o {carro}. Quando quiser retomar, é só me chamar por aqui, sem compromisso. 🏁',
  add column if not exists dias_nao_fechou integer not null default 7,
  add column if not exists ativo_reativacao boolean not null default false,
  add column if not exists msg_reativacao text not null default
    'Oi {primeiro_nome}, tudo bem? Faz um tempo que a gente não vê o {carro} por aqui. Que tal um check-up gratuito de 30 min com scanner? É só responder por aqui para agendar. 🏁',
  add column if not exists meses_reativacao integer not null default 12,
  add column if not exists ativo_avaliacao boolean not null default false,
  add column if not exists msg_avaliacao text not null default
    'Que bom que ficou tudo certo, {primeiro_nome}! 🙌 Se puder, deixa uma avaliação rápida no Google, ajuda muito a gente: {link_avaliacao}',
  add column if not exists link_avaliacao text,
  add column if not exists intervalo_minimo_dias integer not null default 7,
  add column if not exists janela_inicio smallint not null default 8,
  add column if not exists janela_fim smallint not null default 20,
  add column if not exists envia_domingo boolean not null default false,
  add column if not exists pausa_geral boolean not null default false,
  add column if not exists telefone_teste text,
  add column if not exists runner_token text,
  add column if not exists carteiro_url text not null default 'https://indycar-posvenda.onrender.com/api/rodar';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'posvenda_config_faixas_check') then
    alter table public.posvenda_config add constraint posvenda_config_faixas_check check (
      horas_lembrete between 1 and 72 and dias_orcamento between 1 and 30 and dias_nao_fechou between 1 and 60
      and meses_reativacao between 3 and 36 and intervalo_minimo_dias between 0 and 60
      and janela_inicio between 0 and 23 and janela_fim between 1 and 24 and janela_inicio < janela_fim);
  end if;
end $$;

-- 3) envios: resposta, conversa, atribuição -----------------------------------
alter table public.posvenda_envios
  add column if not exists lead_id uuid references public.leads(id) on delete set null,
  add column if not exists conversa_id uuid references public.conversas(id) on delete set null,
  add column if not exists respondido_em timestamptz,
  add column if not exists resposta text,
  add column if not exists resposta_tipo text,
  add column if not exists agendou_depois_id uuid references public.agendamentos(id) on delete set null,
  add column if not exists tentativas smallint not null default 0,
  add column if not exists motivo_pulado text;

-- status e tipo: troca as checks antigas por listas completas
alter table public.posvenda_envios
  drop constraint if exists posvenda_envios_status_check,
  drop constraint if exists posvenda_envios_tipo_check,
  drop constraint if exists posvenda_envios_resposta_tipo_check;
alter table public.posvenda_envios
  add constraint posvenda_envios_status_check check (status in ('pendente','enviado','falhou','cancelado','pulado')),
  add constraint posvenda_envios_tipo_check check (tipo in
    ('aniversario','posvenda','retorno','campanha','avulsa','lembrete','orcamento','nao_fechou','reativacao','avaliacao')),
  add constraint posvenda_envios_resposta_tipo_check check (resposta_tipo is null or resposta_tipo in ('positiva','negativa','parar','neutra'));

create index if not exists posvenda_envios_telefone_idx on public.posvenda_envios (telefone, enviado_em desc);
create index if not exists posvenda_envios_agendamento_idx on public.posvenda_envios (agendamento_id);
create index if not exists posvenda_envios_lead_idx on public.posvenda_envios (lead_id);
create index if not exists posvenda_envios_conversa_idx on public.posvenda_envios (conversa_id);
create index if not exists posvenda_envios_tipo_idx on public.posvenda_envios (tipo, created_at desc);
create index if not exists posvenda_envios_respondido_idx on public.posvenda_envios (respondido_em desc) where respondido_em is not null;

alter table public.posvenda_respostas
  add column if not exists origem text not null default 'manual',
  add column if not exists texto_original text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'posvenda_respostas_origem_check') then
    alter table public.posvenda_respostas add constraint posvenda_respostas_origem_check check (origem in ('manual','whatsapp'));
  end if;
end $$;
create index if not exists posvenda_respostas_envio_idx on public.posvenda_respostas (envio_id);
create index if not exists posvenda_respostas_agendamento_idx on public.posvenda_respostas (agendamento_id);
create index if not exists posvenda_respostas_cliente_idx on public.posvenda_respostas (cliente_id, created_at desc);

-- 4) prazo de revisão por tipo de serviço -------------------------------------
create table if not exists public.comunicar_regras_retorno (
  id uuid primary key default gen_random_uuid(),
  rotulo text not null,
  palavras text[] not null,
  meses integer not null check (meses between 1 and 36),
  mensagem text,
  ativo boolean not null default true,
  ordem integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.comunicar_regras_retorno enable row level security;
drop trigger if exists comunicar_regras_retorno_updated_at on public.comunicar_regras_retorno;
create trigger comunicar_regras_retorno_updated_at before update on public.comunicar_regras_retorno
  for each row execute function public.tocar_updated_at();

insert into public.comunicar_regras_retorno (rotulo, palavras, meses, ordem)
select * from (values
  ('Troca de óleo do motor', array['óleo','oleo','lubrifica'], 6, 10),
  ('Filtros', array['filtro'], 6, 20),
  ('Alinhamento e balanceamento', array['alinhamento','balanceamento','cambagem','caster'], 6, 30),
  ('Freios', array['freio','pastilha','disco','lona','sapata'], 12, 40),
  ('Suspensão e direção', array['suspens','amortecedor','pivô','pivo','bucha','terminal','bandeja','balança','balanca','rolamento'], 12, 50),
  ('Correia dentada', array['correia','tensor'], 24, 60),
  ('Pneus', array['pneu','rodízio','rodizio'], 12, 70),
  ('Bateria', array['bateria'], 18, 80),
  ('Fluidos e arrefecimento', array['fluido','arrefecimento','radiador','aditivo','água','agua'], 12, 90),
  ('Câmbio e embreagem', array['câmbio','cambio','embreagem','diálise','dialise'], 24, 100),
  ('Injeção e ignição', array['inje','bico','vela','bobina','sonda','combust'], 12, 110),
  ('Ar-condicionado', array['ar-condicionado','ar condicionado','higieniza'], 12, 130),
  ('Revisão e diagnóstico', array['revis','check','diagn','scanner','avalia'], 6, 140)
) as v(rotulo, palavras, meses, ordem)
where not exists (select 1 from public.comunicar_regras_retorno);

-- 5) biblioteca de modelos ----------------------------------------------------
create table if not exists public.comunicar_modelos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  categoria text not null default 'geral',
  corpo text not null,
  ordem integer not null default 100,
  created_at timestamptz not null default now()
);
alter table public.comunicar_modelos enable row level security;
insert into public.comunicar_modelos (titulo, categoria, corpo, ordem)
select * from (values
  ('Promoção de troca de óleo', 'promoção', 'Oi {primeiro_nome}! Essa semana a IndyCar está com condição especial na troca de óleo com filtro. Quer garantir um horário para o {carro}? É só responder por aqui. 🏁', 10),
  ('Check-up antes de viajar', 'sazonal', 'Oi {primeiro_nome}! Vai pegar estrada no feriado? A IndyCar faz um check-up de viagem com scanner em 30 min, sem custo. Quer reservar um horário para o {carro}? 🛣️', 20),
  ('Freios na época de chuva', 'sazonal', 'Oi {primeiro_nome}, com as chuvas chegando vale conferir freios e pneus do {carro}. A gente faz a avaliação gratuita e só mexe no que precisar. Posso agendar? 🌧️', 30),
  ('Dia do Cliente', 'datas', 'Hoje é o Dia do Cliente e a IndyCar quer agradecer você, {primeiro_nome}! Obrigado pela confiança. Quem conhece, Indyca! 🏎️', 40),
  ('Fim de ano', 'datas', 'Oi {primeiro_nome}! A equipe da IndyCar Centro Automotivo deseja a você e à sua família um Natal cheio de paz e um ano novo de estradas tranquilas. 🎄🏁', 50),
  ('Volta às aulas', 'sazonal', 'Oi {primeiro_nome}! Rotina de volta e o {carro} vai rodar mais: que tal um check-up rápido antes? A avaliação é gratuita. Responda por aqui para agendar. 🎒', 60),
  ('Convite para avaliar no Google', 'relacionamento', 'Oi {primeiro_nome}! Se o atendimento da IndyCar foi bom para você, uma avaliação rápida no Google ajuda muito a gente a crescer. Obrigado! ⭐', 70),
  ('Aviso de horário especial', 'aviso', 'Oi {primeiro_nome}! Avisando que a IndyCar terá horário especial: {detalhe}. Qualquer coisa, é só chamar por aqui. 🏁', 80),
  ('Reagendar quem faltou', 'relacionamento', 'Oi {primeiro_nome}, sentimos sua falta no horário de hoje. Aconteceu algum imprevisto? Me diz um dia e horário bons para você que eu reservo de novo. 🏁', 90),
  ('Pesquisa rápida', 'relacionamento', 'Oi {primeiro_nome}! De 0 a 10, quanto você indicaria a IndyCar para um amigo? Sua resposta ajuda a gente a melhorar. 🙏', 100)
) as v(titulo, categoria, corpo, ordem)
where not exists (select 1 from public.comunicar_modelos);

-- 6) gatilhos -------------------------------------------------------------------
-- 6a. A resposta do cliente fecha o ciclo da mensagem automática.
create or replace function public.comunicar_registrar_resposta()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_env public.posvenda_envios%rowtype;
  v_tel text; v_txt text; v_tipo text; v_cli uuid; v_cfg public.posvenda_config%rowtype;
  v_corpo text; v_primeiro text;
begin
  if new.direcao is distinct from 'entrada' then return new; end if;
  v_txt := lower(trim(coalesce(new.corpo, '')));
  if v_txt = '' then return new; end if;
  v_tel := public.normalizar_telefone(new.telefone);
  if v_tel is null then return new; end if;

  select e.* into v_env from public.posvenda_envios e
   where e.status = 'enviado' and e.respondido_em is null
     and e.enviado_em > now() - interval '72 hours'
     and public.normalizar_telefone(e.telefone) = v_tel
   order by e.enviado_em desc limit 1;
  if not found then return new; end if;

  if v_txt ~ '(^|[^[:alnum:]])(parar|sair|remover|cancelar|descadastr|n[aã]o quero (mais )?(receber|mensag)|stop)([^[:alnum:]]|$)' then
    v_tipo := 'parar';
  elsif v_txt ~ '(^|[^[:alnum:]])(n[aã]o|nao ficou|ruim|p[eé]ssim|problema|reclama|insatisf|piorou|voltou|barulho|defeito|👎|😞|😡|😠)([^[:alnum:]]|$)' then
    v_tipo := 'negativa';
  elsif v_txt ~ '(^|[^[:alnum:]])(sim|ok|certo|tudo certo|tudo bem|[oó]tim|excelente|perfeito|show|top|maravilh|obrigad|valeu|gostei|ficou bom|confirm|pode ser|quero|vamos|bora|beleza|👍|🙏|😀|😊|❤|🏁)([^[:alnum:]]|$)' then
    v_tipo := 'positiva';
  else
    v_tipo := 'neutra';
  end if;

  update public.posvenda_envios
     set respondido_em = coalesce(new.created_at, now()), resposta = left(new.corpo, 500),
         resposta_tipo = v_tipo, conversa_id = coalesce(conversa_id, new.conversa_id)
   where id = v_env.id;

  v_cli := coalesce(v_env.cliente_id, new.cliente_id);

  if v_tipo = 'parar' and v_cli is not null then
    update public.clientes set aceita_mensagens = false, aceita_mensagens_em = now(),
           aceita_mensagens_motivo = 'pediu pelo WhatsApp: ' || left(new.corpo, 80)
     where id = v_cli and aceita_mensagens;
    -- quem pediu para parar não recebe mais nada que esteja na fila
    update public.posvenda_envios set status = 'pulado', motivo_pulado = 'cliente pediu para parar'
     where status = 'pendente' and (cliente_id = v_cli or public.normalizar_telefone(telefone) = v_tel);
  end if;

  if v_env.tipo = 'posvenda' and v_tipo in ('positiva','negativa') and v_cli is not null then
    insert into public.posvenda_respostas (cliente_id, envio_id, agendamento_id, satisfeito, comentario,
                                          registrado_por, origem, texto_original)
    values (v_cli, v_env.id, v_env.agendamento_id, v_tipo = 'positiva', left(new.corpo, 300),
            'WhatsApp (automático)', 'whatsapp', left(new.corpo, 500));

    -- satisfeito + régua de avaliação ligada → convite para avaliar no Google
    select * into v_cfg from public.posvenda_config where id = true;
    if v_tipo = 'positiva' and v_cfg.ativo_avaliacao and coalesce(v_cfg.link_avaliacao, '') <> '' then
      v_primeiro := split_part(trim(coalesce(v_env.nome, '')), ' ', 1);
      v_corpo := replace(replace(replace(v_cfg.msg_avaliacao, '{primeiro_nome}', v_primeiro),
                                 '{nome}', coalesce(v_env.nome, '')), '{link_avaliacao}', v_cfg.link_avaliacao);
      insert into public.posvenda_envios (cliente_id, agendamento_id, telefone, nome, tipo, corpo, enviar_em, chave_unica, criado_por)
      values (v_cli, v_env.agendamento_id, v_env.telefone, v_env.nome, 'avaliacao', v_corpo,
              now() + interval '3 minutes', 'avaliacao:' || v_env.id, 'gatilho')
      on conflict (chave_unica) do nothing;
    end if;
  end if;
  return new;
exception when others then
  -- o Comunicar nunca pode impedir a gravação de uma mensagem do cliente
  return new;
end $$;
revoke all on function public.comunicar_registrar_resposta() from public, anon, authenticated;
drop trigger if exists mensagem_responde_comunicar on public.whatsapp_mensagens;
create trigger mensagem_responde_comunicar after insert on public.whatsapp_mensagens
  for each row execute function public.comunicar_registrar_resposta();

-- 6b. Agendamento novo é "mérito" da última mensagem automática (até 21 dias).
create or replace function public.comunicar_atribuir_agendamento()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_tel text; v_id uuid;
begin
  v_tel := public.normalizar_telefone(new.telefone);
  select e.id into v_id from public.posvenda_envios e
   where e.status = 'enviado' and e.agendou_depois_id is null
     and e.tipo in ('retorno','reativacao','aniversario','campanha','orcamento','nao_fechou','avulsa','posvenda')
     and e.enviado_em > now() - interval '21 days'
     and ((new.cliente_id is not null and e.cliente_id = new.cliente_id)
          or (v_tel is not null and public.normalizar_telefone(e.telefone) = v_tel))
   order by e.enviado_em desc limit 1;
  if v_id is not null then
    update public.posvenda_envios set agendou_depois_id = new.id where id = v_id;
  end if;
  return new;
exception when others then
  return new;
end $$;
revoke all on function public.comunicar_atribuir_agendamento() from public, anon, authenticated;
drop trigger if exists agendamentos_atribui_comunicar on public.agendamentos;
create trigger agendamentos_atribui_comunicar after insert on public.agendamentos
  for each row execute function public.comunicar_atribuir_agendamento();

-- 7) pg_cron acorda o carteiro no Render ------------------------------------------
create or replace function public.comunicar_acordar_carteiro()
returns bigint language plpgsql security definer set search_path = '' as $$
declare c record; v_id bigint;
begin
  select runner_token, carteiro_url, pausa_geral into c from public.posvenda_config where id = true;
  if c.runner_token is null or c.carteiro_url is null then return null; end if;
  select net.http_post(
    url := c.carteiro_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Runner-Token', c.runner_token),
    timeout_milliseconds := 90000
  ) into v_id;
  return v_id;
end $$;
revoke all on function public.comunicar_acordar_carteiro() from public, anon, authenticated;
select cron.schedule('comunicar-carteiro', '5,20,35,50 11-23 * * *', $$select public.comunicar_acordar_carteiro()$$);

-- ---------------------------------------------------------------------------
-- v1.1 (mesmo dia, migração `comunicar_v1_1`): lote de campanha e última rodada
-- do carteiro guardada no banco (o Render dorme e perde a memória do processo).
-- ---------------------------------------------------------------------------
alter table public.posvenda_envios add column if not exists lote uuid;
create index if not exists posvenda_envios_lote_idx on public.posvenda_envios (lote) where lote is not null;
alter table public.posvenda_config
  add column if not exists ultima_rodada jsonb,
  add column if not exists ultima_rodada_em timestamptz;
