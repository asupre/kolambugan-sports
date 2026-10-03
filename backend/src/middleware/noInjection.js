// Blocks NoSQL operator injection (Oct 2026).
//
// The attack: a JSON body sends an OBJECT where a string is expected, e.g.
//   { "username": { "$ne": null } }
// and if that value reaches a MongoDB filter, "username equals X" becomes
// "username is not empty" and matches someone else's record.
//
// No request this app sends ever uses a key that starts with "$" or contains a
// "." (field names are fixed words; custom score-sheet columns are "x_" + letters,
// numbers and "_"). So any such key, at any depth, is refused with a 400 before the
// route runs. Only KEYS are checked: values like "Sto. Niño", dates or "$100" pass.
//
// req.query and req.params need no check: Express 5's default query parser doesn't
// build nested objects from ?a[$ne]=1, and route params are always plain strings.
// Multipart uploads (multer) are parsed inside their routes; those fields are a fixed
// handful (docType, file...) that the routes already validate against fixed lists.

const MAX_DEPTH = 20;

// Returns the offending key path, or null when the value is clean.
function findBadKey(value, path = '', depth = 0) {
  if (value === null || typeof value !== 'object') return null;
  if (depth > MAX_DEPTH) return path || '(root)';
  for (const key of Object.keys(value)) {
    const here = path ? `${path}.${key}` : key;
    if (key.startsWith('$') || key.includes('.')) return here;
    const bad = findBadKey(value[key], here, depth + 1);
    if (bad) return bad;
  }
  return null;
}

function noInjection(req, res, next) {
  const bad = findBadKey(req.body);
  if (bad) {
    return res.status(400).json({ message: 'Invalid request: field names may not start with "$" or contain ".".' });
  }
  next();
}

module.exports = { noInjection, findBadKey };
