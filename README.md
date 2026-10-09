# 🏁 IndyCar Agendamentos

Sistema web de gestão de agendamentos automotivos — réplica fiel do dashboard
**IndyCar Centro Automotivo**, com banco de dados e integração WhatsApp.

## ▶️ Como rodar

```bash
cd indycar-agendamentos
node server.js
```

Abra **http://localhost:3000**. Não precisa instalar nada — usa apenas módulos
nativos do Node (requer **Node 22+**). O banco `indycar.sqlite` é criado
automaticamente na primeira execução, já com dados de exemplo.

Para parar: `Ctrl+C` (encerra com gravação segura do banco).

### 🧪 Mexer na tela sem login e sem dado de cliente

```bash
npm run mock        # http://localhost:3011  ·  modo presença: http://localhost:3011/?papel=agenda
```

Sobe o `scripts/mock-server.mjs`: serve a pasta `public/` DE VERDADE (o mesmo HTML, CSS e JS que
vão para produção) e responde `/api/*` com clientes inventados, guardados na memória. Serve para
testar layout, tema claro/escuro, celular e o fluxo dos botões sem encostar no Supabase. Nunca roda
em produção — o Render sobe o `server.js`.

### 🟢 Servidor permanente (Windows) — roda sozinho
Há uma **Tarefa Agendada** chamada `IndyCarAgendamentos` que sobe o servidor
**automaticamente no logon**, reinicia se cair e roda **oculto** (sem janela),
independente de qualquer sessão. Arquivo lançador: `iniciar-servidor.vbs`.

- Iniciar agora: `Start-ScheduledTask -TaskName IndyCarAgendamentos`
- Parar: `Stop-Process -Name node -Force` (ou pelo Gerenciador de Tarefas)
- Aplicar mudança de código: parar o node e `Start-ScheduledTask` de novo
- Remover: `Unregister-ScheduledTask -TaskName IndyCarAgendamentos`

> Observação: roda enquanto o **PC estiver ligado e logado**. Para ficar no ar
> 24/7 mesmo com o PC desligado, faça o deploy em nuvem (seção abaixo).

### 📱 Conectar o WhatsApp por QR Code — aba **WHATSAPP › Conexão**
Usa o serviço nativo **`whatsapp_device_manager`** do CodeWords. A aba cria/usa um
dispositivo, mostra o **QR Code** (renova sozinho a cada ~25s) e o status
(*aguardando leitura → conectado ✅*). É só escanear com o WhatsApp do celular
(Aparelhos conectados → Conectar aparelho). Conectado o número, o atendente
**Carlos** responde e os **agendamentos entram aqui automaticamente** (importação
a cada 3 min). O botão **Não veio** dispara a notificação de ausência.

## ☁️ Colocar online (deploy)

O projeto já vem pronto para deploy (Docker + Render):

