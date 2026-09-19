const mongoose = require('mongoose');

// Each serverless invocation reuses this module (and its connection) only
// while its container stays warm; a fresh cold start calls this again. Cache
// the connect() promise so concurrent requests hitting a cold container don't
// each kick off their own mongoose.connect() call.
let connectPromise = null;

function connectDatabase() {
  const uri = process.env.DB_LOCAL_URL;
  if (!uri) {
    console.error('[db] DB_LOCAL_URL not configured');
    return Promise.resolve();
  }
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  if (!connectPromise) {
    // Serverless can spin up many concurrent containers, each holding its own
    // pool — keep it small so they don't collectively exhaust the DB's
    // connection limit (e.g. Atlas free tier).
    connectPromise = mongoose
      .connect(uri, { maxPoolSize: 5 })
      .then(() => console.log(`[db] connected to ${uri}`))
      .catch((error) => {
        connectPromise = null;
        console.error('[db] connection error', error);
      });
  }
  return connectPromise;
}

module.exports = connectDatabase;
