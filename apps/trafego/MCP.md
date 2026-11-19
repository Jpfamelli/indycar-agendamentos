# MCP do IndyCar Tráfego — como ligar uma IA

Endereço (depois de publicado): **`https://indycar-agendamentos.onrender.com/trafego/mcp`**.
Servidor sem estado, "de duas eras": atende o protocolo novo (2026-07-28: `server/discover`, sem sessão) e os clientes
antigos (2025-03-26 a 2025-11-25: `initialize`) no mesmo endereço. Resposta sempre `application/json` (sem SSE).
As ferramentas, as regras e os erros são os mesmos da porta REST: ver `API-ia.md`.

## 1. Criar a chave
Ajustes › Chaves da IA (ou `POST /api/ia/chaves`, só administrador): dê um nome ("Claude Code do João"), escolha
"ler" e, se quiser que a IA deixe propostas para você aprovar, "propor". Marque "ver dado pessoal" só se a IA precisar
ler a conversa inteira dos clientes. **A chave (`ica_…`) aparece uma vez só**: guarde num gerenciador de senhas.
Uma chave por IA e por pessoa; se vazar, revogue na mesma tela (vale na hora).

Nunca ponha a chave no endereço (`?chave=` é recusado com 400). Ela vai no cabeçalho `Authorization: Bearer ica_…`.

## 2. Claude Code
```bash
claude mcp add --transport http indycar-trafego https://indycar-agendamentos.onrender.com/trafego/mcp --header "Authorization: Bearer ica_SUA_CHAVE"
```
- `--scope user` liga em todos os seus projetos; o padrão (`local`) só neste.
- Sem expor a chave no histórico do terminal: use o arquivo `.mcp.json` com variável de ambiente
  (exemplo pronto em `mcp/exemplos/claude-code.mcp.json`) e defina `INDYCAR_TRAFEGO_CHAVE` no sistema.
- Conferir: `claude mcp list` e `/mcp` dentro do Claude Code. Remover: `claude mcp remove indycar-trafego`.

## 3. Codex (linha de comando, extensão e app dividem a configuração)
Copie `mcp/exemplos/codex-config.toml` para `~/.codex/config.toml` e defina `INDYCAR_TRAFEGO_CHAVE` no terminal que abre o Codex.
Conferir: `codex mcp list` e `/mcp` na interface.

## 4. Claude Desktop (pela ponte local)
O Desktop liga servidores locais por stdio. A ponte `mcp/ponte-stdio.mjs` (Node puro, sem dependência) repassa cada mensagem
para o `/mcp` com o cabeçalho da chave.
1. Copie a pasta `mcp/` para o computador (ou use a do repositório).
2. Em Configurações › Desenvolvedor › Editar configuração, cole o bloco de `mcp/exemplos/claude-desktop.json`, troque o caminho
   da ponte e a chave, e reinicie o Desktop.
3. A ponte só aceita `https://` (ou `http://localhost` para teste) e nunca imprime a chave.
Atenção: nesse arquivo a chave fica gravada no computador. Use uma chave só de leitura, sem "ver dado pessoal".

## 5. claude.ai, celular e ChatGPT (próximo passo, ainda não feito)
Esses clientes conectam pela nuvem deles e pedem **OAuth** (o claude.ai só aceita cabeçalho fixo na seção beta
"Request headers"; o ChatGPT não tem opção documentada de cabeçalho fixo). Para ligar, falta:
1. responder 401 com `WWW-Authenticate: Bearer resource_metadata="https://indycar-agendamentos.onrender.com/.well-known/oauth-protected-resource"`;
2. publicar o documento da RFC 9728 com `resource` igual ao endereço do MCP e `authorization_servers`;
3. usar o Supabase Auth como servidor OAuth 2.1 (descoberta, registro de cliente, PKCE `S256`) e uma tela de consentimento nossa;
4. validar que o token foi emitido para este servidor e nunca repassar o token adiante.
Até lá, use Claude Code, Codex ou o Desktop pela ponte.

## 6. Como testar (roteiro de fumaça, o mesmo que roda em `tests/r8-ia-mcp.test.js`)
```bash
URL=https://indycar-agendamentos.onrender.com/trafego/mcp
META='"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}'
# sem chave: 401 com WWW-Authenticate
curl -si -X POST $URL -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | head -1
# GET: 405
curl -si $URL | head -1
# protocolo novo: discover, lista e saude
curl -s $URL -H "Authorization: Bearer $INDYCAR_TRAFEGO_CHAVE" -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2026-07-28" -H "Mcp-Method: server/discover" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"server/discover\",\"params\":{$META}}"
curl -s $URL -H "Authorization: Bearer $INDYCAR_TRAFEGO_CHAVE" -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2026-07-28" -H "Mcp-Method: tools/call" -H "Mcp-Name: saude" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"saude\",\"arguments\":{},$META}}"
# cliente antigo: initialize (sem Mcp-Session-Id na resposta)
curl -si $URL -H "Authorization: Bearer $INDYCAR_TRAFEGO_CHAVE" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"teste","version":"1"}}}'
```
Também dá para usar o MCP Inspector (`npx @modelcontextprotocol/inspector`) apontando para o endereço com o cabeçalho.

## 7. O que o servidor confere (resumo técnico)
| Chegou | Resposta |
|---|---|
| `GET` ou `DELETE` | 405 |
| `Origin` de fora da casa | 403 |
| sem chave / chave errada ou revogada | 401 + `WWW-Authenticate: Bearer …` (código -31401) |
| chave no endereço | 400 (-32600) |
| escopo que falta (`propor`, `ver_pii`) | 403 + `error="insufficient_scope", scope="…"` (-31403) |
| limite da chave (120/min, 5.000/dia) | 429 + `Retry-After` (-31429) |
| banco sem a atualização `r8_trafego_v1` | 503 (-31503) |
| JSON inválido · lote · fora do JSON-RPC | 400 (-32700 · -32600 · -32600) |
| notificação (sem `id`) | 202 sem corpo |
| pedido novo sem `_meta` ou sem `clientCapabilities` | 400 (-32602) |
| versão que não atendemos | 400 (-32022, com `supported` e `requested`) |
| `MCP-Protocol-Version`, `Mcp-Method` ou `Mcp-Name` diferente do corpo | 400 (-32020); `=?base64?…?=` é decodificado |
| método desconhecido | -32601 (404 no novo, 200 no antigo) |
| ferramenta desconhecida | -32602 (400 no novo, 200 no antigo) |
| erro de negócio ou argumento errado dentro da ferramenta | 200 com `isError: true` e a frase para a IA se corrigir |
| `tools/call` certo | 200 com `content` (resumo + JSON compacto), `structuredContent`, `isError: false`, `resultType: "complete"` |

Ferramentas de leitura vão com `annotations.readOnlyHint: true` (o ChatGPT trata como escrita o que não tem a marca).
`tools/list` mostra só o que a chave pode usar (`cacheScope: "private"`, `ttlMs: 300000`).
