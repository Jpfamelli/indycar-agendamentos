/* ============================================================================
   Desfazer por alguns segundos (lógica pura, testada em tests/tela-desfazer.test.mjs).
   A API não tem "desfazer": então a gravação espera 5 segundos antes de sair.
   Enquanto espera, a pessoa pode desistir e nada chega ao servidor. Passado o
   tempo (ou ao sair da tela), a gravação vai de verdade.
   Os relógios são trocáveis para o teste não depender de tempo real.
   ============================================================================ */

export const ESPERA_PADRAO = 5000;

export function criarDesfazer({ espera = ESPERA_PADRAO, agendar = (fn, ms) => setTimeout(fn, ms), cancelar = (t) => clearTimeout(t), aoMudar = () => {} } = {}) {
  const fila = new Map();   // id → { id, rotulo, executar, aoConfirmar, aoDesfazer, aoFalhar, relogio }

  const pendentes = () => [...fila.values()].map(({ id, rotulo }) => ({ id, rotulo }));
  const ultimo = () => { const todos = pendentes(); return todos.length ? todos[todos.length - 1] : null; };

  /** Tira da fila e manda de verdade. Devolve true se gravou, false se falhou ou não existia. */
  async function confirmar(id) {
    const item = fila.get(id);
    if (!item) return false;
    fila.delete(id);
    cancelar(item.relogio);
    aoMudar(pendentes());
    try {
      const resposta = await item.executar();
      if (item.aoConfirmar) item.aoConfirmar(resposta);
      return true;
    } catch (erro) {
      if (item.aoFalhar) item.aoFalhar(erro);
      return false;
    }
  }

  /**
   * Agenda uma gravação. `executar` só roda depois da espera.
   * Um segundo pedido com o mesmo id substitui o primeiro (que nunca chegou a sair).
   */
  function adicionar({ id, rotulo, executar, aoConfirmar, aoDesfazer, aoFalhar }) {
    const anterior = fila.get(id);
    if (anterior) { cancelar(anterior.relogio); fila.delete(id); }
    const item = { id, rotulo, executar, aoConfirmar, aoDesfazer, aoFalhar, relogio: null };
    item.relogio = agendar(() => { confirmar(id); }, espera);
    fila.set(id, item);
    aoMudar(pendentes());
    return id;
  }

  /** A pessoa desistiu: nada vai para o servidor. Devolve true se havia o que desfazer. */
  function desfazer(id) {
    const item = fila.get(id);
    if (!item) return false;
    cancelar(item.relogio);
    fila.delete(id);
    if (item.aoDesfazer) item.aoDesfazer();
    aoMudar(pendentes());
    return true;
  }

  /** Manda tudo que está esperando (ao trocar de tela ou fechar a página). */
  function confirmarTudo() {
    return Promise.all([...fila.keys()].map((id) => confirmar(id)));
  }

  return { adicionar, desfazer, confirmar, confirmarTudo, pendentes, ultimo, tem: (id) => fila.has(id) };
}
