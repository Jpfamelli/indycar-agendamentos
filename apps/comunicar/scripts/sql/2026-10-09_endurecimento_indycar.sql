-- ============================================================================
-- Endurecimento do banco da IndyCar (09/10/2026) — aplicado como migração
-- `endurecimento_indycar_2026_10_09`. Fecha os avisos do linter do Supabase
-- que dizem respeito às tabelas/funções da IndyCar (as de outros projetos no
-- mesmo banco — kg_, arena_, brasa_, el_, orc_ — NÃO são tocadas aqui).
--
--   1. Funções de gatilho SECURITY DEFINER que ainda podiam ser chamadas por
--      anon/authenticated via /rest/v1/rpc perdem o EXECUTE (o gatilho continua
--      disparando normalmente — já era assim com tocar_conversa e companhia).
--   2. faxina_da_fila / proximo_da_fila (pg_cron e servidor) idem.
--   3. Funções auxiliares de texto ganham search_path fixo ('public') — eram
--      "mutable", mas chamam outras funções públicas sem qualificar, então
--      search_path='' quebraria; 'public' resolve o aviso sem risco.
--   4. Índices para as chaves estrangeiras sem índice (avisos de performance).
-- ============================================================================

-- 1) gatilhos
revoke all on function public.aprender_nome_da_saudacao() from public, anon, authenticated;
revoke all on function public.cliente_herda_veiculo() from public, anon, authenticated;
revoke all on function public.conversa_nasce_na_data_da_mensagem() from public, anon, authenticated;
revoke all on function public.desfecho_pela_etapa() from public, anon, authenticated;
revoke all on function public.desfecho_pelo_lead() from public, anon, authenticated;
revoke all on function public.etapa_pelo_agendamento() from public, anon, authenticated;
revoke all on function public.lead_garante_cliente() from public, anon, authenticated;
revoke all on function public.marcar_espera_do_consultor() from public, anon, authenticated;
revoke all on function public.marcar_resolucao_da_conversa() from public, anon, authenticated;
revoke all on function public.marcar_tempos_da_conversa() from public, anon, authenticated;
revoke all on function public.proteger_campos_do_perfil() from public, anon, authenticated;
revoke all on function public.registrar_troca_de_etapa() from public, anon, authenticated;

-- 2) rotinas internas
revoke all on function public.faxina_da_fila() from public, anon, authenticated;
revoke all on function public.proximo_da_fila() from public, anon, authenticated;

-- 3) auxiliares de texto (não são SECURITY DEFINER; só fixam o search_path)
alter function public.eh_disparo(text) set search_path = public, pg_temp;
alter function public.eh_propaganda(text) set search_path = public, pg_temp;
alter function public.espera_resposta(text) set search_path = public, pg_temp;
alter function public.intencao_de_servico(text) set search_path = public, pg_temp;
alter function public.limpar_texto(text) set search_path = public, pg_temp;
alter function public.nome_da_saudacao(text) set search_path = public, pg_temp;
alter function public.nome_de_verdade(text) set search_path = public, pg_temp;
alter function public.nome_do_parabens(text) set search_path = public, pg_temp;
alter function public.pede_atendimento(text) set search_path = public, pg_temp;
alter function public.pedido_de_verdade(text) set search_path = public, pg_temp;
alter function public.quer_orcamento(text) set search_path = public, pg_temp;
alter function public.resposta_automatica(text) set search_path = public, pg_temp;

-- 4) índices das chaves estrangeiras
create index if not exists ads_alertas_regra_idx on public.ads_alertas (regra_id);
create index if not exists agendamentos_servico_idx on public.agendamentos (servico_id);
create index if not exists atalhos_mensagem_atalho_de_idx on public.atalhos_mensagem (atalho_de);
create index if not exists atalhos_mensagem_consultor_idx on public.atalhos_mensagem (consultor_id);
create index if not exists conversas_atribuida_idx on public.conversas (atribuida_a);
create index if not exists conversas_etapa_idx on public.conversas (etapa_id);
create index if not exists conversa_etiquetas_etiqueta_idx on public.conversa_etiquetas (etiqueta_id);
create index if not exists etapa_historico_etapa_idx on public.etapa_historico (etapa_id);
create index if not exists etapa_historico_perfil_idx on public.etapa_historico (perfil_id);
create index if not exists leads_servico_idx on public.leads (servico_id);
create index if not exists perfis_equipe_idx on public.perfis (equipe_id);
create index if not exists whatsapp_mensagens_lead_idx on public.whatsapp_mensagens (lead_id);
create index if not exists whatsapp_mensagens_template_idx on public.whatsapp_mensagens (template_id);
