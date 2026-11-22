const DataLoader = require('dataloader');

function createCommentLoaders(store) {
  const commentsByRecordLoader = new DataLoader(async (recordIds) => {
    return recordIds.map(id => store.getByRecordId(id, 5));
  });

  const authorByIdLoader = new DataLoader(async (authorIds) => {
    return authorIds.map(id => store.getAuthorById(id) || store.authors[0]);
  });

  return { commentsByRecordLoader, authorByIdLoader };
}

module.exports = { createCommentLoaders };
