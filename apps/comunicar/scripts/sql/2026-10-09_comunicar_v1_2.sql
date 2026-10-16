-- comunicar_v1_2 (09/10/2026, rodada 2) — só ADITIVO.
-- IA lendo as respostas (intenção), elo com o histórico do Atendimento,
-- limite de envios por hora e cache do resumo da semana feito pela IA.

-- intenção da resposta do cliente, lida pela IA barata no carteiro
alter table public.posvenda_envios add column if not exists intencao text
  check (intencao is null or intencao in ('quer_agendar','quer_orcamento','reclamacao','duvida','agradecimento','outro'));
alter table public.posvenda_envios add column if not exists intencao_em timestamptz;
alter table public.posvenda_envios add column if not exists intencao_resumo text;
-- quando a conversa foi passada para o consultor (aguardando_consultor) por causa da intenção
alter table public.posvenda_envios add column if not exists encaminhado_em timestamptz;
-- a linha que o carteiro gravou no histórico da conversa do Atendimento (marca "veio do Comunicar" e evita duplicar)
alter table public.posvenda_envios add column if not exists mensagem_id uuid
  references public.whatsapp_mensagens(id) on delete set null;

create index if not exists posvenda_envios_intencao_idx
  on public.posvenda_envios (intencao_em desc) where intencao is not null;
create index if not exists posvenda_envios_sem_intencao_idx
  on public.posvenda_envios (respondido_em desc) where respondido_em is not null and intencao is null;
create index if not exists posvenda_envios_mensagem_idx
  on public.posvenda_envios (mensagem_id) where mensagem_id is not null;
create index if not exists posvenda_envios_enviado_em_idx
  on public.posvenda_envios (enviado_em desc) where status = 'enviado';

-- limite de envios por hora (o carteiro nunca passa disso) e cache do resumo da IA (6 h)
alter table public.posvenda_config add column if not exists limite_por_hora smallint not null default 60
  check (limite_por_hora between 1 and 500);
alter table public.posvenda_config add column if not exists ia_resumo text;
alter table public.posvenda_config add column if not exists ia_resumo_em timestamptz;
