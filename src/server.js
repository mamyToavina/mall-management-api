const dns = require('node:dns');

dns.setServers(['1.1.1.1', '8.8.8.8']);

const app = require('./app');
const connectDB = require('./config/database.js');

const PORT = process.env.PORT || 7878;

(async () => {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
})();

