/* Dados INVENTADOS para conferir a Casa no Chrome (rodada 9). Nenhum nome, telefone ou placa é de cliente de verdade.
   Origem: indycar-ferramentas/r8/entrega/_manual/casa-mock/dados.js (manual da rodada 8), ampliado com avisos agrupados,
   tarefas do Orçador, busca, ficha e cenários de falha. O cenário vem de window.__CENARIO (posto pelo roteiro antes da página):
   { papel: 'admin'|'gestor'|'atendente'|'agenda'|'mecanico', zap: 'ok'|'recusado', vazio: bool, falhar: [nomes de rpc/tabela] } */
(function () {
  'use strict';
  var c = window.__CENARIO || {};
  var papel = c.papel || 'admin';
  var zapOk = c.zap === 'ok';
  var vazio = !!c.vazio;
  var iso = function (min) { return new Date(Date.now() - min * 60000).toISOString(); };
  var dia = function (d) { return new Date(Date.now() + d * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); };
  var U = function (n) { return String(n).padStart(8, '0') + '-0000-4000-8000-000000000000'; };
  var tel = function (n) { return '551299990' + String(n).padStart(4, '0'); };
  var carro = function (n, numero, cliente, veiculo, placa, min, ex) {
    return { id: U(n), numero: numero, cliente: cliente, telefone_55: tel(n), veiculo: veiculo, placa: placa, desde: iso(min), minutos_na_etapa: min, extras_pendentes: ex, previsao_entrega: iso(-120), orcamento_id: null };
  };
  var etapa = function (e, r, lista) { return { etapa: e, rotulo: r, normal_min: 60, quantidade: lista.length, mais_antigo_min: lista.length ? lista[0].minutos_na_etapa : null, carros: lista }; };
  var nomes = { admin: 'Paulo Exemplo', gestor: 'Gil Teste', atendente: 'Rita Exemplo', agenda: 'Davi Modelo', mecanico: 'Mário Teste' };
  var apps = papel === 'admin' ? ['atendimento', 'crm', 'agenda', 'comunicar', 'orcador', 'ads', 'patio']
    : papel === 'gestor' ? ['atendimento', 'crm', 'agenda', 'comunicar', 'orcador', 'patio', 'ads']
    : papel === 'atendente' ? ['atendimento', 'crm', 'agenda', 'patio', 'orcador'] : papel === 'agenda' ? ['agenda', 'patio'] : ['patio'];
  var eu = '00000000-0000-4000-8000-0000000000d0';
  var serie = Array.from({ length: 7 }, function (_, i) { return { dia: dia(i - 6), valor: vazio ? 0 : [0, 850, 1200, 400, 2300, 1750, 980][i] }; });
  var pe = vazio ? [] : null;
  window.__DADOS = {
    tabelas: {
      perfis: [{ id: eu, nome: nomes[papel] || 'Paulo Exemplo', email: 'dono@oficina.test', papel: papel, apps: apps, ativo: true, avatar_cor: '#e6192e', precisa_trocar_senha: false, cargo: papel === 'admin' ? 'Dono' : '' },
        { id: U(901), nome: 'Rita Exemplo', papel: 'atendente', ativo: true }, { id: U(902), nome: 'Gil Teste', papel: 'gestor', ativo: true }],
      tarefas: pe || [
        { id: U(201), titulo: 'Confirmar com o cliente: revisão do Onix amanhã 08:00', descricao: null, prioridade: 1, vence_em: iso(-180), status: 'aberta', responsavel_id: null, origem: 'agenda', agendamento_id: U(41) },
        { id: U(202), titulo: 'Cobrar orçamento nº 12 (enviado há 2 dias)', descricao: 'Cliente pediu para pensar. https://indycar-orcador.netlify.app/#/historico/' + U(21), prioridade: 2, vence_em: iso(60), status: 'aberta', responsavel_id: eu, origem: 'orcador', cliente_id: U(701) },
        { id: U(203), titulo: 'Ligar para a Gabi sobre a revisão de 40 mil', descricao: null, prioridade: 2, vence_em: null, status: 'aberta', responsavel_id: eu, origem: 'manual', conversa_id: U(31) },
        { id: U(204), titulo: 'Conferir peça do HB20 com o fornecedor', descricao: null, prioridade: 2, vence_em: iso(1500), status: 'aberta', responsavel_id: U(901), origem: 'manual' },
      ],
      notificacoes: pe || [
        { id: U(301), tipo: 'extra', titulo: 'Extra esperando o cliente aprovar no HB20', corpo: 'Pastilha de freio dianteira, R$ 280,00', link: null, app: 'patio', lida_em: null, created_at: iso(5) },
        { id: U(302), tipo: 'espera', titulo: 'Gabi está esperando há 40 min', corpo: 'Quanto fica a revisão de 40 mil?', link: '?conversa=' + U(31), app: 'atendimento', lida_em: null, created_at: iso(40) },
        { id: U(303), tipo: 'espera', titulo: 'Hugo está esperando há 12 min', corpo: 'Bom dia, tem horário amanhã?', link: '?conversa=' + U(32), app: 'atendimento', lida_em: null, created_at: iso(12) },
        { id: U(304), tipo: 'espera', titulo: 'Caio está esperando há 3 h', corpo: 'Vocês fazem alinhamento?', link: '?conversa=' + U(33), app: 'atendimento', lida_em: null, created_at: iso(190) },
        { id: U(305), tipo: 'orcamento_visto', titulo: 'Elisa abriu o orçamento #0012', corpo: null, link: null, app: 'orcador', lida_em: null, created_at: iso(70) },
        { id: U(306), tipo: 'tarefas_vencidas', titulo: '2 tarefas vencidas', corpo: null, link: null, app: null, lida_em: null, created_at: iso(300) },
        { id: U(307), tipo: 'lead', titulo: 'Contato novo pelo anúncio: Igor', corpo: null, link: null, app: 'crm', lida_em: iso(10), created_at: iso(1600) },
      ],
      consultores: [], casa_metas: vazio ? [] : [{ valor: 60000 }], patio_os: [], patio_extras: [],
      orc_tarefas: pe || [{ tarefa_id: U(202), orcamento_id: U(21), tipo: 'followup' }],
      orc_orcamentos: [{ id: U(21), numero: 12 }], clientes: [{ id: U(701), nome: 'Elisa Teste', telefone: tel(701) }], agendamentos: [],
    },
    rpc: {
      r6_agora: vazio ? { hoje: dia(0), gerado_em: iso(0), patio: { total: 0, por_etapa: [] }, orcamentos: { esperando_total: 0, esperando: [], aprovados_sem_horario: [] }, conversas_sem_resposta: { total: 0, itens: [] }, agendamentos_hoje: { total: 0, itens: [] }, tarefas: { abertas: 0, vencidas: 0 } } : {
        hoje: dia(0), gerado_em: iso(0), kpis: {},
        patio: { total: 4, prontos_esperando_retirada: 1, atrasados: 1, extras_pendentes: 1, entregues_hoje: 2, por_etapa: [
          etapa('recebido', 'Recebido', []), etapa('diagnostico', 'Diagnóstico', [carro(11, 41, 'Ana Exemplo', 'Onix', 'AAA0A00', 50, 0)]),
          etapa('aguardando_aprovacao', 'Aguardando aprovação', [carro(12, 42, 'Bruno Teste', 'HB20', 'BBB1B11', 95, 1)]),
          etapa('aguardando_peca', 'Aguardando peça', []), etapa('em_execucao', 'Em execução', [carro(13, 43, 'Carla Modelo', 'Corolla', 'CCC2C22', 35, 0)]),
          etapa('teste', 'Teste', []), etapa('pronto', 'Pronto', [carro(14, 40, 'Diego Inventado', 'Gol', 'DDD3D33', 310, 0)]),
        ] },
        orcamentos: { esperando_total: 2, nao_abertos: 1, valor_esperando: 2310, vencendo_hoje: 0, aprovados_sem_horario_total: 1,
          aprovados_sem_horario: [{ id: U(23), numero: 15, cliente: 'Kátia Exemplo', telefone_55: tel(23), total: 960, decidido_em: iso(300) }],
          esperando: [{ id: U(21), numero: 12, cliente: 'Elisa Teste', telefone_55: tel(21), total: 1890.5, enviado_em: iso(2900), visualizado_em: iso(2800), validade: null },
            { id: U(22), numero: 14, cliente: 'Fábio Modelo', telefone_55: tel(22), total: 420, enviado_em: iso(90), visualizado_em: null, validade: null }] },
        conversas_sem_resposta: { total: 3, minhas: 0, sem_dono: 2, aguardando_consultor: 1, itens: [
          { id: U(33), nome: 'Caio Teste', telefone_55: tel(33), desde: iso(190), previa: 'Vocês fazem alinhamento e balanceamento no sábado?', dono: null },
          { id: U(31), nome: 'Gabi Inventada', telefone_55: tel(31), desde: iso(40), previa: 'Quanto fica a revisão de 40 mil?', dono: eu },
          { id: U(32), nome: 'Hugo Exemplo', telefone_55: tel(32), desde: iso(12), previa: 'Bom dia, tem horário amanhã?', dono: null }] },
        agendamentos_hoje: { total: 4, faltam_chegar: 2, atrasados: 0, no_patio: 2, itens: [
          { id: U(41), hora: '08:00', cliente: 'Ana Exemplo', telefone_55: tel(41), veiculo: 'Onix', servico: 'Revisão', status: 'compareceu', chegou: true, os_id: U(11), os_etapa: 'diagnostico' },
          { id: U(44), hora: '09:00', cliente: 'Bruno Teste', telefone_55: tel(44), veiculo: 'HB20', servico: 'Freios', status: 'em_atendimento', chegou: true, os_id: U(12), os_etapa: 'aguardando_aprovacao' },
          { id: U(42), hora: '16:30', cliente: 'Igor Teste', telefone_55: tel(42), veiculo: 'Civic', servico: 'Freios', status: 'confirmado', chegou: false, os_id: null, os_etapa: null },
          { id: U(43), hora: '17:00', cliente: 'Júlia Modelo', telefone_55: tel(43), veiculo: 'Fox', servico: 'Troca de óleo', status: 'aguardando', chegou: false, os_id: null, os_etapa: null }] },
        tarefas: { abertas: 4, vencidas: 2 },
      },
      r6_c1_agora_extras: vazio ? {} : { leads: { novos_sem_dono: 2, novos_hoje: 4 }, orcamentos: { recusados_7d: 1, vistos: 1 }, conversas: { nao_lidas: 3, antigas: 1 },
        agenda: { chegaram: 2, sem_confirmar: 1, faltaram: 0, orcamentos: {} } },
      r6_c1_painel_dono: { hoje: serie[6].dia, gerado_em: iso(0), serie7: serie,
        faturamento: vazio ? {} : { hoje: 980, ontem: 1750, semana: 5600, semana_passada: 4200, mes: 31450, fechados_hoje: 2, fechados_semana: 9, ticket_semana: 622.22, sem_valor_semana: 3 },
        conversao: vazio ? {} : { leads: 63, agendaram: 31, fecharam: 22, perdidos: 6, veio: 30, fechou: 22, nao_fechou: 4, nao_veio: 9 },
        orcamentos: vazio ? {} : { enviados: 12, aprovados: 6, recusados: 2, valor_aprovado: 8300 },
        gargalos: vazio ? {} : { patio: [{ etapa: 'aguardando_aprovacao', n: 1, horas_mais_antigo: 26 }], pronto_parado_4h: 1, conversas_2h: 1, orcamentos_24h: 1, leads_sem_dono: 2, horarios_sem_desfecho: 3 } },
      r6_c1b_painel_consultores: vazio ? { consultores: [], origens: [] } : { consultores: [{ nome: 'Consultor A', marcados: 20, vieram: 15, fecharam: 9, faltaram: 3, valor: 5400 }, { nome: 'Consultor B', marcados: 11, vieram: 8, fecharam: 4, faltaram: 4, valor: 2100 }],
        origens: [{ origem: 'Google', marcados: 12, vieram: 9, fecharam: 6, valor: 3800 }, { origem: 'Instagram', marcados: 6, vieram: 4, fecharam: 2, valor: 900 }] },
      r6_c1c_manha: vazio ? { hoje: dia(0), ontem: { total: 0 }, amanha: { total: 0 }, patio: {} } : { hoje: dia(0), gerado_em: iso(0),
        ontem: { data: dia(-1), total: 8, vieram: 6, faltaram: 1, fechados: 4, nao_fecharam: 1, sem_baixa: 1, valor: 5400, sem_baixa_lista: [{ id: U(51), hora: '16:00', cliente: 'Lia Exemplo', telefone_55: tel(51), veiculo: 'Polo', servico: 'Freios' }] },
        amanha: { data: dia(1), total: 3, sem_confirmar: 1, sem_telefone: 0, primeiro: '08:00', lista: [
          { id: U(52), hora: '08:00', cliente: 'Nando Teste', telefone_55: tel(52), confirmado: true, veiculo: 'Fox', servico: 'Óleo' },
          { id: U(53), hora: '10:30', cliente: 'Olga Modelo', telefone_55: tel(53), confirmado: false, veiculo: 'Uno', servico: 'Revisão' }] },
        patio: { parados_2d: 0, prontos_desde_ontem: 1, entregues_ontem: 3 } },
      r7_c1_saude_sistemas: { gerado_em: iso(0),
        whatsapp: { estado: zapOk ? 'ok' : 'chave_recusada', desde: zapOk ? null : iso(60 * 24 * 49), motivo: zapOk ? null : 'O CodeWords respondeu 401: chave recusada.' },
        comunicar: { pausa_geral: false, ultima_rodada_em: iso(10), lembrete_ligado: true, fila: 0, falhas_24h: 0, enviadas_24h: 0 },
        movere: { ultima_carga: null, cargas: 0 }, vigia: zapOk ? [] : ['codewords-chave-recusada'], patio_falhas_24h: 0 },
      vigia_avisos_abertos: { gerado_em: iso(0), vigia_conferiu_em: iso(25), vigia_parado: false, outros: 0,
        graves: zapOk ? [] : [{ codigo: 'codewords-chave-recusada', desde: iso(60 * 24 * 49), dias: 49, resumo: null, issue: null }] },
      r7_x3_saude: null,
      r7_x3_ligacoes_quebradas: vazio ? { verificacoes: [] } : { versao: 'r7', verificacoes: [
        { codigo: 'agenda-sem-cliente', app: 'Agenda', descricao: 'Horários sem cliente ligado', como_resolver: 'Abra o horário e escolha o cliente', quantidade: 3, recentes: 1, gravidade: 'media', links: [] }] },
      r6_busca_global: { termo: 'gabi', total: 2, pessoas: [{ nome: 'Gabi Inventada', telefone_55: tel(31), achou_em: ['conversa', 'lead'] }], contagens: { conversas: 1, leads: 1 }, grupos: {
        conversas: [{ id: U(31), nome: 'Gabi Inventada', telefone_55: tel(31), detalhe: 'Quanto fica a revisão de 40 mil?', status: 'aberta', extra: { aguardando_consultor: true } }],
        leads: [{ id: U(81), nome: 'Gabi Inventada', telefone_55: tel(31), detalhe: 'Revisão · anúncio Google', status: 'novo' }] } },
      r6_cliente_360: { cliente: { nome: 'Gabi Inventada', telefone_55: tel(31), aceita_mensagens: true }, resumo: { orcamentos_total: 1, dias_desde_ultima_visita: 40 },
        orcamentos: [{ numero: 16, status: 'enviado', total: 740, veiculo: 'Onix', horas_esperando: 30 }], agendamentos: [], patio: [],
        acoes_sugeridas: [{ codigo: 'responder', app: 'atendimento', titulo: 'Responder a conversa', motivo: 'Ela escreveu há 40 min' }],
        linha_do_tempo: [{ quando: iso(40), app: 'atendimento', titulo: 'Mensagem recebida', detalhe: 'Quanto fica a revisão de 40 mil?' }] },
      r7_c1_parar: {},
    },
  };
})();
