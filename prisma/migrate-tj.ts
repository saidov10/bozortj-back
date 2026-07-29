// One-time migration: rename existing category/subcategory/color rows from
// English to Tajik in place. Product/variant relations use IDs, so renaming the
// `name` does not affect any existing data. Safe to re-run (skips on conflict).
//
// Run:  npx ts-node prisma/migrate-tj.ts   (with DATABASE_URL pointing at the DB)

import { PrismaClient } from '@prisma/client';
import { categoryTj, subcategoryTj, colorTj, tj } from '../src/config/translations';

const prisma = new PrismaClient();

interface Named { id: string; name: string; }

async function renameAll(
  label: string,
  items: Named[],
  map: Record<string, string>,
  update: (id: string, name: string) => Promise<unknown>
) {
  let renamed = 0;
  let skipped = 0;
  for (const item of items) {
    const newName = tj(map, item.name);
    if (newName === item.name) continue; // already Tajik or no translation
    try {
      await update(item.id, newName);
      renamed++;
    } catch (e: any) {
      // Unique conflict (e.g. already migrated) — leave as is
      skipped++;
    }
  }
  console.log(`${label}: renamed ${renamed}, skipped ${skipped}, total ${items.length}`);
}

async function main() {
  console.log('Renaming categories/subcategories/colors to Tajik...');

  const categories = await prisma.category.findMany();
  await renameAll('Categories', categories, categoryTj, (id, name) =>
    prisma.category.update({ where: { id }, data: { name } })
  );

  const subcategories = await prisma.subcategory.findMany();
  await renameAll('Subcategories', subcategories, subcategoryTj, (id, name) =>
    prisma.subcategory.update({ where: { id }, data: { name } })
  );

  const colors = await prisma.color.findMany();
  await renameAll('Colors', colors, colorTj, (id, name) =>
    prisma.color.update({ where: { id }, data: { name } })
  );

  console.log('Tajik rename migration done!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
