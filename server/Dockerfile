FROM node:22-alpine
WORKDIR /srv
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.js cli.js db.sql ./
ENV NODE_ENV=production PORT=3000 WEB_DIR=/web
USER node
EXPOSE 3000
CMD ["node", "server.js"]
