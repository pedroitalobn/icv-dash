# ---------- Imagem base ----------
FROM node:22-alpine AS base
# openssl é exigido pelos engines do Prisma no Alpine (musl).
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

# ---------- Dependências ----------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---------- Build ----------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Gera o Prisma Client e compila o Next (páginas são dinâmicas → não acessa o banco no build).
RUN npm run build

# ---------- Runner ----------
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src ./src
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.mjs ./next.config.mjs
COPY --from=build /app/tsconfig.json ./tsconfig.json

EXPOSE 3000
# Por padrão sobe a aplicação (a migration/seed é disparada pelo serviço `app` no compose).
CMD ["npm", "start"]
