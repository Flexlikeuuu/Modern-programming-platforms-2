function createResolvers(store) {
  return {
    Comment: {
      author: (comment, _, context) => {
        if (context?.loaders?.authorByIdLoader) {
          return context.loaders.authorByIdLoader.load(comment.authorId);
        }
        return store.authors.find(a => a.id === comment.authorId) || store.authors[0];
      }
    },

    Record: {
      comments: (record, _, context) => {
        if (context?.loaders?.commentsByRecordLoader) {
          return context.loaders.commentsByRecordLoader.load(record.id);
        }
        return store.getByRecordId(record.id, 3);
      }
    },

    Mutation: {
      addComment: (_, { input }) => store.addComment(input)
    }
  };
}

module.exports = { createResolvers };
