# R1 Comunicar · T36

| Quem e objetivo | Caminho e resultado esperado | Verificação |
| --- | --- | --- |
| Dono, identificar pane | Abrir Início e ver alerta da chave, data e atalho | Chrome 1440/375 |
| Dono, abrir diagnóstico | Início › Saúde do WhatsApp mostra causa e quando começou | API e tela ajustadas |
| Dono, religar WhatsApp | Gerar chave e colar em Atendimento › Configurações › Integrações › Chave de API | Caminho conferido |
| Gestor, simular rodada | Prévia mostra decisões sem gravação ou envio | Suíte |
| Cliente, receber lembrete | Horário confirmado, ainda válido, sai na cadência | Suíte |
| Cliente, evitar lembrete vencido | Horário vencido, cancelado ou sem confirmação da Agenda fica bloqueado | Regressão |
| Cliente, receber pós-venda | Atendimento concluído e convite dentro da janela | Suíte |
| Cliente, receber avaliação ou revisão | Convite recente sai; expirado vira pulado | Regressão |
| Gestor, evitar rajada | Fila acumulada respeita teto de oito tentativas | Suíte |
| Gestor, revisar falha | Reenfileirar não reinicia validade | Regressão |
| Cliente, pedir PARAR | Fica fora da fila, inclusive a antiga | Suíte |

e276822 protege a fila em carteiro.js e rodada.js. 263c551 fixa limites nos geradores da Agenda/Pátio (dados.js) e a data da pane no cartão (whatsapp.js e public/rodada5.js). c89d03b relê a Agenda após a reserva.

Lembrete vence uma hora antes do horário. Pós-venda tem 72 horas, avaliação 48 horas e revisão sete dias. Considera-se o menor prazo entre a idade do registro e expira_em. Novos envios da Agenda/Pátio têm prazo ancorado no dia previsto da régua. A rodada tem até oito tentativas e preserva limites menores já configurados.

O levantamento [1.8] registrou zero mensagens novas e zero enviadas de 19/10 a 19/11, cerca de 198 batidas diárias, cinco linhas no histórico e último envio real em 13/08. [7.6] encontrou 38 concluídos e quatro mensagens de pós-venda em 30 dias. O agregado não permite contar os envios perdidos por régua desde 01/10 ou o total exato elegível na primeira rodada. O conector Supabase não estava disponível. Com o código publicado, a primeira rodada pode tentar até oito envios, com zero vencidos nos casos cobertos.

Regressões urgentes 13/15 antes e 15/15 após e276822. Suíte completa final 310/310. Capturas em qa-out/r1-1440.png e qa-out/r1-375.png. Os roteiros de navegador completos, temas e axe-core ficaram pendentes.

Para o Claude: integrar e publicar antes de trocar a chave. Conferir as contagens por tipo, data e status em posvenda_envios e cruzar com as fontes das réguas para medir o que nunca chegou à fila. Usar a prévia para medir o que sairia sem disparar. Este relatório foi salvo dentro da cópia B, conforme o escopo do João.
