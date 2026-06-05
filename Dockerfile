# IndyCar Agendamentos — imagem de produção (sem dependências externas)
FROM node:22-alpine

WORKDIR /app
COPY . .

# Banco em diretório separado para montar disco persistente
ENV PORT=3000
ENV DB_PATH=/app/data/indycar.sqlite
RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 3000
CMD ["node", "server.js"]