**Opção A — Render (mais simples):**
1. Suba esta pasta para um repositório no GitHub.
2. Em [render.com](https://render.com) → **New › Blueprint**, conecte o repo. O Render lê o
   [`render.yaml`](render.yaml) automaticamente.
3. Defina o segredo `WHATSAPP_VERIFY_TOKEN` no painel e clique em deploy.
4. Pronto — você recebe uma URL `https://...onrender.com`. Use-a como base do
   webhook na Meta e nas suas credenciais.

> ⚠️ Para o banco **persistir** entre deploys é preciso um disco (plano pago do
> Render — já configurado no `render.yaml` via `DB_PATH`). No plano gratuito o
> SQLite é reiniciado a cada deploy.

**Opção B — Docker (qualquer servidor):**
```bash
docker build -t indycar .
docker run -p 3000:3000 -v indycar_data:/app/data indycar
```

O servidor respeita a variável `PORT` (deploys que definem a porta funcionam sem
ajuste) e `DB_PATH` (caminho do banco no disco persistente).

## 🧩 O que está incluído

| Seção | Função |
|-------|--------|
| **INÍCIO** | Dashboard com cards (agendamentos hoje, concluídos, compareceram, clientes, consultores, não vieram, não fechou, aguardando) + Agenda de hoje + Últimos agendamentos |
| **AGENDA** | Lista de agendamentos com busca, criar/editar/excluir e ações rápidas de status |
| **CRM** | Métricas: taxa de comparecimento, conversão, concluídos, origem dos clientes, desempenho por consultor |
| **CLIENTES** | Cadastro de clientes (nome, telefone, veículo, placa, origem) |
| **WHATSAPP** | Envio de mensagens, modelos com variáveis, histórico, webhook |
| **FOLLOW-UP** | Retornos pendentes (não veio / não fechou) com badge de contagem |
| **EQUIPE** | Consultores (cor, telefone, ativo/inativo) |
| **HISTÓRICO** | Histórico completo de agendamentos |

## 💾 Banco de dados (SQLite)

Tabelas: `empresa`, `consultores`, `clientes`, `agendamentos`,
`whatsapp_templates`, `whatsapp_mensagens`. Persistência imediata em disco
(modo journal `DELETE` + `synchronous=FULL`).

## 💬 Integração WhatsApp

Tudo é configurado pela interface, na seção **WHATSAPP**, que tem 3 abas:
**Configuração**, **Modelos** e **Mensagens**. Funciona em **dois modos**:

### 1. Clique-para-conversar (`wa.me`) — funciona imediatamente, sem configurar nada
Ao enviar uma mensagem (botão WhatsApp num agendamento/cliente, ou na seção
WHATSAPP), o sistema **registra a mensagem no banco** e abre o WhatsApp Web/App
com o texto pronto. Os modelos suportam variáveis:
`{nome} {servico} {data} {hora} {veiculo} {placa}`.

### 2. WhatsApp Cloud API (Meta) — envio automático de verdade
Na aba **WHATSAPP › Configuração**:

1. Crie um app no **Meta for Developers** e ative o produto **WhatsApp**.
2. Copie o **Phone Number ID** e gere um **Access Token** permanente.
3. Cole nos campos, marque **"Enviar mensagens automaticamente pela Cloud API"** e
   clique em **Salvar**. Use **Testar conexão** para validar.
4. Configure o **Webhook** na Meta com a URL e o token mostrados na própria aba
   (assine o campo `messages`).

Com a Cloud API ativa, o botão de envio passa a **despachar a mensagem
diretamente pela API** (sem abrir o navegador), e os recibos de
**entregue/lido** chegam pelo webhook e atualizam o histórico. As credenciais
ficam salvas no banco (o Access Token é exibido mascarado).

> O webhook exige que o app esteja acessível pela internet (deploy ou um túnel
> como o ngrok). O token de verificação padrão é `indycar` (alterável na aba).

### 3. IA de atendimento — aba **WHATSAPP › IA Atendimento**
Liga uma IA que responde os clientes automaticamente no WhatsApp. Há um **seletor
de motor**:

- **Claude (API Anthropic)** — modelo **Claude Opus 4.8** por padrão. Cole sua
  chave (`sk-ant-...`), escolha o modelo e ative.
- **CodeWords (workflow)** — usa um workflow seu como cérebro. Cole a chave
  (`cwk-...`) e o **Service ID**. O app chama `POST {base}/run/{service_id}/`
  enviando `{message, history, business, customer_name, customer_phone}` e usa o
  texto retornado (campos `reply`/`text`/`response`/`output` ou string).

A IA recebe **automaticamente** o contexto do negócio (empresa + serviços
cadastrados) e mantém o histórico. Há um **simulador de chat** para testar como
cliente, e um botão para **disparar qualquer workflow do CodeWords** (avulso) com
inputs em JSON. Com a Cloud API ligada, as mensagens recebidas pelo webhook são
respondidas sozinhas.

Programaticamente, o app também expõe `POST /api/codewords/run`
(`{ service_id, inputs, in_background }`) para acionar workflows de qualquer
ponto da aplicação.

#### Setup recomendado (workflows do IndyCar)
Arquitetura: o **Carlos** (`indycar_carlos_whatsapp_*`) fica ligado **direto ao
webhook da Meta** — ele conversa no WhatsApp e salva no workflow **Banco de
Agendamentos** (`indycar_agendamentos_db_*`). O app cuida do resto:

- **Importação automática**: a cada 3 min (e no botão *Sincronizar agendamentos
  agora*) o app chama `GET /run/{db}/listar`, cria os agendamentos aqui e chama
  `POST /run/{db}/marcar_importados`. Endpoint: `POST /api/codewords/importar`.
- **Notificação de ausência**: ao marcar **Não veio**, o app dispara
  `POST /run/{noshow}/` com `{nome, telefone, veiculo, servico, hora, placa}`.

Configure na aba **WHATSAPP › IA Atendimento** (motor CodeWords): cole a chave
`cwk-...` e os 3 Service IDs. A própria aba mostra a **URL do webhook do Carlos**
para colar no painel da Meta. A "resposta automática" interna fica **desligada**
nesse modo (quem responde é o Carlos).

### ⏰ Lembretes de agendamento — são do **Comunicar**
Desde 09/10/2026 a Agenda **não manda lembrete**: quem manda é o
[Comunicar](https://indycar-posvenda.onrender.com) (ex-Pós-venda), com a régua
dele, o opt-out do cliente (`clientes.aceita_mensagens`) e a resposta gravada em
`posvenda_envios` (tipo `lembrete`). A Agenda só **mostra o selo** no cartão:
"lembrete enviado", "respondeu 👍 / 👎", "pediu p/ parar 🔕". O agendador
`verificarLembretes` e a configuração "Lembretes automáticos" foram removidos.

### 🩺 Faixa de saúde e ecossistema
- `GET /api/saude` lê `vigia_estado` (linha única mantida pelo vigia) e devolve
  `{ok, problema, desde, resumo}`. Com `problema` preenchido, a tela mostra uma
  faixa discreta no topo (ex.: `codewords-fora` = chave do CodeWords recusada,
  nenhum WhatsApp automático sai até o gestor trocá-la em Atendimento › Integrações).
- O botão **Apps** na barra lateral abre o seletor "Ecossistema IndyCar"
  (Agenda · CRM · Atendimento · Comunicar · Orçador · Site), com a Agenda marcada.

### 👤 Ficha do cliente (Clientes › ícone de editar, ou "Abrir ficha" no agendamento)
Além do cadastro: **aniversário** (`DD/MM` ou `DD/MM/AAAA`; sem ano o banco
guarda 1904 = "só dia e mês"), a chave **"Aceita mensagens automáticas"** (quando
desligada mostra quando e por quê — é o que o Comunicar lê antes de enviar),
**última visita** (último agendamento concluído) e **próxima revisão prevista**
(última visita + prazo da regra de `comunicar_regras_retorno` que casar com o
serviço; sem regra, 6 meses). No modal de agendamento, o botão **Achar** procura
o telefone pelo nome em `conversas` (WhatsApp) e `clientes` e preenche com um
clique; salvar sem telefone pede uma confirmação (sem telefone o cliente não
recebe lembrete nem pós-venda e não entra no CRM).

### 🔗 Links entre os apps (contrato do ecossistema)
**Entrada** — o Atendimento, o CRM e o Comunicar abrem a Agenda com
`https://indycar-agendamentos.onrender.com/?tel=<dígitos>` (às vezes `&cliente=<uuid>`;
`&agendamento=<uuid>` abre um horário direto). A tela tira esses parâmetros da barra
de endereço na hora (`history.replaceState`), guarda só na memória até o login e chama
`GET /api/abrir`: a ficha é achada pelo `cliente` ou pelo telefone normalizado
(`clientes.telefone_e164`, com ou sem 55). Um horário pendente → abre o agendamento;
ficha → abre a ficha (histórico + "Agendar de novo"); vários sem ficha → Agenda filtrada
pelo telefone; nada → "Novo agendamento" já com o telefone. O papel `agenda` ignora o link.

**Saída** — no cartão (ícone de conversa), no modal e na ficha:
Atendimento `?tel=<dígitos>` · CRM `?cliente=<uuid>&tel=<dígitos>` ·
Comunicar `?cliente=<uuid>&tel=<dígitos>` (`public/planejamento.js › links`).

### 🗓️ Semana (menu SEMANA ou tecla S)
Dia · Semana · Mês, com **ocupação por dia** (horários ativos ÷ vagas de recepção:
19 meias-horas × consultores ativos) e horas de serviço estimadas pela
`servicos.duracao_min` (nunca preço). **Arrastar** um horário para outro dia remarca
(mesma hora, com Desfazer); no celular/teclado, o ícone de calendário abre o
**Remarcar** com sugestões. Filtros (busca, situação, consultor, origem, sem telefone),
**relatório do período** (veio · fechou · faltou, por consultor e por origem, com taxa
de falta), imprimir e CSV. Só baixa o período na tela (`/api/agendamentos?de=&ate=`).

### ✨ Sugerir horário
`GET /api/horarios-livres?data=&consultor_id=&ignorar=` → 3 horários livres calculados
em `dados.js › horariosLivres` (função pura, testada): seg–sáb, 8h–17h (último começo;
fecha 17h30), passos de 30 min, cada horário ativo ocupa a meia hora em que começa,
capacidade = consultores ativos; no máximo 2 por dia e 90 min entre eles. Sem IA e sem
outro domínio. O modal também avisa **horário disputado** e mostra a **duração estimada**.

### 👤 Contexto do cliente (modal e ficha)
Histórico na Agenda (`/api/clientes/historico`) e **mensagens automáticas do
Comunicar com as respostas** (`/api/clientes/mensagens`, lê `posvenda_envios` e
`posvenda_respostas`), mais os links para os outros apps. O selo do lembrete no
cartão mostra o que o cliente respondeu ao passar o mouse.

### 📴 Sem internet
Desfecho marcado sem conexão vai para uma fila no aparelho (só id + situação) e é
enviado sozinho quando a internet volta (faixa laranja mostra quantos faltam).

### ⌨️ Atalhos e miudezas
`N` novo agendamento · `S` Semana · `Ctrl+K` busca em tudo (agendamentos + clientes) ·
`/` foca a busca · `Esc` fecha · o Tab fica preso dentro do modal. Ícone de impressora na "Agenda de hoje" imprime a **folha do dia**.
Telefones viram link `tel:` com botão de copiar. Hora fora de seg–sáb 8h–17h30
avisa sem bloquear.

### 🧪 Testes
```bash
npm test          # node --test: dados.js (inclui horariosLivres), regras do app.js e public/planejamento.js
npm run check     # node --check no servidor, no mock e nos JS do public/
```

## 🔌 Principais endpoints da API

```
GET    /api/versao              { versao }  (sem login: confere o deploy)
GET    /api/saude               { ok, problema, desde, resumo }  (vigia_estado)
GET    /api/abrir?tel=&cliente= ficha + agendamentos (link de entrada)
GET    /api/horarios-livres     ?data=&consultor_id=&ignorar=  → { capacidade, sugestoes[3] }
GET    /api/busca?q=            { agendamentos, clientes }
GET    /api/clientes/historico  ?cliente_id=&tel=   ·   GET /api/clientes/mensagens (Comunicar)
GET    /api/dashboard
GET    /api/agendamentos        ?data= | ?de=&ate= | ?q=      POST /api/agendamentos
PUT    /api/agendamentos/:id    DELETE /api/agendamentos/:id   (PUT com telefone novo liga o cliente_id)
PATCH  /api/agendamentos/:id/status   { status }
GET    /api/clientes            POST /api/clientes  (PUT/DELETE /:id)
GET    /api/clientes/:id/ficha  cadastro + última visita + próxima revisão
GET    /api/clientes/achar?q=   telefone pelo nome (conversas + clientes)
GET    /api/consultores         POST /api/consultores (PUT/DELETE /:id)
GET    /api/crm
GET    /api/followup            GET /api/historico
GET    /api/whatsapp/templates  POST (PUT/DELETE /:id)
POST   /api/whatsapp/preparar   POST /api/whatsapp/enviar
GET    /api/whatsapp/mensagens
GET/POST /api/whatsapp/webhook
```
