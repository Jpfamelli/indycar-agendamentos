# IndyCar Agendamentos — imagem de produção (sem dependências externas)
FROM node:22-alpine

WORKDIR /app
COPY . .

# Os dados ficam no Supabase (PostgREST) — não há mais arquivo de banco local,
# portanto não é preciso volume nem disco persistente.
# Passe SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY como variáveis de ambiente
# (docker run -e ...). NUNCA copie o .env com a chave para dentro da imagem.
ENV PORT=3000

EXPOSE 3000
CMD ["node", "server.js"]
