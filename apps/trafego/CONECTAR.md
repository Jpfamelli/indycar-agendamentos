# Como ligar a Meta e o Google ao IndyCar Tráfego

Passo a passo para o João (vai virar capítulo do manual). Conferido em 19/11/2026 com a documentação oficial
da Meta e do Google. Os nomes dos botões dessas plataformas mudam com frequência: se um nome estiver diferente,
procure o mais parecido.

**Três regras antes de começar**
1. O app **só lê** os anúncios. Ele nunca pausa, cria ou muda campanha, verba ou anúncio.
2. O que você colar fica guardado no servidor e **nunca** volta para a tela. Não mande token nem chave por
   WhatsApp ou e-mail para ninguém: cole direto no app.
3. Depois de colar, clique em **Testar**. Só clique em **Salvar** quando aparecer "Conexão funcionando".

---

## 1. Meta (Facebook e Instagram): cerca de 15 minutos

### Antes
- A oficina precisa de um **portfólio empresarial** (o antigo "Gerenciador de Negócios") com a conta de anúncios
  e a Página dentro dele, e você precisa ser **administrador** dele.
- Precisa existir um **app da Meta** ligado a esse portfólio. Se ainda não existe: entre em
  developers.facebook.com › **Meus apps** › **Criar app**, escolha o uso de anúncios (API de Marketing) e o
  portfólio da oficina. Pode dar o nome "Painel IndyCar".

### Passo a passo (acesso que não vence)
1. Abra **business.facebook.com/settings** (Configurações do negócio).
2. Na barra da esquerda, em **Usuários**, clique em **Usuários do sistema**.
3. Clique em **Adicionar**. Nome: `Painel IndyCar Tráfego`. Função: **Funcionário** (não escolha Administrador:
   para ler, funcionário basta). Clique em **Criar usuário do sistema**.
4. Com o usuário criado selecionado, clique em **Atribuir ativos** › **Contas de anúncios** › marque a conta da
   oficina › permissão **Ver desempenho** (só leitura) › **Salvar alterações**.
5. Clique em **Gerar novo token**. Escolha o app da oficina.
   - Validade: **Nunca** (se a tela perguntar).
   - Permissões: marque só **ads_read**. Não marque `ads_management` (o app não mexe em anúncio).
6. Clique em **Gerar token** e **copie** o texto que aparece (começa com `EAA`). Ele aparece **uma vez só**.
   Perdeu? Gere outro (o antigo pode ser apagado).
7. Pegue o **número da conta de anúncios**: no Gerenciador de Anúncios, menu da conta › **Configurações da conta** ›
   "ID da conta de anúncios" (só números; pode colar com ou sem `act_`).
8. No IndyCar Tráfego: **Ajustes › Conexões**, cartão **Meta (Facebook e Instagram)** › **Colar os acessos**. Cole o
   **Número da conta de anúncios** e o **Token de acesso** › **Testar** › **Salvar** (o Salvar só acende depois do teste).

O teste confere: se o token vale, se tem `ads_read`, se a conta existe e está ativa, a versão da API e até quando o
acesso vale. Se o acesso tiver data para vencer, o app avisa uma semana antes.

### Opcional, mais seguro: segredo do app
No painel do app da Meta (developers.facebook.com › seu app › **Configurações do app › Básico**), copie a
**Chave secreta do app** e peça para ela ser posta na variável `META_APP_SECRET` do servidor (no Render, não na
tela). Depois, ainda no app da Meta, em **Configurações avançadas**, ligue **Exigir prova do segredo do app**. Assim,
um token copiado não funciona fora do nosso servidor. Atenção: o segredo tem de ser do **mesmo app** que gerou o token.

### Erros mais comuns (o que aparece no app e o que fazer)
| Aparece | O que fazer |
|---|---|
| Token da Meta inválido ou vencido | Gere um token novo (passos 5 e 6) e cole. O token de exemplo salvo hoje cai aqui. |
| Token sem permissão de anúncios | No passo 5 faltou marcar `ads_read`, ou no passo 4 faltou atribuir a conta ao usuário do sistema. |
| Conta de anúncios não encontrada | Número da conta errado, ou a conta não está no mesmo portfólio do usuário do sistema. |
| A conta de anúncios não está ativa na Meta | Pagamento pendente ou conta restrita: resolva no Gerenciador de Anúncios. |
| Meta pediu para esperar | Limite de chamadas. O app tenta de novo sozinho na próxima coleta. |
| Segredo do app da Meta não confere | O `META_APP_SECRET` é de outro app. Corrija ou tire a variável. |
| A Meta recusou a versão da API | O app já tenta a versão anterior sozinho. Se continuar, avise o suporte. |

---

## 2. Google Ads: cerca de 20 minutos

