FROM node:20 AS build
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /usr/src/app/build ./build
COPY config ./config
COPY src/public ./src/public
EXPOSE 8080
CMD ["node", "build/main.js"]
