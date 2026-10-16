// -----------------------------------------------------------------------------
// "Pronto para ligar" (rodada 4) — o checklist do que falta para o Comunicar
// funcionar de verdade, com O QUE FAZER em cada item. PURO (testado em
// `npm test`; o mock usa a mesma função). O servidor junta os fatos
// (montarFatos em rotas.js) e esta função decide o que está ok.
//
// estado: 'ok' (pronto) · 'falta' (impede de funcionar) · 'aviso' (funciona, mas…)
// acao.tipo: 'rota' (abre uma tela do Comunicar) · 'link' (outro app) · 'modal'
// -----------------------------------------------------------------------------
import { REGUAS, ROTULO_TIPO } from './dados.js';
import { itemPatioProntidao } from './patio.js';
import { APPS, LINKS } from './acesso.js';

const ATENDIMENTO = LINKS.integracoes(); // rodada 5: abre direto em Configurações › Integrações
void APPS;

/**
 * @param {object} f fatos
 * @param {object} f.cfg            configuração das réguas (obterConfig)
 * @param {object} f.whatsapp       { ok, conectado, chaveRecusada, erro }
 * @param {object} f.carteiro       { ultimaEm, falhas24h, chamadas24h, foraDoAr }
 * @param {object} f.aniversarios   { comData, total }
 * @param {object} f.ia             { ativo, temChave }
 * @param {object} f.teste          { ultimoOkEm }
 * @param {number} [f.agora]
 */
