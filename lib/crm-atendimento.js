// Rodada 20 (26/11/2026): CRM + Atendimento + Orçador num app só, em /crm/ ("CRM e Atendimento").
//
// O Atendimento continua montado em /atendimento/ (API, webhook, arquivos, service worker), mas a PÁGINA dele só
// existe embutida numa moldura do CRM ("/atendimento/?embutido=1"). Quem abre a página direto (link antigo da Casa,
// da Agenda, do Pátio, do Tráfego, atalho instalado, favorito) é levado para o app unificado, com o endereço antigo
// inteiro dentro de "atd": o CRM abre a aba Conversas na conversa pedida (?conversa= / ?tel=), a aba Orçador
// (?aba=orcador…) ou os Ajustes (?aba=integracoes…). O "#…" do endereço antigo segue junto sozinho (o navegador
// mantém o fragmento quando o redirecionamento não traz outro), por isso o destino não leva "#".
//
// Função pura (sem rede, sem estado) para a Central, a Central de mentira e os testes usarem a MESMA regra.

const PAGINAS = new Set(['/atendimento/', '/atendimento/index.html']);

/** Para onde vai um pedido de página do Atendimento; null quando o pedido segue para o Atendimento como sempre. */
export function destinoDoAtendimento(caminho, busca = '', metodo = 'GET') {
  if (metodo !== 'GET' && metodo !== 'HEAD') return null;
  if (!PAGINAS.has(String(caminho || ''))) return null;
  let q;
  try { q = new URLSearchParams(String(busca || '')); } catch { return null; }
  if (q.get('embutido') === '1') return null;        // a moldura do CRM
  q.delete('embutido'); q.delete('painel');
  const resto = q.toString();
  return '/crm/?aba=conversas' + (resto ? '&atd=' + encodeURIComponent(resto) : '');
}
