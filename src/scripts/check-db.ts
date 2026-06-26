import { checkDbConnection, closeDbPool } from '../lib/db';

checkDbConnection()
  .then((result) => console.log('DB connection OK', result))
  .catch((error) => { console.error('DB connection failed', { message: error.message }); process.exitCode = 1; })
  .finally(() => closeDbPool());
