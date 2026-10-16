-- Rodada 5 · verificação C8 — PARAR sem falso positivo e sem furo.
--
-- Antes (comunicar_registrar_resposta):
--   • "cancelar", "sair" e "remover" em QUALQUER lugar da frase davam opt-out: o cliente que respondia
--     ao lembrete "preciso cancelar meu horário" era tirado de TODAS as mensagens da oficina;
--   • só valia dentro de 72 h de um envio, e só se o envio tinha cliente_id: PARAR dito dias depois,
--     ou por um número sem cadastro ligado, era ignorado (e a fila seguia mandando).
-- Agora:
--   • PARAR = mensagem que é só a palavra (parar/pare/stop/sair/remover/cancelar/descadastrar) ou frase clara
--     ("não quero mais receber", "pare de me mandar", "me tire da lista", "descadastrar");
--   • vale mesmo sem envio recente: acha o cliente pelo telefone (telefone_e164) e cancela a fila do número;
--   • o resto (positiva/negativa/neutra e a satisfação do pós-venda) continua igual.
create or replace function public.comunicar_registrar_resposta()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_env public.posvenda_envios%rowtype;
  v_tel text; v_txt text; v_tipo text; v_cli uuid; v_cfg public.posvenda_config%rowtype;
  v_corpo text; v_primeiro text; v_parar boolean;
begin
  if new.direcao is distinct from 'entrada' then return new; end if;
  v_txt := lower(trim(coalesce(new.corpo, '')));
  if v_txt = '' then return new; end if;
  v_tel := public.normalizar_telefone(new.telefone);
  if v_tel is null then return new; end if;

  v_parar := v_txt ~ '^[^[:alnum:]]*(parar|pare|p[aá]ra|stop|sair|remover|cancelar|descadastrar|descadastre)[^[:alnum:]]*$'
          or v_txt ~ 'descadastr'
          or v_txt ~ '(^|[^[:alnum:]])n[aã]o quero (mais )?(receber|mensag)'
          or v_txt ~ '(^|[^[:alnum:]])(parar|pare|p[aá]ra) (de )?(me )?(mandar|enviar|receber)'
          or v_txt ~ '(^|[^[:alnum:]])(sair|me (tire|tira|remov[ae]|exclu[ai]))[^.!?]{0,15}(lista|contato|n[uú]mero)';

  select e.* into v_env from public.posvenda_envios e
   where e.status = 'enviado' and e.respondido_em is null
     and e.enviado_em > now() - interval '72 hours'
     and public.normalizar_telefone(e.telefone) = v_tel
   order by e.enviado_em desc limit 1;

  if not found then
    -- sem envio recente a atribuir: PARAR claro continua valendo (cliente pelo telefone + fila do número)
    if v_parar then
      update public.clientes set aceita_mensagens = false, aceita_mensagens_em = now(),
             aceita_mensagens_motivo = 'pediu pelo WhatsApp: ' || left(new.corpo, 80)
       where telefone_e164 = v_tel and aceita_mensagens;
      update public.posvenda_envios set status = 'pulado', motivo_pulado = 'cliente pediu para parar'
       where status = 'pendente' and public.normalizar_telefone(telefone) = v_tel;
    end if;
    return new;
  end if;

  if v_parar then
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
  if v_cli is null and v_tipo = 'parar' then
    select c.id into v_cli from public.clientes c where c.telefone_e164 = v_tel limit 1;
  end if;

  if v_tipo = 'parar' then
    if v_cli is not null then
      update public.clientes set aceita_mensagens = false, aceita_mensagens_em = now(),
             aceita_mensagens_motivo = 'pediu pelo WhatsApp: ' || left(new.corpo, 80)
       where id = v_cli and aceita_mensagens;
    end if;
    update public.posvenda_envios set status = 'pulado', motivo_pulado = 'cliente pediu para parar'
     where status = 'pendente' and ((v_cli is not null and cliente_id = v_cli) or public.normalizar_telefone(telefone) = v_tel);
  end if;

  if v_env.tipo = 'posvenda' and v_tipo in ('positiva','negativa') and v_cli is not null then
    insert into public.posvenda_respostas (cliente_id, envio_id, agendamento_id, satisfeito, comentario,
                                          registrado_por, origem, texto_original)
    values (v_cli, v_env.id, v_env.agendamento_id, v_tipo = 'positiva', left(new.corpo, 300),
            'WhatsApp (automático)', 'whatsapp', left(new.corpo, 500));

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
  return new;
end
$function$;