export function montarProntidao(f) {
  const { cfg = {}, whatsapp = {}, carteiro = {}, aniversarios = {}, ia = {}, teste = {} } = f;
  const agora = f.agora ?? Date.now();
  const itens = [];
  const item = (id, titulo, estado, texto, acao = null, essencial = false) => itens.push({ id, titulo, estado, texto, acao, essencial });

  // 1. chave do CodeWords
  if (whatsapp.chaveRecusada) {
    item('whatsapp_chave', 'Chave do WhatsApp (CodeWords)', 'falta',
      'A chave foi recusada: nenhuma mensagem sai nem entra. Gere uma nova em runtime.codewords.ai e cole em Atendimento › Configurações › Integrações › Chave de API.',
      { tipo: 'link', alvo: ATENDIMENTO, rotulo: 'Abrir o Atendimento' }, true);
  } else if (whatsapp.ok === false) {
    item('whatsapp_chave', 'Chave do WhatsApp (CodeWords)', 'aviso',
      'O CodeWords não respondeu agora. Se continuar, confira a chave em Atendimento › Configurações › Integrações.',
      { tipo: 'link', alvo: ATENDIMENTO, rotulo: 'Abrir o Atendimento' }, true);
  } else {
    item('whatsapp_chave', 'Chave do WhatsApp (CodeWords)', 'ok', 'Chave aceita pelo CodeWords.', null, true);
  }

  // 2. aparelho conectado
  if (whatsapp.conectado) item('whatsapp_aparelho', 'WhatsApp da oficina conectado', 'ok', 'O número da oficina está conectado e pronto para enviar.', null, true);
  else item('whatsapp_aparelho', 'WhatsApp da oficina conectado', whatsapp.chaveRecusada ? 'aviso' : 'falta',
    whatsapp.chaveRecusada ? 'Dá para conferir só depois de trocar a chave do CodeWords.' : 'Reconecte o número da oficina no Atendimento (ler o QR code com o celular da oficina).',
    { tipo: 'link', alvo: ATENDIMENTO, rotulo: 'Abrir o Atendimento' }, true);

  // 3. réguas ligadas
  const ligadas = REGUAS.filter((r) => cfg[`ativo_${r}`]);
  if (!ligadas.length) {
    item('reguas', 'Réguas ligadas', 'falta', 'Nenhuma régua está ligada. Comece pelas mais seguras: Lembrete de horário e Pós-venda.',
      { tipo: 'rota', alvo: 'reguas', rotulo: 'Ligar réguas' }, true);
  } else {
    item('reguas', 'Réguas ligadas', ligadas.length >= 2 ? 'ok' : 'aviso',
      `${ligadas.length} de ${REGUAS.length} ligadas: ${ligadas.map((r) => ROTULO_TIPO[r] || r).join(', ')}.${ligadas.length < 2 ? ' Que tal ligar também o Pós-venda?' : ''}`,
      { tipo: 'rota', alvo: 'reguas', rotulo: 'Ver réguas' }, true);
  }

  // 4. textos das réguas ligadas
  const semTexto = ligadas.filter((r) => !String(cfg[`msg_${r}`] || '').trim());
  if (semTexto.length) item('mensagens', 'Texto de cada régua ligada', 'falta', `Sem texto: ${semTexto.map((r) => ROTULO_TIPO[r] || r).join(', ')}. Escreva (ou peça 3 opções à IA) em Réguas.`, { tipo: 'rota', alvo: 'reguas', rotulo: 'Escrever' }, true);
  else item('mensagens', 'Texto de cada régua ligada', 'ok', ligadas.length ? 'Todas as réguas ligadas têm mensagem.' : 'As oito réguas já vêm com um texto pronto.', null, true);

  // 5. pausa geral
  if (cfg.pausa_geral) item('pausa', 'Pausa geral desligada', 'falta', 'A pausa geral está ligada: o carteiro não envia nada. Desligue em Réguas › Envio.', { tipo: 'rota', alvo: 'reguas', rotulo: 'Abrir Envio' }, true);
  else item('pausa', 'Pausa geral desligada', 'ok', 'Os envios não estão pausados.', null, true);

  // 6. link de avaliação
  if (cfg.link_avaliacao) item('link_avaliacao', 'Link de avaliação no Google', 'ok', 'Link cadastrado: quem gostar do serviço recebe o convite para avaliar.');
  else item('link_avaliacao', 'Link de avaliação no Google', cfg.ativo_avaliacao ? 'falta' : 'aviso',
    'Sem o link, a régua Avaliação não sai. No Google Perfil da Empresa: "Pedir avaliações" › copiar o link e colar em Réguas › Avaliação.',
    { tipo: 'rota', alvo: 'reguas', rotulo: 'Cadastrar link' });

  // 7. telefone de teste
  if (cfg.telefone_teste) item('telefone_teste', 'Telefone de teste', 'ok', 'Cadastrado: o "Mandar teste para mim" chega nele.');
  else item('telefone_teste', 'Telefone de teste', 'falta', 'Cadastre seu celular em Réguas › Envio para ver as mensagens chegando antes do cliente.', { tipo: 'rota', alvo: 'reguas', rotulo: 'Cadastrar' });

  // 8. teste que chegou
  const testeDias = teste.ultimoOkEm ? (agora - new Date(teste.ultimoOkEm).getTime()) / 86400000 : null;
  if (testeDias !== null && testeDias <= 30) item('teste', 'Um teste chegou no seu celular', 'ok', 'O último teste saiu bem nos últimos 30 dias.');
  else item('teste', 'Um teste chegou no seu celular', 'aviso', 'Mande um teste (Réguas › qualquer régua › "Mandar teste para mim") e confira se chegou.', { tipo: 'rota', alvo: 'reguas', rotulo: 'Mandar teste' });

  // 9. aniversários
  const comData = Number(aniversarios.comData) || 0, total = Number(aniversarios.total) || 0;
  const pct = total ? Math.round((comData / total) * 100) : 0;
  if (!comData) item('aniversarios', 'Aniversários cadastrados', cfg.ativo_aniversario ? 'falta' : 'aviso',
    `Nenhum dos ${total} clientes tem data de nascimento: a régua Aniversário não tem para quem mandar. Cole uma lista, suba um CSV ou procure nas conversas.`,
    { tipo: 'modal', alvo: 'aniversarios', rotulo: 'Cadastrar aniversários' });
  else item('aniversarios', 'Aniversários cadastrados', pct >= 20 ? 'ok' : 'aviso',
    `${comData} de ${total} clientes com data (${pct}%).${pct < 20 ? ' Quanto mais datas, mais parabéns saem.' : ''}`,
    { tipo: 'modal', alvo: 'aniversarios', rotulo: 'Cadastrar mais' });

  // 10. carteiro (o que acorda o servidor e envia)
  if (!cfg.carteiro_configurado) item('carteiro', 'Carteiro automático', 'falta', 'O carteiro externo não está configurado: com o servidor dormindo, nada sai. Fale com o administrador.', null, true);
  else if (carteiro.ultimaEm && (agora - new Date(carteiro.ultimaEm).getTime()) < 40 * 60000) {
    const f24 = Number(carteiro.falhas24h) || 0;
    item('carteiro', 'Carteiro automático', f24 >= 4 ? 'aviso' : 'ok',
      f24 ? `Rodando. Nas últimas 24 h, ${f24} chamada(s) encontraram o servidor dormindo ou fora do ar — o reforço tenta de novo em 5 min e nada se perde.` : 'Rodando a cada 15 min, com reforço quando o servidor não acorda.',
      { tipo: 'modal', alvo: 'carteiro', rotulo: 'Ver as últimas rodadas' }, true);
  } else {
    item('carteiro', 'Carteiro automático', 'aviso', 'O carteiro não rodou nos últimos 40 min (fora do horário ele descansa). Se for horário de envio, use "Rodar agora".',
      { tipo: 'modal', alvo: 'carteiro', rotulo: 'Ver as últimas rodadas' }, true);
  }

  // 11. IA (opcional)
  if (ia.ativo && ia.temChave) item('ia', 'IA lendo as respostas', 'ok', 'A IA lê as respostas e avisa quem quer agendar ou reclamou.');
  else item('ia', 'IA lendo as respostas', 'aviso', ia.ativo === false ? 'A IA está desligada (Atendimento › Configurações › IA). O Comunicar funciona sem ela.' : 'A IA está sem chave. O Comunicar funciona sem ela.');

  // 12. avisos do Pátio (16/10/2026) — ligados no app do Pátio, saem por esta fila
  if (f.patio !== undefined) {
    const it = itemPatioProntidao(f.patio?.cfg ?? null, f.patio?.fila || {}, agora);
    item(it.id, it.titulo, it.estado, it.texto, it.acao);
  }

  const prontos = itens.filter((i) => i.estado === 'ok').length;
  const faltamEssenciais = itens.filter((i) => i.essencial && i.estado === 'falta');
  return {
    itens, prontos, total: itens.length,
    pronto: !faltamEssenciais.length,
    faltam: itens.filter((i) => i.estado === 'falta').length,
    avisos: itens.filter((i) => i.estado === 'aviso').length,
    proximo: itens.find((i) => i.estado === 'falta') || itens.find((i) => i.estado === 'aviso') || null,
  };
}
