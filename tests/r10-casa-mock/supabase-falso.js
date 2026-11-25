/* Cliente do Supabase de MENTIRA para as provas da rodada 10 da Casa no Chrome. Nenhuma chave de verdade, nenhuma rede.
   Parte do de tests/r9-casa-mock/supabase-falso.js e acrescenta o que a rodada 10 precisa provar:
     window.__LIDO      → nome de cada leitura feita (tabela ou função), na ordem
     window.__GRAVADO   → cada escrita que a tela tentou (só na memória da página)
     window.__R10       → botões que o roteiro mexe com a página aberta:
                          falhar (Set de nomes), pendurar (Set de nomes que nunca respondem), erros ({ nome: objeto de erro }),
                          atraso (ms), semRede (o código de verificação falha como rede), semRenovar (a sessão não renova)
     window.__EMITIR(tabela, vezes) → dispara o "tempo real" daquela tabela
     window.__AUTH(evento, sessao)  → dispara um evento de login como se viesse de outra aba */
(function () {
  'use strict';
  var C = window.__CENARIO || {};
  var D = function () { return window.__DADOS || { tabelas: {}, rpc: {} }; };
  var R = window.__R10 = { falhar: new Set(C.falhar || []), pendurar: new Set(C.pendurar || []), erros: Object.assign({}, C.erros || {}), atraso: Number(C.atraso) || 0, semRede: false, semRenovar: !!C.semRenovar };
  var usuario = { id: '00000000-0000-4000-8000-0000000000d0', email: 'dono@oficina.test' };
  var novaSessao = function (u) { return { access_token: 'mentira', refresh_token: 'mentira', expires_at: 4102444800, user: u || usuario }; };
  var sessao = C.sessao === false ? null : novaSessao();
  var mfaFeito = false;
  var ouvintes = [];
  var canais = [];
  window.__GRAVADO = []; window.__LIDO = [];
  var espera = function () { return new Promise(function (r) { setTimeout(r, R.atraso); }); };
  function construtor(nome, fonte) {
    var unico = false, escrita = null;
    var b = {};
    var filtros = [];
    var sinal = null;
    b.abortSignal = function (s) { sinal = s; return b; };
    ['select', 'eq', 'neq', 'in', 'not', 'is', 'gte', 'lte', 'gt', 'lt', 'order', 'limit', 'range', 'or', 'filter', 'match', 'ilike', 'like', 'contains', 'returns']
      .forEach(function (m) { b[m] = function () { if (m === 'select' && escrita) escrita.devolve = true; if (/^(eq|in|is|not|lt)$/.test(m)) filtros.push([m].concat([].slice.call(arguments))); return b; }; });
    ['update', 'insert', 'upsert', 'delete'].forEach(function (m) { b[m] = function (v) { escrita = { tabela: nome, acao: m, valor: v }; return b; }; });
    b.maybeSingle = function () { unico = true; return b; };
    b.single = function () { unico = true; return b; };
    b.then = function (ok, falha) {
      if (escrita) { escrita.filtros = filtros; window.__GRAVADO.push(escrita); } else window.__LIDO.push(nome);
      // pendurado: nunca responde, a não ser que a tela tenha posto um tempo limite (aí responde o erro, como a biblioteca de verdade)
      if (R.pendurar.has(nome)) return new Promise(function (resolve) { if (sinal) sinal.addEventListener('abort', function () { resolve({ data: null, error: { message: 'AbortError: The operation was aborted', name: 'AbortError' }, count: null, status: 0 }); }); }).then(ok, falha);
      return espera().then(function () {
        if (R.erros[nome]) return { data: null, error: R.erros[nome], count: null, status: 401 };
        if (R.falhar.has(nome)) return { data: null, error: { message: 'falha simulada: ' + nome }, count: null, status: 500 };
        if (escrita && escrita.devolve) {   // R19: escrita com .select() devolve o que mudou (aqui, os ids pedidos no .in)
          var pedidos = (filtros.filter(function (f) { return f[0] === 'in' && f[1] === 'id'; })[0] || [])[2] || [];
          return { data: pedidos.map(function (id) { return { id: id }; }), error: null, count: null, status: 200 };
        }
        if (escrita) return { data: null, error: null, count: null, status: 204 };
        var v = fonte();
        var data = v === undefined ? (unico ? null : []) : (typeof v === 'function' ? v() : v);
        if (Array.isArray(data)) filtros.filter(function (f) { return f[0] === 'is' && f[2] === null; }).forEach(function (f) { data = data.filter(function (r) { return !r || r[f[1]] == null; }); });   // R14: .is(coluna, null) filtra
        /* R15: as tarefas da própria pessoa que já venceram: eq (dono e situação) e lt (prazo) valem de verdade só nesta tabela */
        if (nome === 'tarefas' && Array.isArray(data)) filtros.forEach(function (f) { if (f[0] === 'eq' && /^(responsavel_id|status)$/.test(f[1])) data = data.filter(function (r) { return r[f[1]] === f[2]; }); if (f[0] === 'lt' && f[1] === 'vence_em') data = data.filter(function (r) { return r.vence_em && r.vence_em < f[2]; }); });
        if (unico && Array.isArray(data)) data = data[0] || null;
        return { data: data, error: null, count: Array.isArray(data) ? data.length : null, status: 200 };
      }).then(ok, falha);
    };
    return b;
  }
  function canal() {
    var c = { on: function (tipo, filtro, fn) { canais.push({ tabela: filtro && filtro.table, fn: fn }); return c; }, subscribe: function (fn) { try { fn && fn('SUBSCRIBED'); } catch (e) { /* segue */ } return c; }, unsubscribe: function () {} };
    return c;
  }
  window.__EMITIR = function (tabela, vezes) { for (var i = 0; i < (vezes || 1); i++) canais.filter(function (x) { return x.tabela === tabela; }).forEach(function (x) { try { x.fn({ table: tabela }); } catch (e) { /* segue */ } }); };
  window.__AUTH = function (evento, s) { if (s !== undefined) sessao = s; ouvintes.forEach(function (fn) { try { fn(evento, sessao); } catch (e) { /* segue */ } }); };
  window.__NOVA_SESSAO = novaSessao;
  window.supabase = {
    createClient: function () {
      return {
        auth: {
          getSession: function () { return Promise.resolve({ data: { session: sessao }, error: null }); },
          getUser: function () { return Promise.resolve({ data: { user: sessao ? sessao.user : null }, error: null }); },
          refreshSession: function () {
            window.__GRAVADO.push({ tabela: 'auth', acao: 'renovar' });
            if (R.semRenovar) { return Promise.resolve({ data: { session: null }, error: { message: 'Invalid Refresh Token' } }); }
            return Promise.resolve({ data: { session: sessao }, error: null });
          },
          onAuthStateChange: function (fn) { ouvintes.push(fn); return { data: { subscription: { unsubscribe: function () {} } } }; },
          signOut: function () { sessao = null; return Promise.resolve({ error: null }); },
          signInWithPassword: function (o) {
            if (!o || o.password !== 'senha-de-mentira') return Promise.resolve({ data: null, error: { message: 'Invalid login credentials' } });
            sessao = novaSessao();
            return Promise.resolve({ data: { session: sessao }, error: null });
          },
          resetPasswordForEmail: function (email) { window.__GRAVADO.push({ tabela: 'auth', acao: 'link-de-senha', valor: email }); return espera().then(function () { return { data: {}, error: null }; }); },
          updateUser: function () { window.__GRAVADO.push({ tabela: 'auth', acao: 'senha' }); return espera().then(function () { return { data: {}, error: null }; }); },
          mfa: {
            getAuthenticatorAssuranceLevel: function () { return Promise.resolve({ data: C.mfa ? { currentLevel: mfaFeito ? 'aal2' : 'aal1', nextLevel: 'aal2' } : { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null }); },
            listFactors: function () { return Promise.resolve({ data: { totp: C.mfa ? [{ id: 'fator-1', status: 'verified' }] : [] }, error: null }); },
            challengeAndVerify: function (o) {
              window.__GRAVADO.push({ tabela: 'auth', acao: 'codigo', valor: o && o.code });
              return espera().then(function () {
                if (R.semRede) return { data: null, error: { message: 'Failed to fetch' } };
                if (!o || o.code !== '123456') return { data: null, error: { message: 'Invalid TOTP code entered' } };
                mfaFeito = true; return { data: {}, error: null };
              });
            },
          },
        },
        from: function (t) { return construtor(t, function () { return D().tabelas[t]; }); },
        rpc: function (n) { return construtor(n, function () { return D().rpc[n]; }); },
        channel: function () { return canal(); },
        removeChannel: function () {},
      };
    },
  };
})();
