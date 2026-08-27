FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node . .

ENV NODE_ENV=production
ENV APP_VERSION=dev

USER 1000:1000

EXPOSE 3000

CMD ["node", "index.js"]
