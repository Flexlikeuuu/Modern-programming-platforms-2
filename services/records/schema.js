const gql = require('graphql-tag');

const typeDefs = gql`
  extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key"])

  enum DataSource {
    WEATHER
    FINANCE
    INFRASTRUCTURE
    ALL
  }

  enum SortField {
    CREATED_AT
    VALUE
    TITLE
  }

  enum SortOrder {
    ASC
    DESC
  }

  type Coordinates {
    lat: Float!
    lon: Float!
  }

  type Location {
    city: String!
    country: String!
    coordinates: Coordinates!
  }

  type Record @key(fields: "id") {
    id: ID!
    source: DataSource!
    title: String!
    value: Float!
    unit: String!
    status: String!
    location: Location!
    createdAt: String!
  }

  type PageInfo {
    currentPage: Int!
    pageSize: Int!
    totalPages: Int!
    hasNextPage: Boolean!
    hasPrevPage: Boolean!
  }

  type RecordsResponse {
    items: [Record!]!
    totalCount: Int!
    pageInfo: PageInfo!
  }

  type Stats {
    total: Int!
    weather: Int!
    finance: Int!
    infra: Int!
    alerts: Int!
  }

  type Query {
    records(
      search: String
      source: DataSource
      sortField: SortField
      sortOrder: SortOrder
      page: Int
      pageSize: Int
    ): RecordsResponse!
    stats: Stats!
  }

  type Mutation {
    triggerIngest(count: Int): Int!
    deleteRecord(id: ID!): Boolean!
  }
`;

module.exports = { typeDefs };
