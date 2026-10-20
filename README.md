# Parallax

An AI research engine. Give it a topic, and it gathers sources from the web and from
text you paste in, then writes an evidence-linked report: every claim cited, every
gap and contradiction flagged.

## Stack

- [TanStack Start](https://tanstack.com/start) (React 19, Vite) with a
  [Nitro](https://nitro.build) server
- [Supabase](https://supabase.com) for auth and the database
- DeepSeek for report generation (any OpenAI-compatible chat API works)
- Exa and Tavily for web retrieval (either or both; the second takes over if the first fails)
- Tailwind CSS 4 and shadcn/ui components

## Run it locally

You need Node.js 22.12 or newer.

```sh
npm install
cp .env.example .env    # then fill in the values
npm run dev             # http://localhost:3000
```

### Environment variables

| Variable | Used by | Notes |
| --- | --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | browser | Public. Inlined into the client bundle **at build time**. |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | server | Same values as above. |
| `SUPABASE_SERVICE_ROLE_KEY` | server | Secret key. Bypasses row level security. |
| `AI_API_KEY` | server | Required to generate reports. A DeepSeek key by default. |
| `AI_BASE_URL`, `AI_MODEL` | server | Optional. Default to `https://api.deepseek.com` and `deepseek-v4-pro`; point them at any OpenAI-compatible chat API. |
| `AI_FALLBACK_*`, `AI_FALLBACK_2_*`, `AI_FALLBACK_3_*` | server | Optional further AI providers (each with `_API_KEY`, `_BASE_URL`, `_MODEL`), tried in order whenever the ones before fail. |
| `EXA_API_KEY`, `TAVILY_API_KEY` | server | Web search, needed when "Search the web" is on. Set either or both; Exa is tried first. |
| `SEARCH_ORDER` | server | Optional. Which search service to try first, e.g. `tavily,exa`. |
| `WORKER_SECRET` | server | Optional. Enables `POST /api/worker` for scheduled jobs; see Background worker. |
| `RESEARCH_WORKER` | server | Optional. Set to `off` to disable the in-process retry timer. |
| `PORT` | server | Defaults to 3000. |

Only `VITE_*` variables reach the browser. Never put a secret behind that prefix.

### Database

Run [supabase/schema.sql](supabase/schema.sql) once in the Supabase SQL Editor. It
creates the `reports` table and its row level security policies.

### Sign-in

Email and password work out of the box. For "Continue with Google", enable the
Google provider under Authentication → Providers in Supabase, and add your site
URL under Authentication → URL Configuration.

## Build and deploy

```sh
npm run build
npm start               # serves .output/ on $PORT, reading .env if present
```

The build is a standalone Node server in `.output/`. That folder is all a host
needs: copy it over, set the environment variables, and run
`node .output/server/index.mjs`.

To target another platform, set `NITRO_PRESET` when building, for example
`NITRO_PRESET=vercel npm run build`. Vercel and Netlify are detected
automatically in their own CI. See the
[Nitro deployment docs](https://nitro.build/deploy) for every preset.

### Background worker

When the AI provider fails mid-run, Parallax saves the run's progress and retries
after 1, 2, 3 … up to 10 minutes. A worker drives those retries so they happen
even when the user has closed the tab.

- **Long-running server** (`npm start`, Docker, a VM): nothing to set up. The
  worker is a timer inside the server process.
- **Serverless hosts** (Vercel, Netlify, Cloudflare): code only runs during a
  request, so a timer can't survive. Set `WORKER_SECRET`, then have a scheduled
  job call `POST /api/worker` once a minute with
  `Authorization: Bearer <WORKER_SECRET>`. On Vercel, a cron entry pointing at
  `/api/worker` works with `CRON_SECRET` as is.

Without either, nothing is lost: a retry that came due runs the next time the
user opens Parallax.

A [Dockerfile](Dockerfile) is included:

```sh
docker build -t parallax \
  --build-arg VITE_SUPABASE_URL=... \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=... .
docker run -p 3000:3000 --env-file .env parallax
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build into `.output/` |
| `npm start` | Run the production build |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint and Prettier check |
| `npm test` | Vitest |

## Where things live

- `src/routes/` — pages (file-based routing)
- `src/lib/research.functions.ts` — the server function that runs a research job
- `src/lib/research.server.ts` — web search and report generation
- `src/lib/research.prompt.ts` — the system prompt that defines the report format
- `src/integrations/supabase/` — Supabase clients and the auth middleware
- `supabase/schema.sql` — database schema
# parallax
