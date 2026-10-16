# Origem desta pasta (IndyCar Central, 16/10/2026)

Cópia fiel do repositório **Jpfamelli/indycar-atendimento**, commit **94fbcdb** (`git archive`, só arquivos versionados:
sem node_modules, .env, bancos locais nem capturas), com finais de linha LF.

Desde a IndyCar Central este é o código que roda em produção, em
https://indycar-agendamentos.onrender.com/atendimento/ (serviço Render `srv-d8hca5i8qa3s73bhnl90`, `node central.js`
na raiz deste repositório). **Mexa aqui**, não no repositório antigo: o serviço gratuito antigo passa a só
redirecionar (308) para o endereço novo.

Ajustes feitos na cópia para morar na Central (o resto é idêntico ao commit acima):
- `public/apps.js`: sob `/atendimento/`, Agenda/CRM/Comunicar apontam para a origem atual.
- `server.js`: `/vendor/supabase.js` procura o `node_modules` mais próximo (aqui é o da raiz do repositório).
- `.claude/` (configuração local de preview) não veio.
