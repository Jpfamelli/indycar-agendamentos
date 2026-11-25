// Relógio de mentira para o QA: desloca o Date do processo (servidor de MENTIRA) em QA_DESLOCA_MS milissegundos.
// Uso: NODE_OPTIONS="--import file:///.../scripts/qa-relogio.mjs" QA_DESLOCA_MS=-18000000 node scripts/mock-server.mjs
// Só existe para as fotos e medidas não dependerem da hora em que o roteiro roda. Nunca é carregado em produção.
const desloca = Number(process.env.QA_DESLOCA_MS || 0);
if (desloca) {
  const Real = Date;
  class Falso extends Real {
    constructor(...a) { if (a.length) super(...a); else super(Real.now() + desloca); }
    static now() { return Real.now() + desloca; }
  }
  globalThis.Date = Falso;
}
