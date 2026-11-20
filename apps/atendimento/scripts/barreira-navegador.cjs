function permiteRequisicao(url, origemMock) {
  const destino = new URL(url);
  return destino.origin === origemMock || destino.protocol === 'data:';
}

module.exports = { permiteRequisicao };
