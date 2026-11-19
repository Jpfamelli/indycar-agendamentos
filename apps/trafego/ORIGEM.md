# Origem desta pasta (IndyCar Tráfego, rodada 8, 19/11/2026)

Cópia fiel do repositório local **indycar-ads**, commit **2ffa635** (`git archive`, só arquivos versionados:
sem node_modules, .env nem capturas). O IndyCar Ads nunca tinha sido publicado; aqui ele vira o
**IndyCar Tráfego**, o sexto app da IndyCar Central, em `/trafego/`.

- A chave de acesso continua `ads` (em `perfis.apps`, em `usuario_pode('ads')` e na auditoria): ninguém
  precisa ser liberado de novo.
- O motor de relatórios vem do **Nexus Ads** (`web/nucleo.js`), copiado para `motor/` com o vocabulário de
  oficina. O Nexus Ads não é alterado por este projeto: a cópia mora aqui e evolui aqui.
- **Mexa aqui**, não na pasta antiga `indycar-ads` (ela fica só como histórico).

Ajustes feitos na cópia para morar na Central:
- `server.js`: exporta `handler` e `VERSAO` (contrato da Central); encaixe de rotas em arquivos
  (`rotas/*.js`, ver `rotas/LEIA-ME.md`), com rota pública, rota com parâmetro e `exigirCron`.
- `server.js`: o cliente do Supabase da tela é procurado subindo as pastas (na Central o `node_modules`
  é o da raiz do monorrepo).
- `auth.js`: token vencido responde 401 mesmo quando o servidor está sem as chaves (antes 503).
- `package.json`: nome `indycar-trafego`.

O contrato técnico da rodada está em `indycar-ferramentas/r8/CONTRATO-TRAFEGO.md`.
