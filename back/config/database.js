const mongoose = require('mongoose');

function connectDatabase() {
  const uri = process.env.DB_LOCAL_URL;
  if (!uri) {
    console.error('[db] DB_LOCAL_URL not configured');
    return;
  }
  mongoose
    .connect(uri, {
      maxPoolSize: 20,
    })
    .then(() => {
      console.log(`[db] connected to ${uri}`);
    })
    .catch((error) => {
      console.error('[db] connection error', error);
    });
}

module.exports = connectDatabase;
