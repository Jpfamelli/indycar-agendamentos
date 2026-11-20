/* Cliente do Supabase de MENTIRA para conferir a Casa no Chrome (rodada 9). Nenhuma chave de verdade, nenhuma rede.
   Origem: indycar-ferramentas/r8/entrega/_manual/casa-mock/supabase-falso.js, com falha por nome (__CENARIO.falhar),
   sessão desligável (__CENARIO.sessao === false mostra a tela de entrar) e registro do que a tela tentou gravar
   (window.__GRAVADO: só na memória da página, para o roteiro conferir). */
(function () {
  'use strict';
  var C = window.__CENARIO || {};
  var D = function () { return window.__DADOS || { tabelas: {}, rpc: {} }; };
  var falhar = new Set(C.falhar || []);
  var usuario = { id: '00000000-0000-4000-8000-0000000000d0', email: 'dono@oficina.test' };
  var sessao = C.sessao === false ? null : { access_token: 'mentira', refresh_token: 'mentira', expires_at: 4102444800, user: usuario };
  window.__GRAVADO = [];
  function construtor(nome, fonte) {
    var unico = false, escrita = null;
    var b = {};
    var filtros = [];   // eq/in/… de uma escrita, para o roteiro conferir O QUE foi marcado (ex.: marcar todas como lidas)
    ['select', 'eq', 'neq', 'in', 'not', 'is', 'gte', 'lte', 'gt', 'lt', 'order', 'limit', 'range', 'or', 'filter', 'match', 'ilike', 'like', 'contains', 'returns', 'abortSignal']
      .forEach(function (m) { b[m] = function () { if (/^(eq|in|is|not)$/.test(m)) filtros.push([m].concat([].slice.call(arguments))); return b; }; });
    ['update', 'insert', 'upsert', 'delete'].forEach(function (m) { b[m] = function (v) { escrita = { tabela: nome, acao: m, valor: v }; return b; }; });
    b.maybeSingle = function () { unico = true; return b; };
    b.single = function () { unico = true; return b; };
    b.then = function (ok, falha) {
      var atraso = Number(C.atraso) || 0;
      return new Promise(function (r) { setTimeout(r, atraso); }).then(function () {
        if (falhar.has(nome)) return { data: null, error: { message: 'falha simulada: ' + nome }, count: null, status: 500 };
        if (escrita) { escrita.filtros = filtros; window.__GRAVADO.push(escrita); return { data: null, error: null, count: null, status: 204 }; }
        var v = fonte();
        var data = v === undefined ? (unico ? null : []) : (typeof v === 'function' ? v() : v);
        if (unico && Array.isArray(data)) data = data[0] || null;
        return { data: data, error: null, count: Array.isArray(data) ? data.length : null, status: 200 };
      }).then(ok, falha);
    };
    return b;
  }
  var canal = { on: function () { return canal; }, subscribe: function (fn) { try { fn && fn('SUBSCRIBED'); } catch (e) { /* segue */ } return canal; }, unsubscribe: function () {} };
  window.supabase = {
    createClient: function () {
      return {
        auth: {
          getSession: function () { return Promise.resolve({ data: { session: sessao }, error: null }); },
          getUser: function () { return Promise.resolve({ data: { user: usuario }, error: null }); },
          onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function () {} } } }; },
          signOut: function () { sessao = null; return Promise.resolve({ error: null }); },
          signInWithPassword: function (o) {
            if (!o || o.password !== 'senha-de-mentira') return Promise.resolve({ data: null, error: { message: 'Invalid login credentials' } });
            sessao = { access_token: 'mentira', refresh_token: 'mentira', expires_at: 4102444800, user: usuario };
            return Promise.resolve({ data: { session: sessao }, error: null });
          },
          resetPasswordForEmail: function (email) {
            window.__GRAVADO.push({ tabela: 'auth', acao: 'link-de-senha', valor: email });
            return new Promise(function (r) { setTimeout(r, Number(C.atraso) || 0); }).then(function () { return { data: {}, error: null }; });
          },
          updateUser: function () { return Promise.resolve({ data: {}, error: null }); },
          mfa: {
            getAuthenticatorAssuranceLevel: function () { return Promise.resolve({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null }); },
            listFactors: function () { return Promise.resolve({ data: { totp: [] }, error: null }); },
          },
        },
        from: function (t) { return construtor(t, function () { return D().tabelas[t]; }); },
        rpc: function (n) { return construtor(n, function () { return D().rpc[n]; }); },
        channel: function () { return canal; },
        removeChannel: function () {},
      };
    },
  };
})();
