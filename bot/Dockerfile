FROM node:20-slim
WORKDIR /app
RUN mkdir -p /data
COPY package*.json ./
RUN npm install
COPY . .
CMD ["node", "index.js"]
