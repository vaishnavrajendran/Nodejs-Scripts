FROM node:22-alpine

WORKDIR /app

ARG DATABASE_URL
ENV DATABASE_URL=${DATABASE_URL}

COPY --chown=node:node package*.json .

RUN npm install

COPY --chown=node:node . .

RUN npx prisma generate
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "dev:docker"]


# docker network create my-mongo-network
# docker run --network=my-mongo-network --name postgres_db -e POSTGRES_PASSWORD=mysecretpassword -d -p 54321:5432 postgres
# docker run --network=my-mongo-network \-e DATABASE_URL="postgresql://postgres:mysecretpassword@postgres_db:5432/postgres" \-p 3000:3000 dc-learning