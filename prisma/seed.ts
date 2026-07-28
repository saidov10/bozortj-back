import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database with updated models...');

  // 1. Create Default Categories & Subcategories
  const categoryData = [
    {
      name: 'Electronics',
      subcategories: ['Smartphones', 'Laptops', 'Headphones', 'Smartwatches']
    },
    {
      name: 'Clothing & Fashion',
      subcategories: ['T-Shirts', 'Jeans', 'Jackets', 'Sneakers']
    },
    {
      name: 'Home & Living',
      subcategories: ['Kitchenware', 'Furniture', 'Bedding']
    },
    {
      name: 'Sports & Outdoors',
      subcategories: ['Fitness Equipment', 'Outdoor Gear', 'Sportswear']
    },
    {
      name: 'Beauty & Cosmetics',
      subcategories: ['Skincare', 'Makeup', 'Fragrances']
    }
  ];

  console.log('Creating categories and subcategories...');
  for (const cat of categoryData) {
    const category = await prisma.category.upsert({
      where: { name: cat.name },
      update: {},
      create: { name: cat.name }
    });

    for (const subName of cat.subcategories) {
      await prisma.subcategory.upsert({
        where: {
          name_categoryId: {
            name: subName,
            categoryId: category.id
          }
        },
        update: {},
        create: {
          name: subName,
          categoryId: category.id
        }
      });
    }
  }

  // 2. Create Default Brands
  const brands = [
    'Apple',
    'Samsung',
    'Nike',
    'Adidas',
    'Sony',
    'Generic'
  ];

  console.log('Creating brands...');
  for (const name of brands) {
    await prisma.brand.upsert({
      where: { name },
      update: {},
      create: { name }
    });
  }

  // 3. Create Default Colors
  const colors = [
    'Black',
    'White',
    'Red',
    'Blue',
    'Silver',
    'Grey',
    'Gold'
  ];

  console.log('Creating colors...');
  for (const name of colors) {
    await prisma.color.upsert({
      where: { name },
      update: {},
      create: { name }
    });
  }

  // 4. Create Admin Account
  const adminEmail = 'admin@ecommerce.com';
  const adminPhone = '+992000000000';
  const adminPassword = 'adminpassword';
  const hashedPassword = bcrypt.hashSync(adminPassword, 10);

  console.log('Creating admin user...');
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      password: hashedPassword,
      phone: adminPhone,
      role: 'ADMIN',
      name: 'Super Admin',
    },
    create: {
      email: adminEmail,
      phone: adminPhone,
      password: hashedPassword,
      role: 'ADMIN',
      name: 'Super Admin',
    }
  });

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
