# @tether/node

Verify and send [Tether](https://github.com/Priyansh10ff/tether) webhooks. No dependencies.

## Receiving

```ts
// Next.js route handler
import { verify, TetherVerificationError } from "@tether/node";

export async function POST(req: Request) {
  try {
    const event = await verify(req, process.env.TETHER_SECRET!);
    if (event.type === "order.paid") await fulfil(event.data);
    return new Response(null, { status: 200 });
  } catch (err) {
    if (err instanceof TetherVerificationError) return new Response(err.message, { status: 401 });
    throw err;
  }
}
```

```ts
// Express: keep the raw body
import express from "express";
import { verifyNode } from "@tether/node";

app.post("/hooks", express.raw({ type: "*/*" }), (req, res) => {
  const event = verifyNode(req.body, req.headers, process.env.TETHER_SECRET!);
  res.sendStatus(200);
});
```

During secret rotation pass both: `verify(req, [newSecret, oldSecret])`.

Tether retries until you answer 2xx, so return quickly and do slow work after responding. Receivers may see the same delivery twice; `event.delivery_id` is stable across retries and is the key to dedupe on.

## Sending

```ts
import { Tether } from "@tether/node";

const tether = new Tether({ apiKey: process.env.TETHER_API_KEY!, baseUrl: "https://tether.internal" });

await tether.send("order.paid", { order_id: "ord_7f21a", amount: 249900 }, {
  idempotencyKey: "ord_7f21a:paid",
  orderingKey: "cust_48213",
});
```
