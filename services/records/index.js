const { ApolloServer } = require('@apollo/server');
const { startStandaloneServer } = require('@apollo/server/standalone');
const { buildSubgraphSchema } = require('@apollo/subgraph');
const { typeDefs } = require('./schema');
const { createResolvers } = require('./resolvers');
const { RecordsStore } = require('./store');
const { IngestionManager } = require('./ingestion');

async function startRecordsService(port = 4001) {
  const store = new RecordsStore();
  const ingestion = new IngestionManager(store);

  ingestion.seed(10500);
  ingestion.start(15000);

  const server = new ApolloServer({
    schema: buildSubgraphSchema([{ typeDefs, resolvers: createResolvers(store, ingestion) }])
  });

  const { url } = await startStandaloneServer(server, { listen: { port } });
  console.log(`[Records Subgraph] Online at ${url} (${store.records.length} records)`);
  return { server, url, store, ingestion };
}

if (require.main === module) {
  startRecordsService().catch(console.error);
}

module.exports = { startRecordsService };
