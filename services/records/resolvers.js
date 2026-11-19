function createResolvers(store, ingestion) {
  return {
    Record: {
      __resolveReference: (ref) => store.byId.get(ref.id) || null
    },

    Query: {
      records: (_, args) => store.query({
        search: args.search || '',
        source: args.source,
        sortField: args.sortField || 'CREATED_AT',
        sortOrder: args.sortOrder || 'DESC',
        page: args.page || 1,
        pageSize: args.pageSize || 20
      }),
      stats: () => store.getStats()
    },

    Mutation: {
      triggerIngest: (_, { count = 30 }) => ingestion.collect(count),
      deleteRecord: (_, { id }) => store.deleteRecord(id)
    }
  };
}

module.exports = { createResolvers };
