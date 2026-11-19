const { parse, Kind } = require('graphql');

function getDepth(node, current = 0) {
  if (!node.selectionSet?.selections) return current;
  let max = current;
  for (const sel of node.selectionSet.selections) {
    if (sel.name?.value?.startsWith('__')) continue;
    if (sel.kind === Kind.FIELD) {
      const d = getDepth(sel, current + 1);
      if (d > max) max = d;
    } else if (sel.kind === Kind.INLINE_FRAGMENT) {
      const d = getDepth(sel, current);
      if (d > max) max = d;
    }
  }
  return max;
}

function createDepthLimiter(maxDepth = 8) {
  return (req, res, next) => {
    if (req.method !== 'POST' || !req.body?.query) return next();
    try {
      const doc = parse(req.body.query);
      let depth = 0;
      for (const def of doc.definitions) {
        if (def.kind === Kind.OPERATION_DEFINITION) {
          const d = getDepth(def, 0);
          if (d > depth) depth = d;
        }
      }
      req.queryDepth = depth;
      if (depth > maxDepth) {
        return res.status(400).json({
          errors: [{ message: `Query depth limit exceeded (${depth} > ${maxDepth}).` }]
        });
      }
      next();
    } catch {
      next();
    }
  };
}

module.exports = { createDepthLimiter };
