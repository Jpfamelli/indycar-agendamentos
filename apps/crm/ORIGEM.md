# Origem desta pasta (IndyCar Central, 16/10/2026)

Cópia fiel do repositório **Jpfamelli/indycar-crm**, commit **355e9f8** (`git archive`, só arquivos versionados:
sem node_modules, .env, bancos locais nem capturas), com finais de linha LF.

Desde a IndyCar Central este é o código que roda em produção, em
https://indycar-agendamentos.onrender.com/crm/ (serviço Render `srv-d8hca5i8qa3s73bhnl90`, `node central.js`
na raiz deste repositório). **Mexa aqui**, não no repositório antigo: o serviço gratuito antigo passa a só
redirecionar (308) para o endereço novo.

Ajustes feitos na cópia para morar na Central (o resto é idêntico ao commit acima):
- `server.js`: exporta também `ligarAutomacoes` (a Central liga as automações sem abrir porta).
- `public/sw.js`: cache `indycar-crm-v9`; ao ativar apaga só caches `indycar-crm-*` (no mesmo domínio moram 5 service workers).
- `public/apps.js` já entendia a Central (irmãos relativos quando a página está sob `/crm/`) — sem mudança.
