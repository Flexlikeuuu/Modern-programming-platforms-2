const { ApolloServer } = require('@apollo/server');
const { startStandaloneServer } = require('@apollo/server/standalone');
const { buildSubgraphSchema } = require('@apollo/subgraph');
const { typeDefs } = require('./schema');
const { resolvers } = require('./resolvers');

async function startMonitoringService(port = 4003) {
  const server = new ApolloServer({
    schema: buildSubgraphSchema([{ typeDefs, resolvers }])
  });

  const { url } = await startStandaloneServer(server, { listen: { port } });
  console.log(`[Monitoring Subgraph] Online at ${url}`);
  return { server, url };
}

if (require.main === module) {
  startMonitoringService().catch(console.error);
}

module.exports = { startMonitoringService };
