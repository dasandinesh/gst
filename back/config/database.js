const mongoose = require('mongoose');

// Each serverless invocation reuses this module (and its connection) only
// while its container stays warm; a fresh cold start calls this again. Cache
// the connect() promise so concurrent requests hitting a cold container don't
// each kick off their own mongoose.connect() call.
let connectPromise = null;
let lastError = null;

function connectDatabase() {
  const uri = process.env.DB_LOCAL_URL;
  if (!uri) {
    lastError = 'DB_LOCAL_URL not configured';
    console.error('[db]', lastError);
    return Promise.resolve();
  }
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  if (!connectPromise) {
    // Serverless can spin up many concurrent containers, each holding its own
    // pool — keep it small so they don't collectively exhaust the DB's
    // connection limit (e.g. Atlas free tier).
    connectPromise = mongoose
      .connect(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 7000 })
      .then(() => {
        lastError = null;
        console.log('[db] connected');
      })
      .catch((error) => {
        connectPromise = null;
        lastError = error.message;
        console.error('[db] connection error', error);
      });
  }
  return connectPromise;
}

connectDatabase.lastError = () => lastError;
module.exports = connectDatabase;
