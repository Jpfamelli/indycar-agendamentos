-- r6_c4_conexoes (21/10/2026) — Rodada 6 · Comunicar ligado aos eventos dos outros sistemas. Só ADITIVO.
--
-- 1. posvenda_config: interruptores e parâmetros das ligações novas
--      • usa_patio_posvenda  — entrega no Pátio também dispara o pós-venda (carro que não veio pela Agenda)
--      • usa_patio_revisao   — o histórico do Pátio entra no cálculo da revisão e do "já voltou"
--      • usa_orcador         — orçamento enviado e sem resposta no Orçador vira lembrete (com link do orçamento)
--      • ativo_extra_lembrete/horas_extra_lembrete/msg_extra_lembrete — extra do Pátio esperando o OK do cliente
--      • msg_orcador_visto / msg_orcador_novisto — texto de quem abriu e de quem nem abriu o orçamento
--      • segurança anti-spam: bloquear_com_carro_na_oficina, bloquear_com_reclamacao + dias_reclamacao_aberta,
--        evitar_texto_repetido_h (mesmo texto para o mesmo número), campanha_repetir_dias (padrão da campanha),
--        retomada_gradual (WhatsApp volta devagar) + whatsapp_estado_anterior
-- 2. posvenda_envios.os_id / orcamento_id: de qual ordem do Pátio / orçamento do Orçador a mensagem veio
--    (sem FK de propósito: o Pátio e o Orçador têm donos próprios e nunca podem travar um envio).
--    Gatilho BEFORE INSERT preenche pelo chave_unica — inclusive o que o próprio Pátio enfileira.
-- 3. Os filtros de segmento (comunicar_segmentos.filtro) aceitam os públicos novos (Pátio, Orçador, CRM).
-- Nada é tocado nas funções do Pátio (patio_*), do Orçador (orc_*) nem em tocar_conversa.

alter table public.posvenda_config
  add column if not exists usa_patio_posvenda boolean not null default true,
  add column if not exists usa_patio_revisao boolean not null default true,
  add column if not exists usa_orcador boolean not null default true,
  add column if not exists ativo_extra_lembrete boolean not null default true,
  add column if not exists horas_extra_lembrete smallint not null default 3 check (horas_extra_lembrete between 1 and 48),
  add column if not exists bloquear_com_carro_na_oficina boolean not null default true,
  add column if not exists bloquear_com_reclamacao boolean not null default true,
  add column if not exists dias_reclamacao_aberta smallint not null default 14 check (dias_reclamacao_aberta between 1 and 60),
  add column if not exists evitar_texto_repetido_h smallint not null default 48 check (evitar_texto_repetido_h between 0 and 336),
  add column if not exists campanha_repetir_dias smallint not null default 14 check (campanha_repetir_dias between 0 and 90),
  add column if not exists retomada_gradual boolean not null default true,
  add column if not exists whatsapp_estado_anterior text;

alter table public.posvenda_config
  add column if not exists msg_extra_lembrete text not null default
    'Oi {primeiro_nome}, passando para lembrar: {itens} do {carro} está esperando o seu OK. É só abrir por aqui, ver os detalhes e aprovar ou recusar: {link_os} 🔧',
  add column if not exists msg_orcador_novisto text not null default
    'Oi {primeiro_nome}, aqui é da IndyCar! Te mandei o orçamento do {carro}, conseguiu abrir? Está aqui de novo: {link_orcamento} Qualquer dúvida é só chamar por aqui. 🔧',
  add column if not exists msg_orcador_visto text not null default
    'Oi {primeiro_nome}, aqui é da IndyCar! Vi que você já olhou o orçamento do {carro}. Ficou alguma dúvida? Se quiser, a gente ajusta junto: {link_orcamento} 🔧';

alter table public.posvenda_envios
  add column if not exists os_id uuid,
  add column if not exists orcamento_id uuid;
create index if not exists posvenda_envios_os_idx on public.posvenda_envios (os_id) where os_id is not null;
create index if not exists posvenda_envios_orcamento_idx on public.posvenda_envios (orcamento_id) where orcamento_id is not null;

-- chave_unica 'patio_<tipo>:<os>…', 'posvenda:patio:<os>', 'retorno:patio:<os>', 'orcamento:orc:<orcamento>' → os_id / orcamento_id
create or replace function public.r6_c4_envio_ref()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_u text;
begin
  if new.chave_unica is null then return new; end if;
  if new.os_id is null then
    v_u := substring(new.chave_unica from '(?:^patio_[a-z_]+:|^[a-z_]+:patio:|^avaliacao:patio:)([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})');
    if v_u is not null then new.os_id := v_u::uuid; end if;
  end if;
  if new.orcamento_id is null then
    v_u := substring(new.chave_unica from '^orcamento:orc:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})');
    if v_u is not null then new.orcamento_id := v_u::uuid; end if;
  end if;
  return new;
exception when others then
  return new;   -- a referência é um enfeite útil: nunca pode derrubar um envio
end $$;

drop trigger if exists r6_c4_envio_ref on public.posvenda_envios;
create trigger r6_c4_envio_ref before insert on public.posvenda_envios
  for each row execute function public.r6_c4_envio_ref();
revoke execute on function public.r6_c4_envio_ref() from public, anon, authenticated;

-- o que já existia na fila ganha a referência (só preenche o que está vazio)
update public.posvenda_envios
   set os_id = substring(chave_unica from '(?:^patio_[a-z_]+:|^[a-z_]+:patio:|^avaliacao:patio:)([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})')::uuid
 where os_id is null and chave_unica ~ '(^patio_[a-z_]+:|^[a-z_]+:patio:|^avaliacao:patio:)[0-9a-fA-F]{8}-';

-- públicos novos nos segmentos salvos
alter table public.comunicar_segmentos drop constraint if exists comunicar_segmentos_filtro_check;
alter table public.comunicar_segmentos add constraint comunicar_segmentos_filtro_check check (filtro in (
  'todos', 'aniversariantes_mes', 'atendidos', 'sem_voltar', 'faltaram', 'servico',
  'entregues_patio', 'nota_alta_patio', 'extra_recusado_patio', 'orcamento_sem_resposta', 'orcamento_recusado',
  'leads_perdidos', 'leads_orcamento', 'indicaram', 'sem_voltar_patio'));

comment on column public.posvenda_config.usa_patio_posvenda is 'Comunicar R6: carro entregue no Pátio (sem horário na Agenda) também dispara o pós-venda';
comment on column public.posvenda_config.usa_orcador is 'Comunicar R6: orçamento enviado e sem resposta no Orçador vira lembrete com o link do orçamento';
comment on column public.posvenda_config.ativo_extra_lembrete is 'Comunicar R6: lembra o cliente do extra do Pátio que ele ainda não decidiu (só depois do aviso inicial ter saído)';
comment on column public.posvenda_config.evitar_texto_repetido_h is 'Comunicar R6: não manda o mesmo texto para o mesmo número dentro de N horas (0 desliga)';
comment on column public.posvenda_config.retomada_gradual is 'Comunicar R6: quando o WhatsApp volta de uma queda, a primeira rodada sai devagar';
comment on column public.posvenda_envios.os_id is 'Comunicar R6: ordem do Pátio de onde a mensagem veio (sem FK de propósito)';
comment on column public.posvenda_envios.orcamento_id is 'Comunicar R6: orçamento do Orçador de onde a mensagem veio (sem FK de propósito)';
