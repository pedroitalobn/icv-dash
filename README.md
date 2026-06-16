# icv-dash — Painel de Doações (Cruz da Vida)

Dashboard que consome a **API de cobranças do Asaas**, armazena os dados num
**PostgreSQL** e os exibe num painel protegido por login. A ingestão acontece de
duas formas complementares:

- **Cron job** (`/api/cron/sync`) — sincronização periódica (polling) de clientes,
  assinaturas e cobranças.
- **Webhook** (`/api/webhooks/asaas`) — eventos de cobrança em tempo real.

## Stack

- **Next.js 14** (App Router) + **TypeScript** — UI, API e cron num só projeto.
- **PostgreSQL** + **Prisma** — dados isolados no schema dedicado `icv_dash`.
- **Recharts** — gráficos.

## O que o painel mostra

- **Total arrecadado** por período (7d / 30d / 90d / 12m / tudo) com gráfico diário.
- **Doadores únicos** e **ticket médio**.
- **Doadores com exatamente 3 cobranças recorrentes** (assinaturas).
- **Formas de pagamento** (PIX, boleto, cartão...).
- **Lista paginada de doações/transações**.
- **Controle de usuários** (login admin + CRUD de usuários).

## Configuração

1. **Variáveis de ambiente** — copie `.env.example` para `.env` e preencha:

   | Variável | Descrição |
   |---|---|
   | `DATABASE_URL` | Conexão PostgreSQL (schema `icv_dash`). |
   | `ASAAS_API_URL` | `https://api.asaas.com/v3` (produção) ou sandbox. |
   | `ASAAS_API_KEY` | Chave de API do Asaas. |
   | `ASAAS_WEBHOOK_TOKEN` | Token do webhook (igual ao configurado no Asaas). |
   | `CRON_SECRET` | Segredo do endpoint de cron. |
   | `SYNC_LOOKBACK_DAYS` | Janela (dias) da sincronização incremental. |
   | `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Credenciais do admin inicial (seed). |
   | `AUTH_SECRET` | Segredo para assinar o cookie de sessão. |

2. **Instalar dependências**

   ```bash
   npm install
   ```

3. **Banco de dados (primeiro deploy)** — cria o schema/tabelas e o admin inicial:

   ```bash
   npm run db:deploy      # prisma migrate deploy + seed do admin
   ```

4. **Rodar em desenvolvimento**

   ```bash
   npm run dev            # http://localhost:3000
   ```

## Sincronização (cron)

- **Vercel:** o `vercel.json` já agenda o cron a cada 15 min chamando
  `/api/cron/sync`. Defina `CRON_SECRET` nas variáveis do projeto (a Vercel
  envia automaticamente o header `Authorization: Bearer <CRON_SECRET>`).
  O `buildCommand` roda `prisma migrate deploy` + seed no deploy.

- **Servidor próprio (crontab):**

  ```cron
  */15 * * * * cd /caminho/icv-dash && npm run sync
  ```

  ou chamando o endpoint:

  ```cron
  */15 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://SEU_DOMINIO/api/cron/sync
  ```

## Deploy no Dokploy (Docker Compose)

O repositório já traz `Dockerfile` e `docker-compose.yml` (serviços **app** + **cron**).

1. No Dokploy, crie um app do tipo **Compose** apontando para este repositório (branch `main`).
2. Em **Environment**, defina todas as variáveis da tabela acima.
   - ⚠️ **`DATABASE_URL`**: precisa terminar com **`?schema=icv_dash`** para o app
     viver num schema isolado. Sem isso ele cai no `public` (que já tem outras tabelas)
     e o deploy falha com `P3005 — schema is not empty`.
   - ⚠️ **`ASAAS_API_KEY`**: como a chave começa com `$`, escape como **`$$`** para o
     Compose não interpretar como variável. Ex.: `ASAAS_API_KEY=$$aact_prod_000...`
   - A criação das tabelas usa **`prisma db push`** (idempotente, sem migrations).
3. Em **Domains**, aponte o domínio para o serviço **app**, porta **3000**.
4. O serviço `app` roda `prisma migrate deploy` + seed do admin no start; o serviço
   `cron` sincroniza com o Asaas a cada 15 min.
5. Auto-deploy: a cada push no `main`, o Dokploy reconstrói e sobe automaticamente.

## Webhook do Asaas

No painel do Asaas (**Integrações > Webhooks**):

- URL: `https://SEU_DOMINIO/api/webhooks/asaas`
- Token de autenticação: o mesmo valor de `ASAAS_WEBHOOK_TOKEN`.

## Estrutura

```
prisma/
  schema.prisma            # modelos (admin_users, customers, subscriptions, payments, sync_logs)
  migrations/0001_init/    # migration inicial (schema icv_dash)
  seed.ts                  # seed do admin a partir do .env
src/
  lib/        asaas.ts, sync.ts, queries.ts, prisma.ts, auth.ts, session.ts, format.ts
  app/        page.tsx (dashboard), login/, usuarios/, api/{cron,webhooks,auth,users}
  components/ Topbar, RevenueChart, BillingChart, UsersManager, LogoutButton
  middleware.ts            # protege as rotas (sessão)
scripts/sync.ts            # sync standalone p/ crontab
```

## Segurança

- O `.env` **não** é versionado (está no `.gitignore`). Nunca commite credenciais.
- Senhas dos usuários são armazenadas com hash **scrypt**.
- Sessão via cookie httpOnly assinado por HMAC (`AUTH_SECRET`).
