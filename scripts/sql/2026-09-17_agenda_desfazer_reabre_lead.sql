-- Migrações `agenda_desfazer_reabre_lead` + `..._v2` — JÁ APLICADAS no Supabase em 2026-09-17.
-- Este arquivo é o estado FINAL (v2) da função.
-- Guardada aqui só para ficar versionada junto do código que depende dela
-- (o botão "Desfazer" do Início). Explicação completa no .md ao lado.
--
-- Agenda: "Desfazer" um desfecho reabre o lead no CRM.
-- Antes: marcar Concluído/Não fechou na Agenda fechava o lead, mas voltar o
-- horário para Confirmado/Aguardando NÃO reabria — a Agenda mostrava o cliente
-- pendente e o CRM continuava com a venda fechada (ou perdida).
-- Agora: se o lead está exatamente onde a PRÓPRIA Agenda o deixou, voltar atrás
-- o reabre. Lead fechado por fora (direto no CRM) continua intocado.
-- O resto da função é idêntico ao que já estava em produção.
create or replace function public.sincronizar_lead_pelo_agendamento()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_lead   uuid;
  v_desfaz boolean := false;
begin
  if tg_op = 'INSERT' then
    if new.lead_id is not null then
      update public.leads
         set status = 'agendado'
       where id = new.lead_id
         and status not in ('concluido','perdido','em_servico');
      return null;
    end if;

    -- Sem lead: cria (ou reaproveita um aberto do mesmo cliente) para o CRM
    -- registrar de onde veio, o serviço e o valor.
    if new.cliente_id is not null then
      select id into v_lead
        from public.leads
       where cliente_id = new.cliente_id
         and status not in ('concluido','perdido')
       order by created_at desc
       limit 1;
    end if;

    if v_lead is null then
      insert into public.leads
        (cliente_id, nome, telefone, servico, valor_orcado, status, origem, observacoes)
      values
        (new.cliente_id, new.cliente_nome, new.telefone, new.servico,
         coalesce(new.valor, 0), 'agendado', new.origem,
         'Lead criado a partir de um horário marcado na Agenda.')
      returning id into v_lead;
    else
      -- 'em_servico' fica: o cliente está NA oficina agora; um retorno marcado
      -- para outro dia não muda isso.
      update public.leads
         set status       = case when status = 'em_servico' then status else 'agendado' end,
             servico      = coalesce(nullif(new.servico, ''), servico),
             valor_orcado = case when coalesce(new.valor,0) > 0 then new.valor else valor_orcado end
       where id = v_lead;
    end if;

    update public.agendamentos set lead_id = v_lead where id = new.id;
    return null;
  end if;

  if new.lead_id is null then return null; end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    -- DESFAZER: o lead está fechado PORQUE a Agenda o fechou neste mesmo
    -- horário? Só então um "voltar atrás" pode tirá-lo de concluido/perdido.
    -- (v2) LEAD COMPARTILHADO: se OUTRO horário do mesmo lead tem o mesmo desfecho,
    -- o lead está fechado por ele também — desfazer este aqui não reabre.
    select (   (old.status = 'concluido'  and l.status = 'concluido')
            or (old.status = 'nao_fechou' and l.status = 'perdido'))
           and not exists (select 1 from public.agendamentos x
                            where x.lead_id = new.lead_id
                              and x.id <> new.id
                              and x.status = old.status)
      into v_desfaz
      from public.leads l
     where l.id = new.lead_id;
    v_desfaz := coalesce(v_desfaz, false);

    -- (v2) a venda foi desfeita: o valor que ESTE horário gravou deixa de valer
    if v_desfaz and old.status = 'concluido' and coalesce(old.valor, 0) > 0 then
      update public.leads set valor_pago = 0
       where id = new.lead_id and valor_pago = old.valor;
    end if;

    -- compareceu e em_atendimento contam o mesmo para o CRM: o cliente ESTÁ na
    -- oficina.
    if new.status in ('compareceu', 'em_atendimento') then
      update public.leads set status = 'em_servico'
       where id = new.lead_id
         and (status not in ('concluido','perdido') or v_desfaz);

    elsif new.status = 'concluido' then
      update public.leads
         set status     = 'concluido',
             valor_pago = case when new.valor > 0 then new.valor else valor_pago end
       where id = new.lead_id;

    elsif new.status = 'nao_fechou' then
      update public.leads set status = 'perdido' where id = new.lead_id;

    elsif new.status in ('nao_veio','cancelado') then
      -- 'em_servico' também volta: é assim que se desfaz um Compareceu errado.
      update public.leads set status = 'contato'
       where id = new.lead_id
         and (status in ('agendado','em_servico') or v_desfaz);

    elsif new.status in ('aguardando','confirmado')
      and old.status in ('compareceu','em_atendimento','concluido','nao_fechou','nao_veio','cancelado') then
      -- O horário voltou a ficar "de pé": o lead volta para Agendado — mas só
      -- se estava onde a Agenda o tinha posto.
      update public.leads set status = 'agendado'
       where id = new.lead_id
         and (   (old.status in ('compareceu','em_atendimento') and status = 'em_servico')
              or (old.status in ('nao_veio','cancelado')        and status = 'contato')
              or v_desfaz);
    end if;
  end if;

  return null;
end;
$function$;
