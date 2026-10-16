-- r5c_comunicar_parar_sempre: PARAR vale SEMPRE no Comunicar (com ou sem envio nas últimas 72 h; cliente achado pelo telefone;
-- a fila do número é pulada). A base está em 2026-10-16_r5c_c8_parar_sem_falso_positivo.sql; aqui só entra "chega de mensagens"
-- (mesmo vocabulário de at_pediu_parar, do Atendimento).
do $m$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname = 'comunicar_registrar_resposta' and p.pronamespace = 'public'::regnamespace;
  if position('chega de mensag' in d) = 0 then
    d := replace(d, $a$or v_txt ~ 'descadastr'$a$, $b$or v_txt ~ 'descadastr'
          or v_txt ~ '(^|[^[:alnum:]])chega de mensag'$b$);
    execute d;
  end if;
end $m$;
