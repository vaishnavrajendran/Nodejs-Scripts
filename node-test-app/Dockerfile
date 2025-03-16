FROM node:22-alpine

WORKDIR /app

COPY --chown=node:node package*.json .

RUN npm install

COPY --chown=node:node . .

USER node

EXPOSE 3000

CMD ["node", "index.js"]