const gql = require('graphql-tag');

const typeDefs = gql`
  extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key"])

  type SystemMetrics {
    uptimeSeconds: Int!
    memoryRssMb: Float!
    memoryHeapUsedMb: Float!
    nodeVersion: String!
  }

  type SubgraphStatus {
    name: String!
    port: Int!
    status: String!
    isFailing: Boolean!
  }

  type TraceSpan {
    id: ID!
    timestamp: String!
    operationName: String!
    durationMs: Float!
    queryDepth: Int!
    hasErrors: Boolean!
    snippet: String!
  }

  type Query {
    systemMetrics: SystemMetrics!
    subgraphsStatus: [SubgraphStatus!]!
    recentTraces: [TraceSpan!]!
  }

  type Mutation {
    simulateFault(subgraph: String!, fail: Boolean!): SubgraphStatus!
  }
`;

module.exports = { typeDefs };
