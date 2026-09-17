FROM node:24-alpine AS base
WORKDIR /app
ENV ASTRO_TELEMETRY_DISABLED=1
RUN apk add --no-cache font-dejavu

FROM base AS development
COPY package.json package-lock.json ./
RUN npm ci && chown -R node:node /app/node_modules
COPY --chown=node:node . .
RUN mkdir -p /app/.data && chown node:node /app /app/.data
USER node
EXPOSE 4321
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--ignore-lock"]

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM base AS runtime-dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM base AS production
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321
COPY --from=runtime-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json
RUN mkdir -p /app/.data && chown node:node /app/.data
USER node
EXPOSE 4321
CMD ["node", "./dist/server/entry.mjs"]
