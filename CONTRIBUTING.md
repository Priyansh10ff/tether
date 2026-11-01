# Contributing

```
npm install
cp .env.example .env            # or DATABASE_URL=pglite://./.tether-data for no Docker
npm run db:migrate
npm run dev                     # and `npm run worker` in another terminal unless WORKER_INLINE=1
npm test                        # vitest against an in-memory Postgres (PGlite)
npm run lint && npx tsc --noEmit
```

Schema changes: edit `src/db/schema.ts`, run `npm run db:generate`, commit the new file under `drizzle/`. Tests run migrations from those files, so a schema change without a migration fails the suite.

Anything that touches the claim query (`src/engine/claim.ts`) needs a test in `tests/guarantees.test.ts`. That query is where ordering, rate limiting and the breaker live, and it is easy to break one while fixing another.

Keep the README's "what breaks and what happens" section true. If you change a behaviour described there, change the paragraph in the same PR.
