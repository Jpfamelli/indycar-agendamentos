/* ============================================================================
   Textos das telas que chegam na próxima versão (Campanhas, Gestor IA, Ajustes).
   Só dados: a montagem está em telas/espera.js. Ficam aqui para o teste
   conferir o vocabulário (sem sigla, sem travessão, sem "lead").
   `frase`: pedaços do título; `destaque: true` sai em vermelho itálico.
   ============================================================================ */

export const ESPERAS = {
  campanhas: {
    chapeu: 'Campanhas · chega na próxima versão',
    frase: [{ texto: 'Qual anúncio traz ' }, { texto: 'serviço fechado', destaque: true }, { texto: ' e qual só gasta.' }],
    apoio: 'Aqui as campanhas vão aparecer em ordem, da que mais trouxe serviço fechado para a que menos, com a distância de cada uma para a primeira.',
    tituloPerguntas: 'O que esta tela vai responder',
    perguntas: [
      { pergunta: 'Qual campanha traz contato mais barato', como: 'Custo por contato de cada campanha, contando só quem chegou de verdade no WhatsApp ou no site.' },
      { pergunta: 'Quanto cada uma virou na oficina', como: 'Serviços fechados e faturado por campanha, com o retorno de cada R$ 1.' },
      { pergunta: 'Em que dia e hora os contatos chegam', como: 'O mapa da semana, para saber quando vale ter alguém respondendo rápido.' },
      { pergunta: 'O que a plataforma diz e o que a oficina viu', como: 'As conversas que a Meta e o Google contam, lado a lado com os contatos que chegaram aqui.' },
    ],
    extra: null,
    atalhos: [
      { rotulo: 'Ver os contatos de anúncio', porque: 'Na Jornada, filtrados: de qual anúncio veio cada um e até onde chegou.', tela: 'jornada', params: { paga: '1' } },
      { rotulo: 'Dizer de onde vieram', porque: 'Cada contato sem origem que você marca entra na conta da campanha certa.', tela: 'jornada', params: { pendencia: 'sem_origem' } },
    ],
  },
  gestor: {
    chapeu: 'Gestor IA · chega na próxima versão',
    frase: [{ texto: 'Pergunte. A resposta vem ' }, { texto: 'com os números da oficina', destaque: true }, { texto: '.' }],
    apoio: 'O gestor lê os anúncios, a Jornada e a Agenda e responde curto. Quando sugerir mudar um anúncio, ele propõe e você aprova: nada muda sem o seu sim.',
    tituloPerguntas: 'Perguntas que ele vai responder',
    perguntas: [
      { pergunta: 'Onde coloco mais R$ 300 esta semana?', como: 'Olha qual campanha fecha mais serviço e se a agenda tem vaga para receber.' },
      { pergunta: 'Por que o custo por contato subiu?', como: 'Compara com a semana anterior e aponta o anúncio que puxou para cima.' },
      { pergunta: 'Qual anúncio eu devo pausar?', como: 'Mostra o que gasta e não traz contato que vira serviço.' },
      { pergunta: 'Quem está esperando resposta agora?', como: 'Lista os contatos parados e o que cada um pediu.' },
    ],
    extra: { selo: 'Próxima versão', texto: 'A ligação com a IA entra junto com esta tela.' },
    atalhos: [
      { rotulo: 'Ver o que fazer agora', porque: 'A tela Hoje já lista o mais importante, em ordem.', tela: 'hoje' },
      { rotulo: 'Lançar valores dos serviços fechados', porque: 'Com o valor de cada serviço, o gestor consegue dizer o retorno de cada anúncio.', tela: 'jornada', params: { pendencia: 'sem_valor' } },
    ],
  },
  ajustes: {
    chapeu: 'Ajustes · a tela nova chega na próxima versão',
    frase: [{ texto: 'Ajustes' }],
    apoio: 'Aqui vão morar as conexões, as frases que dizem de onde veio cada contato, o link pronto para anúncio, o rastreio do site, a meta do mês e os relatórios no WhatsApp. Enquanto isso, tudo continua na tela antiga do Tráfego.',
    tituloPerguntas: 'O que vai ficar aqui',
    perguntas: [
      { pergunta: 'De onde vêm os contatos', como: 'As frases de cada anúncio, o link pronto para a bio e para o cartaz, e o teste de uma mensagem.' },
      { pergunta: 'Conexões', como: 'Meta, Google, rastreio do site e WhatsApp, com o passo a passo do que falta.' },
      { pergunta: 'Meta e orçamento do mês', como: 'Quanto pretende gastar e quantos contatos espera, para a tela Hoje mostrar o ritmo.' },
      { pergunta: 'Relatórios', como: 'O resumo do dia, da semana e do mês, pronto para mandar no WhatsApp.' },
    ],
    extra: null,
    atalhos: [
      { rotulo: 'Abrir a tela antiga do Tráfego', porque: 'Conexões, metas e relatórios continuam funcionando lá, com o mesmo login.', caminho: 'antiga/' },
      { rotulo: 'Voltar para Hoje', porque: 'O resumo do período e o que fazer agora.', tela: 'hoje' },
    ],
  },
};
