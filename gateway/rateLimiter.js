class RateLimiter {
  constructor({ windowMs = 60000, maxRequests = 150 } = {}) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.clients = new Map();
    setInterval(() => this.cleanup(), 30000);
  }

  middleware() {
    return (req, res, next) => {
      const url = req.originalUrl || req.url || '';
      if (!url.startsWith('/graphql')) return next();

      const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
      const now = Date.now();
      const start = now - this.windowMs;

      let timestamps = this.clients.get(ip) || [];
      timestamps = timestamps.filter(t => t > start);
      this.clients.set(ip, timestamps);

      const count = timestamps.length;
      const remaining = Math.max(0, this.maxRequests - count - 1);
      const reset = Math.ceil((start + this.windowMs - now) / 1000);

      res.setHeader('X-RateLimit-Limit', this.maxRequests);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', reset);

      if (count >= this.maxRequests) {
        return res.status(429).json({
          errors: [{ message: `Rate limit exceeded (${this.maxRequests} req / ${this.windowMs / 1000}s). Reset in ${reset}s.` }]
        });
      }

      timestamps.push(now);
      next();
    };
  }

  cleanup() {
    const start = Date.now() - this.windowMs;
    for (const [ip, ts] of this.clients.entries()) {
      const active = ts.filter(t => t > start);
      if (!active.length) this.clients.delete(ip);
      else this.clients.set(ip, active);
    }
  }
}

module.exports = { RateLimiter };
