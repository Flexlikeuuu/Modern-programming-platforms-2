const { metricsStore } = require('./metrics');

const resolvers = {
  Query: {
    systemMetrics: () => metricsStore.getSystemMetrics(),
    subgraphsStatus: () => metricsStore.getSubgraphsHealth(),
    recentTraces: () => metricsStore.getTraces()
  },

  Mutation: {
    simulateFault: (_, { subgraph, fail }) => {
      const u = metricsStore.setFault(subgraph, fail);
      return {
        name: u.name,
        port: u.port || 0,
        status: u.fail ? 'FAIL' : 'ONLINE',
        isFailing: u.fail
      };
    }
  }
};

module.exports = { resolvers };
