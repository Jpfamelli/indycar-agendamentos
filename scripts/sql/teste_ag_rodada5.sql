-- Teste reproduzível da rodada 5 (tudo revertido pelo RAISE no fim). Resultado esperado:
--   TESTE_REVERTIDO anon 42501 ok: 42501 | sem perfil 42501 | espera e164=12999990000 | confirmado=true/confirmado
DO $$
declare r text; begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin perform public.agenda_horarios_livres(current_date, null); r := 'anon PASSOU (erro)'; exception when others then r := 'anon 42501 ok: ' || sqlstate; end;
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000999"}', true);
  begin perform public.agenda_horarios_livres(current_date, null); r := r || ' | sem perfil PASSOU (erro)'; exception when others then r := r || ' | sem perfil ' || sqlstate; end;
  insert into public.ag_lista_espera (cliente_nome, telefone, servico) values ('Teste', '(12) 99999-0000', 'Troca de óleo');
  r := r || ' | espera e164=' || (select telefone_e164 from public.ag_lista_espera where cliente_nome='Teste');
  insert into public.ag_confirmacoes (agendamento_id) select id from public.agendamentos where status='aguardando' order by data desc limit 1;
  update public.ag_confirmacoes set resposta='confirmou', respondido_em=now() where observacao is null;
  r := r || ' | confirmado=' || (select a.confirmado::text || '/' || a.status::text from public.agendamentos a join public.ag_confirmacoes c on c.agendamento_id=a.id);
  raise exception 'TESTE_REVERTIDO %', r;
end $$;
-- Só leitura (não precisa reverter):
-- select jsonb_pretty(public.agenda_horarios_livres(current_date + 1, 'Troca de óleo'));
