/* Cliente do Supabase de mentira: só o servidor de mentira da tela entrega este arquivo, no lugar de
   vendor/supabase.js. Tem o mínimo que a tela usa (createClient().auth) e nenhuma chave de verdade.
   Na página, ?sessao=nao simula "ninguém logado". */
(function () {
  'use strict';
  var consulta = new URLSearchParams(window.location.search);
  var sessao = consulta.get('sessao') === 'nao'
    ? null
    : { access_token: 'chave-de-mentira', user: { id: '00000000-0000-4000-8000-00000000eu01', email: 'dono@oficina.test' } };
  var ouvintes = [];
  window.supabase = {
    createClient: function () {
      return {
        auth: {
          getSession: function () { return Promise.resolve({ data: { session: sessao }, error: null }); },
          onAuthStateChange: function (fn) {
            ouvintes.push(fn);
            return { data: { subscription: { unsubscribe: function () {} } } };
          },
          signOut: function () {
            sessao = null;
            ouvintes.forEach(function (fn) { fn('SIGNED_OUT', null); });
            return Promise.resolve({ error: null });
          },
        },
      };
    },
  };
})();