**O que mudou em 2026:** desde 09/09/2026 o Google **não usa mais o "developer token"** e não exige conta
gerenciadora (MCC). Quem libera o acesso é o **projeto do Google Cloud**. Se o app pedir developer token em
algum lugar antigo, deixe em branco. O caminho que o Google recomenda para a própria conta é a **conta de serviço**.

### Passo a passo (conta de serviço)
1. Abra **console.cloud.google.com** com a conta Google da oficina e crie um projeto (nome: `IndyCar Tráfego`).
   O projeto precisa ter **faturamento ativo** (projeto no período grátis ou com faturamento suspenso pode ter o
   pedido de acesso negado). Ativar a API não gera cobrança.
2. Menu › **APIs e serviços** › **Biblioteca** › procure **Google Ads API** › **Ativar**.
3. Na página da Google Ads API, abra **Overview** (visão geral) e veja o nível de acesso. Se estiver em **Test**
   (teste), clique em **Apply for access** e peça o nível **Explorer**. Na maioria dos casos sai em minutos.
   O Explorer dá 2.880 consultas por dia em conta real; o app usa no máximo umas 150 (coleta de hora em hora e a rotina dos cliques).
4. Menu › **IAM e administrador** › **Contas de serviço** › **Criar conta de serviço**. Nome: `painel-indycar`.
   Não precisa dar papel nenhum. **Concluir**.
5. Clique na conta de serviço criada › aba **Chaves** › **Adicionar chave** › **Criar nova chave** › **JSON** ›
   **Criar**. O computador baixa um arquivo `.json`. Guarde em lugar seguro; não mande para ninguém.
   (Se aparecer "a criação de chaves está desativada pela política da organização", o projeto está dentro de uma
   organização com essa trava: crie o projeto fora dela ou peça para quem administra liberar.)
6. Copie o **e-mail da conta de serviço** (termina em `.iam.gserviceaccount.com`).
7. No **Google Ads**: **Administrador** › **Acesso e segurança** › aba **Usuários** › botão **+** › cole o e-mail
   da conta de serviço › nível **Somente leitura** › **Adicionar conta**. ("Somente e-mail" não serve.)
8. Ainda no Google Ads: **Administrador** › **Configurações da conta** › **Codificação automática**: deixe
   **ligada**. É ela que cria o código do clique (`gclid`) que o site guarda.
9. Anote o **ID do cliente**: os 10 dígitos no topo do Google Ads (`123-456-7890`).
10. No IndyCar Tráfego: **Ajustes › Conexões**, cartão **Google Ads** › **Colar os acessos**. Cole o **ID do cliente no
    Google Ads**. No campo **Conta de serviço (arquivo JSON)**, abra o arquivo `.json` no Bloco de Notas, copie **tudo** e
    cole. Se a conta fica debaixo de uma conta gerenciadora (MCC), preencha também o **ID da conta gerenciadora (se
    houver)**. **Testar** › **Salvar**.

### Caminho antigo (OAuth), que continua funcionando
Quem já colou **Client ID**, **Client Secret** e **Refresh token** não precisa trocar. Cuidados:
- se a tela de consentimento OAuth do projeto estiver em **Testing** (teste), o refresh token **vence em 7 dias**:
  publique o app (**In production**) ou troque para a conta de serviço;
- refresh token sem uso por 6 meses deixa de valer.

### Erros mais comuns
| Aparece | O que fazer |
|---|---|
| Projeto do Google Cloud ainda sem acesso às contas reais | Passo 3: peça o nível Explorer. |
| A Google Ads API não está ativada no projeto | Passo 2, no **mesmo** projeto da conta de serviço. |
| Falta liberar o acesso na conta (ou a conta gerenciadora) | Passo 7 (o e-mail da conta de serviço precisa estar na conta) ou falta o **ID da conta gerenciadora (se houver)**. |
| Chave da conta de serviço recusada | Gere uma chave nova (passo 5) e cole o arquivo inteiro no campo **Conta de serviço (arquivo JSON)**. |
| Conta do Google Ads não encontrada | ID do cliente errado (10 dígitos). |
| Autorização do Google vencida | Só no caminho antigo: refaça o refresh token ou passe para a conta de serviço. |
| Developer token do Google não é mais usado | Pode apagar o campo. |

---

## 3. Depois de ligado, o que o app faz sozinho
- **Coleta de hora em hora** (com o piloto automático ligado; senão, pela rotina /api/cron/sync) os últimos 7 dias das duas plataformas (as plataformas corrigem números de dias passados).
  Rodar duas vezes não duplica nada. O botão **Buscar os números agora** (Ajustes › Conexões, no pé) funciona uma vez a cada 2 minutos.
