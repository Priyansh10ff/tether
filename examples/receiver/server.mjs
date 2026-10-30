// A receiver you can break on purpose. Run: node examples/receiver/server.mjs
//   GET  /down   -> start answering 503
//   GET  /up     -> back to 200
//   POST /hooks  -> verifies Tether-Signature with TETHER_SECRET and logs the event
import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";

const PORT = Number(process.env.PORT ?? 4000);
const SECRET = process.env.TETHER_SECRET ?? "";
let down = false;

function verify(secret, body, ts, sig) {
  if (!ts || !sig) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(ts)) > 300) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex"), "hex");
  return sig.split(",").some((p) => {
    const [v, hex] = p.trim().split("=");
    if (v !== "v1" || !hex) return false;
    const given = Buffer.from(hex, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

createServer((req, res) => {
  if (req.method === "GET" && req.url === "/down") { down = true; res.end("receiver is now DOWN\n"); return; }
  if (req.method === "GET" && req.url === "/up") { down = false; res.end("receiver is now UP\n"); return; }
  if (req.method !== "POST" || req.url !== "/hooks") { res.statusCode = 404; res.end(); return; }

  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const attempt = req.headers["tether-attempt"];
    if (down) {
      console.log(`503  attempt ${attempt}  (receiver down)`);
      res.statusCode = 503; res.end("down"); return;
    }
    if (SECRET && !verify(SECRET, body, req.headers["tether-timestamp"], req.headers["tether-signature"])) {
      console.log(`401  attempt ${attempt}  bad signature`);
      res.statusCode = 401; res.end("bad signature"); return;
    }
    const evt = JSON.parse(body);
    console.log(`200  attempt ${attempt}  ${evt.type}  ${evt.id}`);
    res.statusCode = 200; res.end("ok");
  });
}).listen(PORT, () => console.log(`receiver on :${PORT}  (GET /down, GET /up)`));
