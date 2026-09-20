const mongoose = require('mongoose');
const { EJSON } = require('bson');

const SYSTEM_PREFIX = 'system.';
// Auth/tenancy tables are never part of a business's backup — they aren't
// scoped by businessId, and restoring them from a backup file could corrupt
// every business's logins, not just this one's data.
const EXCLUDED_COLLECTIONS = new Set(['users', 'businesses', 'memberships', 'counters']);

// Application backup — every business-owned collection, filtered to the logged-in
// user's own business, dumped as Extended JSON (EJSON) so ObjectId/Date/etc.
// round-trip exactly through a download + later restore, instead of degrading
// into plain strings via JSON.stringify.
exports.downloadBackup = async (req, res) => {
  try {
    const db = mongoose.connection.db;
    if (!db) return res.status(503).json({ error: 'Database is not connected.' });

    const businessId = new mongoose.Types.ObjectId(req.auth.businessId);
    const collectionInfos = await db.listCollections().toArray();
    const dump = {};
    for (const { name } of collectionInfos) {
      if (name.startsWith(SYSTEM_PREFIX) || EXCLUDED_COLLECTIONS.has(name)) continue;
      dump[name] = await db.collection(name).find({ businessId }).toArray();
    }

    const payload = {
      app: 'market-backup',
      version: 1,
      businessId: req.auth.businessId,
      exportedAt: new Date().toISOString(),
      collections: dump,
    };

    const filename = `market-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(EJSON.stringify(payload, { relaxed: false }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Restore — replaces this business's documents in every collection named in the
// backup file with that file's documents for this business (deleteMany + insertMany,
// both scoped to businessId). Other businesses' data in the same collections, and
// collections not mentioned in the backup, are left untouched. Destructive for this
// business's data in the collections it does touch; the frontend confirms with the
// user before calling this.
//
// Body must be the RAW EJSON text (route uses express.text(), not express.json()) so
// $oid / $date markers survive as real ObjectId / Date instances on insert.
exports.restoreBackup = async (req, res) => {
  try {
    const db = mongoose.connection.db;
    if (!db) return res.status(503).json({ error: 'Database is not connected.' });

    if (typeof req.body !== 'string' || !req.body.trim()) {
      return res.status(400).json({ error: 'No backup file content received.' });
    }

    let payload;
    try {
      payload = EJSON.parse(req.body, { relaxed: false });
    } catch {
      return res.status(400).json({ error: 'That file is not valid backup JSON.' });
    }

    const collections = payload && payload.collections;
    if (!collections || typeof collections !== 'object' || !Object.keys(collections).length) {
      return res.status(400).json({ error: 'This backup file has no collections to restore.' });
    }

    const businessId = new mongoose.Types.ObjectId(req.auth.businessId);
    const summary = [];
    for (const [name, docs] of Object.entries(collections)) {
      if (!Array.isArray(docs) || EXCLUDED_COLLECTIONS.has(name)) continue;
      // Only this business's own docs from the file get restored, and every
      // restored doc is force-stamped with the current business — a backup
      // file can never be used to write into, or borrow data from, another business.
      const ownDocs = docs
        .filter((doc) => doc && doc.businessId && String(doc.businessId.$oid || doc.businessId) === req.auth.businessId)
        .map((doc) => ({ ...doc, businessId }));
      const collection = db.collection(name);
      await collection.deleteMany({ businessId });
      if (ownDocs.length) await collection.insertMany(ownDocs, { ordered: false });
      summary.push({ collection: name, restored: ownDocs.length });
    }

    res.json({ message: 'Restore complete.', summary });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
