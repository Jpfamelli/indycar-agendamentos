export async function confereMock(origem, app, chamar = fetch) {
  try {
    const resposta = await chamar(origem + '/__qa/mock', {
      redirect: 'error',
      signal: AbortSignal.timeout(3000),
    });
    if (resposta.ok && (await resposta.json()).mock === app) return;
  } catch (erro) {
    throw new Error(`Inicie o mock de ${app} em ${origem}.`, { cause: erro });
  }
  throw new Error(`Inicie o mock de ${app} em ${origem}.`);
}
