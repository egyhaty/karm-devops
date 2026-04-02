FROM node:25-alpine3.22

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV APP_VERSION=25.3.22

EXPOSE 3000

CMD ["npm", "start"]
