/* ===================== IndyCar Comunicar — Rodada 16 (25/11/2026) =====================
   Polimento. Funções PURAS (testadas em scripts/testes-r16.mjs):
   • textoSegmento: "Sem voltar há mais de N meses" + 6 vira "Sem voltar há mais de 6 meses"
     (antes aparecia "...de N meses (6)").
   • FILTROS_CLIENTES / filtrarClientes / contarClientes: pílulas da tela Clientes para
     limpar a base (fora da lista, sem telefone, sem aniversário).
   Quem chama escapa (esc) o texto antes de virar HTML.
   ====================================================================================== */
(function () {
  'use strict';

  /** Rótulo do segmento com o valor no lugar do "N". Sem "N" no rótulo, o valor vai entre parênteses. */
  function textoSegmento(rotulo, valor) {
    var r = String(rotulo == null ? '' : rotulo);
    var tem = valor !== null && valor !== undefined && valor !== '';
    if (!tem) return r;
    if (/\bN\b/.test(r)) return r.replace(/\bN\b/, String(valor));
    return r + ' (' + valor + ')';
  }

  var FILTROS_CLIENTES = [
    { id: 'todos', rotulo: 'Todos' },
    { id: 'fora', rotulo: 'Fora da lista' },
    { id: 'sem_telefone', rotulo: 'Sem telefone' },
    { id: 'sem_aniversario', rotulo: 'Sem aniversário' },
  ];

  function semTelefone(c) { return String((c && c.telefone) || '').replace(/\D/g, '').length < 10; }

  function filtrarClientes(lista, filtro) {
    var l = Array.isArray(lista) ? lista : [];
    if (filtro === 'fora') return l.filter(function (c) { return c.aceita_mensagens === false; });
    if (filtro === 'sem_telefone') return l.filter(semTelefone);
    if (filtro === 'sem_aniversario') return l.filter(function (c) { return !c.nascimento; });
    return l;
  }

  function contarClientes(lista) {
    var o = {};
    FILTROS_CLIENTES.forEach(function (f) { o[f.id] = filtrarClientes(lista, f.id).length; });
    return o;
  }

  window.R16 = { textoSegmento: textoSegmento, FILTROS_CLIENTES: FILTROS_CLIENTES, semTelefone: semTelefone, filtrarClientes: filtrarClientes, contarClientes: contarClientes };
})();
