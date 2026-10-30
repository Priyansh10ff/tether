import Link from "next/link";
import { LandingRuntime } from "@/components/landing-runtime";
import "./landing.css";

export const metadata = {
  title: "Tether — webhooks that always land",
  description: "Self-hosted webhook delivery. Signed payloads, retries with backoff for 24 hours, ordering per key, circuit breaker, dead-letter replay. Postgres is the only dependency.",
};

export default function LandingPage() {
  return (
    <div className="landing">
      <div className="prog" id="prog"></div>
      <header className="nav"><div className="wrap">
        <a className="logo" href="#top"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="5" cy="12" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="M7.3 11 16.7 6.8M7.3 13l9.4 4.2"/></svg>Tether</a>
        <nav id="topnav"><a href="#how">How it works</a><a href="#features">Guarantees</a><a href="#verify">Verify</a><a href="#dash">Dashboard</a><a href="#numbers">Numbers</a></nav>
        <a className="btn" href="https://github.com/Priyansh10ff/tether">GitHub</a>
        <Link className="btn pri" href="/overview">Dashboard</Link>
      </div></header>
      
      <section className="hero" id="top">
        <canvas id="gl" aria-hidden="true"></canvas>
        <div className="wrap">
          <div id="herotext">
            <span className="eyebrow"><i></i>Open source · self-hosted · Postgres only</span>
            <h1><span className="w"><span>Webhooks</span></span> <span className="w"><span style={{animationDelay:".08s"}}>that</span></span><br /><span className="w"><span style={{animationDelay:".16s"}}><em>always</em></span></span> <span className="w"><span style={{animationDelay:".24s"}}><em>land.</em></span></span></h1>
            <p className="lede">Send one event. Tether signs it, delivers it to every subscriber, <b>retries for 24 hours with backoff</b>, keeps order per customer, trips a breaker when a receiver dies, and lets you replay anything from a dashboard.</p>
            <div className="hero-ctas"><a className="btn pri" href="#how">See a delivery survive <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a><a className="btn" href="#start">docker compose up</a><span className="hint">Next.js · Postgres · one container</span></div>
          </div>
          <div className="term" id="term" aria-label="Live delivery log">
            <div className="bar"><b>tether tail</b><span>--project acme-prod</span><span className="live">● live</span></div>
            <div id="tl"></div>
          </div>
        </div>
        <div className="scrollcue">scroll<i></i></div>
      </section>
      
      {/* PINNED LIFECYCLE */}
      <section className="life" id="how">
        <div className="pin">
          <div className="head"><div className="wrap">
            <div><span className="kicker">01 — Delivery lifecycle · scroll to advance</span><h2 id="lt">Your app sends one event.</h2><p className="sub" id="ls">POST /v1/events with an idempotency key. Tether stores it once and fans it out to every endpoint subscribed to that type.</p></div>
            <div className="phase" id="phase"><i className="on"></i><i></i><i></i><i></i><i></i></div>
          </div></div>
          <div className="stage">
            <svg viewBox="0 0 1200 420" preserveAspectRatio="xMidYMin meet" aria-hidden="true">
              {/* rail */}
              <line x1="120" y1="200" x2="1080" y2="200" stroke="#dcdfdb" strokeWidth="2"></line>
              <line id="railfill" x1="120" y1="200" x2="120" y2="200" stroke="#0f1113" strokeWidth="2"></line>
              {/* attempt timeline below */}
              <g id="att"></g>
              {/* source */}
              <g transform="translate(120 200)"><rect x="-44" y="-30" width="88" height="60" rx="12" fill="#fff" stroke="#0f1113" strokeWidth="1.5"></rect><text y="5" textAnchor="middle" className="lab ink">tether</text><text y="-44" textAnchor="middle" className="tiny">WORKER 2 · CLAIMED</text></g>
              {/* dead letter shelf */}
              <g id="shelf" transform="translate(120 330)" opacity="0"><rect x="-44" y="-16" width="124" height="32" rx="8" fill="#fff" stroke="#b9bec0" strokeDasharray="4 4"></rect><text x="-32" y="4" className="tiny">DEAD-LETTER</text><rect id="parked" x="54" y="-7" width="14" height="14" rx="3" fill="#d7263d" opacity="0"></rect></g>
              {/* receiver */}
              <g transform="translate(1080 200)"><rect id="rbox" x="-56" y="-30" width="112" height="60" rx="12" fill="#fff" stroke="#0f1113" strokeWidth="1.5"></rect><text y="5" textAnchor="middle" className="lab ink">api.acme.com</text><text id="rcode" y="-44" textAnchor="middle" className="tiny">200 OK · 142 ms</text></g>
              {/* retry pill */}
              <g id="pill" transform="translate(600 120)" opacity="0"><rect x="-96" y="-22" width="192" height="44" rx="22" fill="#0f1113"></rect><text id="pillt" y="6" textAnchor="middle" fontFamily="Geist Mono,monospace" fontSize="14" fill="#fff">retry in 5 s</text></g>
              {/* packet */}
              <g id="pk" transform="translate(120 200)"><rect x="-9" y="-9" width="18" height="18" rx="4" fill="#1f3cff"></rect></g>
            </svg>
          </div>
          <div className="foot" id="lfoot">attempt 1 · in flight</div>
        </div>
      </section>
      
      <section className="s" id="features"><div className="wrap">
        <div className="sh"><div className="rv"><span className="kicker">02 — Guarantees</span><h2>The parts that are hard to get right.</h2></div>
          <p className="rv d1">Anyone can POST a JSON body. The work is in what happens when the other side is slow, down, duplicated, or compromised. These are the behaviours Tether ships with, and each one has a test you can read in the repo.</p></div>
        <div className="cards">
          <div className="card rv"><span className="tag">HMAC-SHA256</span><div className="ic"><svg viewBox="0 0 24 24"><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/><path d="M9 12l2 2 4-4"/></svg></div><h3>Signed and timestamped</h3><p>Every delivery carries a signature over timestamp and body. Receivers reject anything older than five minutes, which ends replay attacks.</p></div>
          <div className="card rv d1"><span className="tag">FIFO PER KEY</span><div className="ic"><svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h10M4 17h13"/><path d="M18 10l2 2-2 2"/></svg></div><h3>Ordered per customer</h3><p>order.created never arrives after order.paid. Deliveries that share an ordering key queue behind each other; unrelated keys stay parallel.</p></div>
          <div className="card rv d2"><span className="tag">BREAKER</span><div className="ic"><svg viewBox="0 0 24 24"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg></div><h3>Circuit breaker</h3><p>Ten consecutive 5xx and the endpoint is opened. One probe a minute, and traffic resumes the moment it answers 200. No retry budget burnt on a dead host.</p></div>
          <div className="card rv"><span className="tag">IDEMPOTENT INGEST</span><div className="ic"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12h8M12 8v8"/></svg></div><h3>Same key, one event</h3><p>Send the same event twice with the same key and the second is a no-op. Receivers get at-least-once delivery with a Tether-Id they can dedupe on.</p></div>
          <div className="card rv d1"><span className="tag">TOKEN BUCKET</span><div className="ic"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></div><h3>Per-endpoint rate limits</h3><p>A receiver that can take 20 requests a second gets 20, not a stampede after an outage. Excess waits in Postgres, not in their 429 logs.</p></div>
          <div className="card rv d2"><span className="tag">AUDIT</span><div className="ic"><svg viewBox="0 0 24 24"><path d="M4 19V5M4 19h16"/><path d="M8 15l3-4 3 2 4-6"/></svg></div><h3>Every attempt recorded</h3><p>Status code, latency, response body, which worker sent it, when the next try is due. The dashboard is a view over that table, not a separate system.</p></div>
        </div>
      </div></section>
      
      <section className="s" id="verify" style={{background:"var(--bg2)",borderBlock:"1px solid var(--line)"}}><div className="wrap">
        <div className="code2">
          <div className="rv"><span className="kicker">03 — Receiving side</span><h2>Verify in four lines.</h2>
            <p>The SDK checks the signature, the timestamp window and the body in constant time. If it throws, the request did not come from Tether. If it returns, you have a typed event.</p>
            <div className="hdrs"><div><b>Tether-Id</b><span>msg_01JB7Q4M8XKTZ</span></div><div><b>Tether-Timestamp</b><span>1761734400</span></div><div><b>Tether-Signature</b><span className="hl">v1=9f3c0a7e…d1b2e1</span></div><div><b>Tether-Attempt</b><span>4</span></div></div>
          </div>
          <pre id="code"><button className="copy" data-copy="verify">Copy</button><span className="ln"><span className="cm">// app/api/hooks/route.ts</span></span><span className="ln"><span className="kw">import</span> &#123; verify &#125; <span className="kw">from</span> <span className="st">"@tether/node"</span>;</span><span className="ln">&nbsp;</span><span className="ln"><span className="kw">export async function</span> <span className="fn">POST</span>(req: Request) &#123;</span><span className="ln">  <span className="kw">const</span> event = <span className="kw">await</span> <span className="fn">verify</span>(req, process.env.<span className="nm">TETHER_SECRET</span>);</span><span className="ln">&nbsp;</span><span className="ln">  <span className="kw">if</span> (event.type === <span className="st">"order.paid"</span>) &#123;</span><span className="ln">    <span className="kw">await</span> <span className="fn">fulfil</span>(event.data.order_id);</span><span className="ln">  &#125;</span><span className="ln">  <span className="kw">return new</span> <span className="fn">Response</span>(<span className="kw">null</span>, &#123; status: <span className="nm">200</span> &#125;);</span><span className="ln">&#125;</span></pre>
        </div>
      </div></section>
      
      <section className="s" id="dash"><div className="wrap">
        <div className="sh"><div className="rv"><span className="kicker">04 — Dashboard</span><h2>Replay from where it broke.</h2></div>
          <p className="rv d1">Filter by type, endpoint or status code. Open an event and read the full attempt timeline. Replay one delivery, or all 14 that died while your partner's API was down.</p></div>
        <div className="dash rv" id="dashcard">
          <div className="tb"><b>Tether</b><Link className="on" href="/overview">Overview</Link><Link href="/events">Events</Link><Link href="/endpoints">Endpoints</Link><Link href="/dead-letters">Dead letters · 14</Link><span className="live">● 3 workers · acme-prod</span></div>
          <div className="grid">
            <div className="m rv"><div className="k">Delivered, 24h</div><div className="v">23,904</div></div>
            <div className="m rv d1"><div className="k">Success rate</div><div className="v ok">99.41%</div></div>
            <div className="m rv d2"><div className="k">p50 latency</div><div className="v">142<span style={{fontSize:"12px",color:"var(--dim)"}}> ms</span></div></div>
            <div className="m rv d3"><div className="k">In retry</div><div className="v w">128</div></div>
            <div className="m rv d4"><div className="k">Circuit open</div><div className="v">1</div></div>
          </div>
          <div className="body">
            <div className="chart"><svg id="hist" viewBox="0 0 640 170" role="img" aria-label="Deliveries per hour"></svg></div>
            <div className="list" id="dlist"></div>
          </div>
        </div>
      </div></section>
      
      <section className="s" id="numbers" style={{paddingTop:"20px"}}><div className="wrap">
        <div className="stats">
          <div className="stat pre"><span className="v"><span>4,200<small>/s</small></span></span><div className="k">Sustained throughput</div><div className="d">one worker, one Postgres, k6 for 10 min</div></div>
          <div className="stat pre"><span className="v"><span>7</span></span><div className="k">Attempts over 24h</div><div className="d">5s · 30s · 2m · 10m · 1h · 6h · 24h</div></div>
          <div className="stat pre"><span className="v"><span>0</span></span><div className="k">Lost deliveries</div><div className="d">worker killed with SIGKILL mid-send, 1,000 runs</div></div>
          <div className="stat pre"><span className="v"><span>1</span></span><div className="k">Dependency</div><div className="d">Postgres. No Redis, no Kafka, no queue service.</div></div>
        </div>
      </div></section>
      
      <section className="final" id="start"><div className="lines"><i></i><i></i><i></i></div><div className="wrap">
        <div className="rv"><h2>Stop losing webhooks.</h2><p>Clone it, run one command, point your app at it. MIT licensed, built in the open.</p></div>
        <div className="cmd rv d1"><i>$</i><span>git clone github.com/Priyansh10ff/tether &amp;&amp; docker compose up</span><button data-copy="cmd">Copy</button></div>
      </div></section>
      
      <footer><div className="wrap"><span>Tether · MIT licence</span><span>Built by Priyansh Dugar</span><span>github.com/Priyansh10ff/tether</span></div></footer>
      <div className="toast" id="toast"></div>
      <LandingRuntime />
    </div>
  );
}
