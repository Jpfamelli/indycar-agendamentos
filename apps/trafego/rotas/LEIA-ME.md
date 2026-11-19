# rotas/ — como registrar rotas novas sem mexer no server.js

Todo arquivo `.js` desta pasta é carregado na subida do app, em ordem alfabética. Cada arquivo exporta
uma função que recebe o contexto e registra as suas rotas:

```js
'use strict';
module.exports = (ctx) => {
  const { rota, rotaPublica, ErroHttp, db } = ctx;

  // Rota com login (admin ou quem tem o app "ads" liberado). Passa por limite, 2 etapas, auditoria.
  rota('GET', '/api/jornada', async ({ q, usuario }) => {
    return { itens: [] };              // o que você devolve vira JSON 200
  });

  // Rota com parâmetro no caminho: use RegExp; o resultado do exec chega em `m`.
  rota('GET', /^\/api\/jornada\/([0-9a-f-]{36})$/, async ({ m }) => ({ id: m[1] }));

  // Rota sem login (cada uma cuida da própria autenticação).
  rotaPublica('POST', '/api/ia/v1/consulta', async ({ req, corpo, ip }) => {
    const dados = await corpo();       // JSON já lido (limite de 1 MB)
    if (!dados.pergunta) throw new ErroHttp(422, 'faltou a pergunta');
    return { ok: true };
  });

  // Pública para qualquer site (script de rastreio): { corsLivre: true }.
  rotaPublica('GET', '/rastreio.js', ({ res }) => {
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
    res.end('/* … */');                // se você mesmo encerra a resposta, nada mais é enviado
  }, { corsLivre: true });
};
```

## O que vem no contexto (`ctx`)
| Nome | Para quê |
|---|---|
| `rota(método, caminho ou RegExp, fn)` | rota **com login**. `fn({ req, res, q, usuario, corpo, m })` |
| `rotaPublica(método, caminho ou RegExp, fn, { corsLivre })` | rota **sem login**. `fn({ req, res, q, caminho, ip, corpo, m })` |
| `exigirCron(q, req)` | para rotinas em `/api/cron/…`: confere o cabeçalho `X-Cron-Chave` ou `?chave=` (lança 401) |
| `json(res, status, objeto)` | resposta JSON com os cabeçalhos de segurança |
| `ErroHttp(status, mensagem, extra)` | erro que sai em JSON com o status certo |
| `lerCorpo(req)` | o mesmo que `corpo()` |
| `db`, `auth`, `seg`, `equipe`, `limitador` | os módulos do app |
| `periodoDaQuery(q)`, `platDe(q)`, `limiteDe(q)`, `hojeBR()` | utilitários de consulta |
| `VERSAO` | versão do app |

## Regras
1. Um arquivo por assunto, com o nome do assunto (`jornada.js`, `origem.js`, `gestor.js`, `ia-v1.js`, `mcp.js`…).
   Cada frente só edita os seus arquivos. Não edite o `server.js` para criar rota.
2. Rota pública passa pelo limite por IP e pelo limite de 1 MB, e **não** passa por login: quem registra
   precisa conferir a chave (`exigirCron`, chave `ica_…` da IA) ou garantir que não há nada sensível.
3. Rota pública só aceita outro site quando pede `{ corsLivre: true }`. Sem isso, vale a regra do
   ecossistema (mesmo domínio e os endereços conhecidos).
4. Se o arquivo falhar ao carregar, o app sobe do mesmo jeito e o erro aparece no log e em
   `ROTAS_COM_ERRO` (o teste `tests/rotas-encaixe.test.js` cobra lista vazia).
5. Toda rota nova entra no `API.md` do app e ganha teste (`node:test`, sem rede e sem banco).
