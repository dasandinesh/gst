// Vercel serverless entry point. Any file under /api becomes a function;
// this one just hands off to the existing Express app (back/app.js), which
// already does all real routing (see its app.use('/api/...') calls) and
// exports itself rather than calling .listen() — server.js is what adds the
// listen() call for local/Node-server hosting (Render, etc.), not this path.
module.exports = require('../app');
