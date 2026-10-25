/* Casa — rodada 6 (C1c): regras puras do "Bom dia" e das mensagens de WhatsApp prontas.
   Nada aqui fala com o banco nem com a tela; é o que os testes carregam em node:vm. */
(function (root) {
  'use strict';
  const L = root.CasaLogica || {};

  /** Link do WhatsApp (wa.me) com texto pronto. Aceita 55DDDNÚMERO, DDDNÚMERO ou com máscara; senão devolve null. */
  function linkWhatsApp(tel, texto) {
    const d = String(tel || '').replace(/\D/g, '');
    const n = d.length === 10 || d.length === 11 ? '55' + d : d;
    if (!/^55\d{10,11}$/.test(n)) return null;
    return 'https://wa.me/' + n + (texto ? '?text=' + encodeURIComponent(String(texto).slice(0, 900)) : '');
  }
  const primeiroNome = (n) => {
    const p = (String(n || '').trim().split(/\s+/)[0] || '').replace(/[^\p{L}'’-]/gu, '').slice(0, 30);
    return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : '';
  };
  const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  /** "hoje às 14:00", "amanhã às 09:30" ou "sexta (23/10) às 08:00", a partir de AAAA-MM-DD + HH:MM e do dia de hoje. */
  function quando(data, hora, hoje) {
    const h = String(hora || '').slice(0, 5);
    const ehData = (v) => /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(String(v || ''));
    if (!ehData(data) || !ehData(hoje)) return h ? 'às ' + h : 'em breve';
    const t = (s) => Date.parse(s + 'T12:00:00Z');
    const dif = Math.round((t(data) - t(hoje)) / 86400000);
    const dia = dif === 0 ? 'hoje' : dif === 1 ? 'amanhã' : `${DIAS[new Date(t(data)).getUTCDay()]} (${data.slice(8, 10)}/${data.slice(5, 7)})`;
    return h ? `${dia} às ${h}` : dia;
  }
  const carroDe = (i) => [i.veiculo, i.placa].filter(Boolean).join(' ') || 'carro';

  /** Texto de cada recado. Sempre começa pelo nome, é curto e termina com uma pergunta ou um próximo passo. */
  function mensagemWa(tipo, i, { hoje } = {}) {
    const nome = primeiroNome(i.nome || i.cliente);
    const oi = nome ? `Oi ${nome}!` : 'Olá!';
    switch (tipo) {
      case 'pronto': return `${oi} Seu ${carroDe(i)} está pronto aqui na IndyCar. Pode passar para retirar até as 17h30?`;
      case 'orcamento': return `${oi} Conseguiu ver o orçamento${i.numero ? ' ' + L.numeroOrc?.(i.numero) : ''} que enviamos? Se tiver qualquer dúvida, é só me dizer.`;
      case 'aprovado': return `${oi} Vimos que você aprovou o orçamento. Vamos marcar o melhor horário para fazer o serviço?`;
      case 'lembrar': return `${oi} Passando para lembrar do seu horário ${quando(i.data, i.hora, hoje)} na IndyCar${i.servico ? ' (' + i.servico + ')' : ''}. Posso confirmar a sua presença?`;
      case 'reabordar': return `${oi} Aqui é da IndyCar. Lembrei do orçamento${i.numero ? ' ' + L.numeroOrc?.(i.numero) : ''} que ficou parado. Quer que eu reveja com você o que dá para ajustar?`;
      case 'remarcar': return `${oi} Ontem você tinha um horário com a gente na IndyCar. Deu tudo certo? Se precisar remarcar, é só me avisar.`;
      default: return oi;
    }
  }

  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  /**
   * Resume o RPC r6_c1c_manha em frases e pendências. `gestor` libera o valor em dinheiro.
   * Devolve { vazio, ontem, amanha, pendencias:[{k,n,texto,grav,app}] } — `app` diz para onde o botão leva.
   */
  function resumoManha(m, { gestor = false } = {}) {
    const o = (m && m.ontem) || {}, a = (m && m.amanha) || {}, p = (m && m.patio) || {};
    const n = (v) => Math.max(0, Number(v) || 0);
    let ontem;
    if (!n(o.total)) ontem = 'Ontem não teve horário marcado.';
    else {
      const partes = [`${n(o.vieram)} de ${n(o.total)} vieram`];
      if (n(o.fechados)) partes.push(`${plural(n(o.fechados), 'fechou', 'fecharam')}${gestor && Number(o.valor) > 0 ? ' (' + (L.brl ? L.brl(o.valor) : o.valor) + ')' : ''}`);
      if (n(o.faltaram)) partes.push(`${plural(n(o.faltaram), 'não veio', 'não vieram')}`);
      ontem = 'Ontem: ' + partes.join(' · ') + '.';
    }
    let amanha;
    if (!n(a.total)) amanha = 'Amanhã ainda não tem horário marcado.';
    else amanha = `Amanhã: ${plural(n(a.total), 'horário', 'horários')}${a.primeiro ? ', o primeiro às ' + a.primeiro : ''}${n(a.sem_confirmar) ? ' · ' + n(a.sem_confirmar) + ' sem confirmar' : ' · todos confirmados'}.`;
    const pend = [];
    if (n(o.sem_baixa)) pend.push({ k: 'sem_baixa', n: n(o.sem_baixa), grav: 3, app: 'agenda', texto: `${plural(n(o.sem_baixa), 'horário de ontem', 'horários de ontem')} sem baixa`, extra: 'Ninguém marcou se o cliente veio. Isso some do faturamento e da taxa de falta.' });
    if (n(p.prontos_desde_ontem)) pend.push({ k: 'prontos', n: n(p.prontos_desde_ontem), grav: 2, app: 'patio', texto: `${plural(n(p.prontos_desde_ontem), 'carro pronto', 'carros prontos')} esperando retirada desde ontem`, extra: 'Avise o cliente para liberar o pátio.' });
    if (n(p.parados_2d)) pend.push({ k: 'parados', n: n(p.parados_2d), grav: 2, app: 'patio', texto: `${plural(n(p.parados_2d), 'carro parado', 'carros parados')} há mais de 2 dias na mesma etapa` });
    if (n(a.sem_confirmar)) pend.push({ k: 'sem_confirmar', n: n(a.sem_confirmar), grav: 1, app: 'agenda', texto: `${plural(n(a.sem_confirmar), 'horário de amanhã', 'horários de amanhã')} sem confirmar`, extra: 'Mande o lembrete agora para não ter buraco na agenda.' });
    if (n(a.sem_telefone)) pend.push({ k: 'sem_telefone', n: n(a.sem_telefone), grav: 2, app: 'agenda', texto: `${plural(n(a.sem_telefone), 'horário de amanhã', 'horários de amanhã')} sem telefone`, extra: 'Sem telefone não dá para lembrar o cliente.' });
    pend.sort((x, y) => y.grav - x.grav);
    return { vazio: !n(o.total) && !n(a.total) && !pend.length, ontem, amanha, pendencias: pend };
  }

  /** Item (lista de amanhã / de ontem sem baixa) vira a linha com o botão certo de WhatsApp. */
  function acaoDaLinha(tipo, i, hoje, dataDoItem) {
    const url = linkWhatsApp(i.telefone_55 || i.telefone, mensagemWa(tipo, { ...i, data: dataDoItem }, { hoje }));
    return url ? { url, rotulo: { lembrar: 'Lembrar', remarcar: 'Perguntar', pronto: 'Avisar', orcamento: 'Cobrar', aprovado: 'Chamar', reabordar: 'Reabordar' }[tipo] || 'WhatsApp' } : null;
  }

  root.CasaLogica3 = Object.freeze({ linkWhatsApp, mensagemWa, quando, resumoManha, acaoDaLinha, primeiroNome });
})(typeof globalThis !== 'undefined' ? globalThis : window);
