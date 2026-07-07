FROM node:22-slim

WORKDIR /app

COPY package.json package.json
RUN npm install

COPY index.html index.html
COPY tsconfig.json tsconfig.json
COPY vite.config.ts vite.config.ts
COPY src src

EXPOSE 5173

CMD ["npm", "run", "dev"]
