import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

prisma.$connect()
  .then(() => { console.log('Conexión OK'); process.exit(0); })
  .catch((e) => { console.error('Error:', e.message); process.exit(1); });
