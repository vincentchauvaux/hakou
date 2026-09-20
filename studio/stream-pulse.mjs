/**
 * Pouls audio du live — le studio publie bass/mid/high/peak,
 * les spectateurs hakou.be animent les plexus même si Web Audio local est muet (iPad).
 */

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function attachStreamPulse(app, { requireSession, getClientIp, checkRateLimit }) {
  let pulse = { bass: 0, mid: 0, high: 0, peak: 0, t: 0 };
  let lastPostAt = 0;

  app.post("/api/studio/pulse", (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    const ip = getClientIp(req);
    if (
      checkRateLimit &&
      !checkRateLimit(ip, { max: 30, windowMs: 1000, key: "pulse-post" })
    ) {
      res.status(429).json({ error: "slow down" });
      return;
    }
    const now = Date.now();
    if (now - lastPostAt < 40) {
      res.status(204).end();
      return;
    }
    lastPostAt = now;
    pulse = {
      bass: clamp01(req.body?.bass),
      mid: clamp01(req.body?.mid),
      high: clamp01(req.body?.high),
      peak: clamp01(req.body?.peak),
      t: now,
    };
    res.status(204).end();
  });

  app.get("/api/stream/pulse", (req, res) => {
    if (checkRateLimit) {
      const ip = getClientIp(req);
      if (!checkRateLimit(ip, { max: 20, windowMs: 1000, key: "pulse-get" })) {
        res.status(429).json({ error: "slow down" });
        return;
      }
    }
    res.setHeader("Cache-Control", "no-store");
    res.json(pulse);
  });
}
