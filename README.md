# Tether

Self-hosted webhook delivery. Send one event; Tether signs it, delivers it to every subscriber, retries with backoff for a day, keeps order per key, and parks what fails so you can replay it. Postgres is the only dependency.

Status: early development.

```
docker compose up -d
cp .env.example .env
npm install
npm run db:migrate
npm run dev      # dashboard + API on :3000
npm run worker   # delivery worker
```
