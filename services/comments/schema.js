const gql = require('graphql-tag');

const typeDefs = gql`
  extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@external"])

  type Badge {
    title: String!
    level: Int!
  }

  type Author {
    id: ID!
    username: String!
    badge: Badge!
  }

  type Comment {
    id: ID!
    recordId: ID!
    content: String!
    author: Author!
    record: Record
    createdAt: String!
  }

  extend type Record @key(fields: "id") {
    id: ID! @external
    comments(limit: Int = 3): [Comment!]
  }

  input AddCommentInput {
    recordId: ID!
    username: String!
    content: String!
  }

  type Mutation {
    addComment(input: AddCommentInput!): Comment!
  }
`;

module.exports = { typeDefs };
