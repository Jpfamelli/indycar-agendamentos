-- Prévia somente leitura: número exato de avisos antigos e não lidos no momento da execução.
select count(*) as avisos_a_marcar
from public.notificacoes
where lida_em is null and created_at < now() - interval '7 days';

-- Ensaio: o erro intencional desfaz a atualização da instrução DO inteira.
do $$
declare
  total bigint;
begin
  update public.notificacoes
  set lida_em = now()
  where lida_em is null and created_at < now() - interval '7 days';
  get diagnostics total = row_count;
  raise notice 'Avisos que seriam marcados: %', total;
  raise exception 'TESTE_REVERTIDO';
end $$;
