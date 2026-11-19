# R1 Atendimento · T36

| Quem e objetivo | Caminho e resultado esperado | Verificação |
| --- | --- | --- |
| Dono, identificar pane | Abrir Atendimento e ler faixa com ação para a chave recusada | Chrome 1440/375 |
| Administrador, trocar chave | Abrir Configurações › Integrações › Chave de API | Atalho no mock |
| Atendente, identificar origem | Abrir Camila e ler Anúncio, Meta e campanha | Chrome, mock |
| Atendente, ver origem desconhecida | Abrir conversa sem lead de origem e ler “Não sei de onde veio” | Caminho implementado |
| Atendente, trocar de conversa | Abrir duas conversas rapidamente e manter o resultado da última | Guarda pelo ID |
| Atendente, ver tentativa incerta | Abrir histórico e conferir no WhatsApp antes de reenviar | Chrome 375 |
| IA, responder | Processar mensagem recente e registrar confirmação | Suíte |
| IA, receber recusa | A tentativa no histórico informa falha e conta zero envios | Regressão |
| IA, drenar pendências | Pular pendências velhas, preservar erros | Regressão |
| Consultor, aprovar sugestão | Abrir aviso, revisar proposta e aprovar | Suíte |

O commit 9bed548 altera lib/ia-copiloto.js, lib/ia-funil.js e o cabeçalho do Atendimento. Tentativas sem confirmação ficam no histórico e saem da contagem de envios. O funil evita uma segunda mensagem de encaminhamento após uma tentativa. Fila pendente vence em 12 horas, inclusive para itens travados que voltem a pendente. Os 1.210 itens em erro do levantamento [7.9] ficam no histórico.

O cabeçalho usa o lead rastreado mais recente para o telefone normalizado. O levantamento [7.10] encontrou 259 de 440 conversas recentes sem lead pelo telefone. Propostas da IA passam a gerar até um aviso por conversa e hora. Para a frente Casa, [7.8] encontrou 3.666 de 3.726 avisos não lidos, última leitura em 22/10. Falta atribuir o total por app e tipo.

Suíte final 406/406. Capturas em qa-out/r1-1440.png e qa-out/r1-375.png. O conector Supabase não estava disponível. Os roteiros de navegador completos, temas e axe-core ficaram pendentes.

Para o Claude: integrar o ramo B, rodar a suíte integrada, conferir a origem com acesso real e publicar. Este relatório foi salvo dentro da cópia B, conforme o escopo do João.
