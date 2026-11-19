const { ApolloServer } = require('@apollo/server');
const { startStandaloneServer } = require('@apollo/server/standalone');
const { buildSubgraphSchema } = require('@apollo/subgraph');
const { typeDefs } = require('./schema');
const { createResolvers } = require('./resolvers');
const { CommentsStore } = require('./store');
const { createCommentLoaders } = require('./dataLoader');

async function startCommentsService(port = 4002) {
  const store = new CommentsStore();
  const server = new ApolloServer({
    schema: buildSubgraphSchema([{ typeDefs, resolvers: createResolvers(store) }])
  });

  const { url } = await startStandaloneServer(server, {
    listen: { port },
    context: async () => ({ loaders: createCommentLoaders(store) })
  });

  console.log(`[Comments Subgraph] Online at ${url}`);
  return { server, url, store };
}

if (require.main === module) {
  startCommentsService().catch(console.error);
}

module.exports = { startCommentsService };
