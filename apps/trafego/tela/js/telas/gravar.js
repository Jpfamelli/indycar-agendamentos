/* ============================================================================
   Gravar com "desfazer por 5 segundos" (usado pelo mutirão e pelo detalhe).
   A API não desfaz: então a gravação espera 5 s antes de sair (js/desfazer.js).
   Enquanto espera, a pessoa desiste e nada chega ao servidor. Passado o tempo,
   ou ao sair da tela, a gravação vai de verdade. Uma tentativa só: gravar duas
   vezes é pior que avisar.
   ============================================================================ */

import { fraseDoErro } from './estados.js';

export const chaveDaGravacao = (tipo, lead) => tipo + ':' + lead;

/**
 * tipo: 'valor' | 'motivo' | 'origem' (POST api/jornada/:lead/:tipo).
 * texto: o que aparece no aviso ("Valor de R$ 750 lançado para João S.").
 * aoConfirmar(resposta), aoDesfazer(), aoFalhar(erro): a tela ajusta o que mostra.
 */
export function gravarComDesfazer(ctx, { lead, tipo, corpo, texto, aoConfirmar, aoDesfazer, aoFalhar }) {
  const chave = chaveDaGravacao(tipo, lead);
  ctx.desfazer.adicionar({
    id: chave,
    rotulo: texto,
    executar: () => ctx.api.gravar('api/jornada/' + encodeURIComponent(lead) + '/' + tipo, corpo),
    aoConfirmar: (resposta) => {
      ctx.leitor.esquecer('api/jornada', 'api/pendencias', 'api/hoje');
      if (aoConfirmar) aoConfirmar(resposta);
    },
    aoDesfazer,
    aoFalhar: (erro) => {
      ctx.avisar('Não gravou. ' + fraseDoErro(erro), { duracao: 8000 });
      if (aoFalhar) aoFalhar(erro);
    },
  });
  ctx.avisar(texto, { acao: { rotulo: 'Desfazer', fazer: () => ctx.desfazer.desfazer(chave) }, duracao: 5000 });
  return chave;
}
