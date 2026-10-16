# Origem desta pasta (IndyCar Central, 16/10/2026)

Cópia fiel do repositório **Jpfamelli/indycar-posvenda**, commit **a5ba84d** (`git archive`, só arquivos versionados:
sem node_modules, .env, bancos locais nem capturas), com finais de linha LF.

Desde a IndyCar Central este é o código que roda em produção, em
https://indycar-agendamentos.onrender.com/comunicar/ (serviço Render `srv-d8hca5i8qa3s73bhnl90`, `node central.js`
na raiz deste repositório). **Mexa aqui**, não no repositório antigo: o serviço gratuito antigo passa a só
redirecionar (308) para o endereço novo.

Ajustes feitos na cópia para morar na Central (o resto é idêntico ao commit acima):
- `public/apps.js`: sob a Central, Agenda/CRM/Atendimento/Comunicar apontam para a origem atual (`/agenda`, `/crm`…).
- `public/sw.js`: ao ativar apaga só caches `comunicar-*`.
- `.github/` não veio: o workflow do carteiro continua no repositório Jpfamelli/indycar-posvenda (lá a URL foi trocada para a Central).
