FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci   # ci = clean install, faster and more reliable than npm install in Docker

COPY . .

EXPOSE 3000
CMD ["npm", "run", "dev"]
