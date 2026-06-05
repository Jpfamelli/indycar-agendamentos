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

### ⏰ Lembretes automáticos — aba **WHATSAPP › Configuração**
Ative "Lembretes automáticos" e defina quantas horas antes. Um agendador roda no
servidor e, **pela Cloud API**, envia o lembrete (usando o modelo "Lembrete" se
existir) para agendamentos que estão chegando, sem duplicar.

## 🔌 Principais endpoints da API

```
GET    /api/dashboard
GET    /api/agendamentos        POST /api/agendamentos
PUT    /api/agendamentos/:id    DELETE /api/agendamentos/:id
PATCH  /api/agendamentos/:id/status   { status }
GET    /api/clientes            POST /api/clientes  (PUT/DELETE /:id)
GET    /api/consultores         POST /api/consultores (PUT/DELETE /:id)
GET    /api/crm
GET    /api/followup            GET /api/historico
GET    /api/whatsapp/templates  POST (PUT/DELETE /:id)
POST   /api/whatsapp/preparar   POST /api/whatsapp/enviar
GET    /api/whatsapp/mensagens
GET/POST /api/whatsapp/webhook
```
