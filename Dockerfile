# Waypoint One: one image with the API server and the built web app.

# 1) Build the web app in server mode (it talks to the API on the same origin).
FROM node:22-alpine AS web
WORKDIR /repo/app
COPY app/package.json app/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY app/ ./
ENV VITE_API_URL=""
RUN npm run build

# 2) The API server. It imports the app's domain rules (app/src) so the browser and the server share one reducer
#    and one planning engine, and it serves the built app from app/dist.
FROM node:22-alpine
WORKDIR /repo
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev --no-audit --no-fund
COPY server/ ./server/
COPY app/src/ ./app/src/
COPY --from=web /repo/app/dist ./app/dist
# The shared datasets used to seed the database (see README: "Datasets").
COPY data/ ./data/
ENV NODE_ENV=production PORT=8080 DATA_DIR=/repo/data STATIC_DIR=/repo/app/dist
EXPOSE 8080
WORKDIR /repo/server
# Create the tables, seed the delivery day on first start, then serve.
CMD ["sh", "-c", "npx tsx db/migrate.js && npx tsx db/seed.js --if-empty && npx tsx src/index.js"]
