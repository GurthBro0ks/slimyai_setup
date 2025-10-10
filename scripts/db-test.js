require('dotenv').config();
require('../lib/database').testConnection().then(() => {
  console.log('✅ DB test ok');
  process.exit(0);
}).catch(err => {
  console.error('❌', err);
  process.exit(1);
});
