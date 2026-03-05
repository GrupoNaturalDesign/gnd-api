import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.role.upsert({
    where: { code: 'ADMIN' },
    create: { code: 'ADMIN', name: 'Administrador' },
    update: {},
  });
  await prisma.role.upsert({
    where: { code: 'USER' },
    create: { code: 'USER', name: 'Usuario' },
    update: {},
  });
  console.log('Roles ADMIN y USER creados/actualizados.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
