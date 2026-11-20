/* ============================================================
   IndyCar Atendimento · r9-regras.js (Rodada 9, 20/11/2026)
   Regras PURAS dos formulários (sem rede, sem DOM). Carregado no navegador (window.R9) e no Node.
     · telefone da janela "Nova conversa": confere e diz o porquê quando não serve
     · comando do atalho: o que se digita depois da barra, sem espaço, acento ou maiúscula
     · placa: como o atendente digitou vira o formato que a ficha guarda
   Testado em test/r9-regras.test.js.
   ============================================================ */
(function (raiz) {
  'use strict';
  const soDigitos = (t) => String(t ?? '').replace(/\D/g, '');

  /** Telefone de cliente digitado na "Nova conversa". Aceita com ou sem +55, com ou sem máscara.
      Devolve { ok, digitos (DDD + número, sem o 55), erro }. */
  function telefoneNovaConversa(texto) {
    const cru = String(texto ?? '').trim();
    if (!cru) return { ok: false, digitos: '', erro: 'Digite o telefone do cliente com o DDD.' };
    if (/[a-zA-ZÀ-ú]/.test(cru)) return { ok: false, digitos: '', erro: 'O telefone leva só números. Exemplo: (12) 99999-8888.' };
    let d = soDigitos(cru);
    if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
    if (d.length > 11 && d.startsWith('0')) d = d.replace(/^0+/, '');
    if (d.length < 10) return { ok: false, digitos: d, erro: d.length >= 8 ? 'Faltou o DDD. Exemplo: (12) 99999-8888.' : 'Telefone curto demais: são o DDD e mais 8 ou 9 números.' };
    if (d.length > 11) return { ok: false, digitos: d, erro: 'Telefone comprido demais: são o DDD e mais 8 ou 9 números.' };
    if (!/^[1-9][1-9]/.test(d)) return { ok: false, digitos: d, erro: 'O DDD não existe. Confira os dois primeiros números.' };
    if (d.length === 11 && d[2] !== '9') return { ok: false, digitos: d, erro: 'Celular com 11 números começa com 9 depois do DDD. Confira o número.' };
    return { ok: true, digitos: d, erro: '' };
  }

  /** Comando do atalho (o que se digita depois da "/"): minúsculo, sem acento, sem espaço.
      "Bom Dia" vira "bomdia"; "/orçamento 2" vira "orcamento2". Devolve { ok, comando, erro }. */
  function comandoAtalho(texto) {
    const comando = String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/^\/+/, '').replace(/[^a-z0-9_-]/g, '').slice(0, 30);
    if (!comando) return { ok: false, comando: '', erro: 'O comando precisa de pelo menos uma letra ou número, sem espaço. Exemplo: bomdia.' };
    return { ok: true, comando, erro: '' };
  }

  /** Placa como a ficha guarda: maiúscula, só letras e números (ABC1D23 ou ABC1234).
      Devolve { ok, placa, erro }; vazio é aceito (o campo é opcional). */
  function placaDigitada(texto) {
    const placa = String(texto ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!placa) return { ok: true, placa: '', erro: '' };
    if (!/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(placa)) return { ok: false, placa, erro: 'Placa fora do padrão. São 3 letras e 4 caracteres, como ABC1D23 ou ABC-1234.' };
    return { ok: true, placa, erro: '' };
  }

  const R9 = { telefoneNovaConversa, comandoAtalho, placaDigitada };
  if (typeof module !== 'undefined' && module.exports) module.exports = R9;
  else raiz.R9 = R9;
})(typeof window !== 'undefined' ? window : globalThis);
