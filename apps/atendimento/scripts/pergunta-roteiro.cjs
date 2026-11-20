/* Apoio dos roteiros de navegador (rodada 10).
   As perguntas da tela deixaram de ser confirm()/prompt() do navegador e passaram para a janela do
   próprio app (#modalConfirmarBg com data-pergunta). O `p.on('dialog', …)` dos roteiros não vê mais
   nada; este apoio responde no lugar dele, DENTRO da página, e só às perguntas marcadas com
   data-pergunta (as confirmações que os roteiros já clicavam à mão continuam com eles).

     await responderPerguntas(p, { aceitar: true, texto: 'liguei para o cliente' });  // antes do goto
     await modoDasPerguntas(p, { aceitar: false });        // muda no meio do roteiro
     const lista = await perguntasFeitas(p);                // ['Título\nTexto', …]
*/
async function responderPerguntas(p, { aceitar = true, texto = null } = {}) {
  await p.evaluateOnNewDocument((aceitar, texto) => {
    window.__perguntas = [];
    window.__modoPergunta = { aceitar, texto };
    const ligar = () => {
      const bg = document.getElementById('modalConfirmarBg');
      if (!bg) return setTimeout(ligar, 50);
      let respondendo = false;
      new MutationObserver(() => {
        if (!bg.classList.contains('aberto')) { respondendo = false; return; }
        if (respondendo || !bg.dataset.pergunta) return;
        respondendo = true;
        window.__perguntas.push([document.getElementById('confirmarTitulo')?.textContent, document.getElementById('confirmarTexto')?.textContent].filter(Boolean).join('\n'));
        setTimeout(() => {
          const modo = window.__modoPergunta;
          if (!modo.aceitar) return document.getElementById('btnConfirmarNao').click();
          const campo = document.getElementById('confirmarCampo');
          if (campo && !document.getElementById('confirmarCampoRotulo').hidden) {
            campo.value = modo.texto ?? campo.dataset.exigir ?? campo.value;
            campo.dispatchEvent(new Event('input', { bubbles: true }));
          }
          document.getElementById('btnConfirmarOk').click();
        }, 20);
      }).observe(bg, { attributes: true, attributeFilter: ['class', 'data-pergunta'] });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ligar); else ligar();
  }, aceitar, texto);
}
const modoDasPerguntas = (p, modo) => p.evaluate((m) => { Object.assign(window.__modoPergunta, m); window.__perguntas.length = 0; }, modo);
const perguntasFeitas = (p) => p.evaluate(() => window.__perguntas.slice());

module.exports = { responderPerguntas, modoDasPerguntas, perguntasFeitas };
