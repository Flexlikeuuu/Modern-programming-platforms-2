const path = require('path');
const express = require('express');
const cors = require('cors');
const { ApolloServer, HeaderMap } = require('@apollo/server');
const { ApolloGateway, IntrospectAndCompose, RemoteGraphQLDataSource } = require('@apollo/gateway');
const { RateLimiter } = require('./rateLimiter');
const { createDepthLimiter } = require('./depthLimiter');
const { QueryCache } = require('./cache');
const { recordTrace } = require('./tracer');
const { metricsStore } = require('../services/monitoring/metrics');

class ResilientDataSource extends RemoteGraphQLDataSource {
  async willSendRequest() {
    const fault = metricsStore.getFault(this.serviceName);
    if (fault?.fail) {
      throw new Error(`[CHAOS] Subgraph "${this.serviceName}" is simulated OFFLINE.`);
    }
  }
}

async function startGateway(port = 4000) {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  const rateLimiter = new RateLimiter({ windowMs: 60000, maxRequests: 150 });
  const depthLimiter = createDepthLimiter(8);
  const cache = new QueryCache(3000);

  app.use(rateLimiter.middleware());
  app.use('/graphql', depthLimiter);

  const gateway = new ApolloGateway({
    supergraphSdl: new IntrospectAndCompose({
      subgraphs: [
        { name: 'records', url: 'http://localhost:4001/' },
        { name: 'comments', url: 'http://localhost:4002/' },
        { name: 'monitoring', url: 'http://localhost:4003/' }
      ]
    }),
    buildService({ name, url }) {
      const ds = new ResilientDataSource({ url });
      ds.serviceName = name;
      return ds;
    }
  });

  const server = new ApolloServer({ gateway, includeStacktraceInErrorResponses: false });
  await server.start();

  app.post('/graphql', async (req, res) => {
    const start = Date.now();
    const query = req.body?.query || '';
    const vars = req.body?.variables || {};
    const op = req.body?.operationName || null;
    const isMutation = query.trim().startsWith('mutation');

    if (isMutation) cache.clear();

    let cacheKey = null;
    if (!isMutation && query) {
      cacheKey = cache.key(query, vars);
      const hit = cache.get(cacheKey);
      if (hit) {
        res.setHeader('X-Cache', 'HIT');
        recordTrace({ operationName: op, query, durationMs: Date.now() - start, depth: req.queryDepth, hasErrors: false });
        return res.json(hit);
      }
    }

    const headers = new HeaderMap();
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') headers.set(k, v);
    }

    try {
      const resp = await server.executeHTTPGraphQLRequest({
        httpGraphQLRequest: {
          method: req.method,
          headers,
          search: req.url.includes('?') ? req.url.split('?')[1] : '',
          body: req.body
        },
        context: async () => ({ req, res })
      });

      for (const [k, v] of resp.headers) res.setHeader(k, v);
      res.setHeader('X-Cache', 'MISS');
      res.status(resp.status || 200);

      let text = '';
      if (resp.body.kind === 'complete') {
        text = resp.body.string;
        res.send(text);
      } else {
        for await (const chunk of resp.body.asyncIterator) {
          text += chunk;
          res.write(chunk);
        }
        res.end();
      }

      const duration = Date.now() - start;
      let parsed = null;
      try { parsed = JSON.parse(text); } catch {}
      const hasErrors = parsed?.errors?.length > 0;

      if (!isMutation && !hasErrors && cacheKey && parsed) {
        cache.set(cacheKey, parsed);
      }

      recordTrace({ operationName: op, query, durationMs: duration, depth: req.queryDepth, hasErrors });
    } catch (err) {
      res.status(500).json({ errors: [{ message: err.message }] });
    }
  });

  return new Promise((resolve, reject) => {
    const listener = app.listen(port, () => {
      console.log(`[Gateway] Online at http://localhost:${port}/ (GraphQL: http://localhost:${port}/graphql)`);
      resolve({ app, listener, server });
    });
    listener.on('error', reject);
  });
}

module.exports = { startGateway };