- A **demonstração some sozinha** na primeira coleta com dado real. Dado real nunca é apagado.
- Na Meta: conversas iniciadas, objetivo, situação (ativa, pausada) e a imagem de cada anúncio.
- No Google: campanha, grupo, anúncio, **palavras-chave e termos de busca**.
- **Contato que chegou pelo Google**: uma rotina diária (`/api/cron/cliques`) pergunta ao Google de qual campanha
  e palavra veio aquele clique (até 90 dias) e completa a origem do contato. Só preenche o que está vazio.
- Avisa uma semana antes de o acesso da Meta vencer, e mostra em Ajustes o que deu errado na última coleta.

---

## 4. Devolver as vendas à Meta e ao Google

Por que: a plataforma que sabe **quem comprou** aprende a mostrar o anúncio para gente parecida. Hoje isso se faz
à mão, em poucos minutos por semana. Nada é enviado pelo app sozinho.

### Google (arquivo, sem programação)
1. Uma vez só: Google Ads › **Metas** › **Conversões** › **Resumo** › **+ Nova ação de conversão** › **Importar** ›
   "CRMs, arquivos ou outras origens de dados" › conversões de **cliques**. Nome: `Venda na oficina` (igual ao app).
   Espere de 4 a 6 horas antes do primeiro envio.
2. Toda semana: no IndyCar Tráfego, em **Ajustes › Devolver as vendas às plataformas**, toque em **Baixar o arquivo do Google** (arquivo `vendas-google-central-….csv`). Ele traz só as vendas
   fechadas com valor cujo contato chegou com o código do clique do Google, até 90 dias.
3. Google Ads › **Ferramentas** › **Gerenciador de dados** › **Importar** › arquivo (ou Planilhas Google) › escolha o
   arquivo › confira o mapeamento das colunas: `GCLID`, `GBRAID`, `WBRAID`, `Conversion action`,
   `Conversion date and time` (já vem com o fuso `-03:00`), `Conversion value`, `Currency`, `Order ID`.
4. Pode reenviar a semana inteira: o `Order ID` (o número do contato) impede venda em dobro. Os números aparecem em
   até 3 horas; o processamento completo leva de 24 a 48 horas.
- Ainda usa a tela antiga **Metas › Conversões › Uploads**? Baixe com `?formato=legado` (aceita só `gclid`).

### Meta (no próprio WhatsApp Business, sem programação)
1. Uma vez só: no app **WhatsApp Business** do celular da oficina › **Ferramentas** › **Atividade de clientes** ›
   ligue **Permitir que a Meta receba dados de eventos**.
2. Toda vez que fechar serviço: no IndyCar Tráfego, em **Ajustes › Devolver as vendas às plataformas**, a parte
   **Meta: vendas para marcar no WhatsApp Business** mostra nome, final do
   telefone e valor de quem veio de anúncio. Abra a conversa no WhatsApp Business e ponha na lista
   **Pedido concluído** (ou **Pago**). Vale até **7 dias** depois do contato.
3. Com 10 vendas marcadas em 30 dias, a Meta libera otimizar a campanha para compras.
- **Não ligue as "listas automáticas" (eventos automáticos)**: a ajuda do WhatsApp avisa que isso desconecta os
  aparelhos ligados ao número, e pode derrubar a ligação do Atendimento.

### Próximo passo: envio automático (ainda não feito, de propósito)
| | O que precisa existir antes |
|---|---|
| **Google, Data Manager API** (`datamanager.googleapis.com/v1/events:ingest`) | Ativar a "Data Manager API" no mesmo projeto do Cloud (a conta de serviço já tem acesso à conta). Ação de conversão do tipo importar cliques. **Consentimento do cliente registrado** (o campo `adUserData` não pode ir "concedido" por padrão): o site e a primeira mensagem precisam pedir. Testar com `validateOnly: true`. Limites: 2.000 eventos por envio, 300 envios por minuto. |
| **Meta, Conversions API para mensagens** | Número na **Cloud API** do WhatsApp (ou na "coexistência", feita por parceiro da Meta), ID da conta do WhatsApp Business, conjunto de dados (dataset), token com `whatsapp_business_manage_events` e o `ctwa_clid` de cada conversa (o Atendimento precisa guardar o que chega na mensagem do anúncio). A Meta **não** elimina repetidos: o app terá uma fila com uma linha por venda. |
| **Meta, eventos offline** (plano B) | Telefone em resumo SHA-256 e consentimento. Serve para relatório, não para otimizar campanha de mensagem. |
| **LGPD (para os três)** | Aviso de privacidade no site e na primeira resposta citando Meta e Google, base legal registrada, código do clique guardado por no máximo 90 dias, e atender pedido de exclusão em todas as tabelas. |
