FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY package-lock.json* ./

RUN npm ci --no-audit --no-fund

COPY . .

RUN npm run build

EXPOSE 5173
EXPOSE 3001

CMD ["npm", "run", "dev"]
