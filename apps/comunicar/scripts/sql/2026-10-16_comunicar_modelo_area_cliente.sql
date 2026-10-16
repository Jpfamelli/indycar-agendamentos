-- Pátio + Área do Cliente (16/10/2026): modelo pronto "Convite para a Área do Cliente".
-- Só DADO (nenhuma mudança de estrutura). {link_area} = link só daquele cliente,
-- gerado pelo Comunicar na hora de enfileirar (rpc cliente_gerar_acesso).
insert into public.comunicar_modelos (titulo, categoria, corpo, ordem)
select 'Convite para a Área do Cliente', 'relacionamento',
       'Oi {primeiro_nome}! Agora você tem a sua Área do Cliente da IndyCar: histórico do {carro}, próximas revisões e pedido de horário, tudo pelo celular. O link é só seu: {link_area} 🏁 Quem conhece, Indyca!',
       105
where not exists (select 1 from public.comunicar_modelos where titulo = 'Convite para a Área do Cliente');
