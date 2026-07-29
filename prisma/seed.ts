import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { categoryTj, subcategoryTj, colorTj, tj } from '../src/config/translations';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database with updated models...');

  // 1. Create Default Categories & Subcategories
  const categoryData = [
    {
      name: 'Electronics',
      subcategories: [
        'Smartphones', 'Mobile Phone Accessories', 'Laptops', 'Tablets',
        'Desktop Computers', 'Monitors', 'Computer Components', 'Computer Accessories',
        'Headphones', 'Speakers', 'Smartwatches', 'Cameras', 'Camera Accessories',
        'Televisions', 'Gaming Consoles', 'Video Games', 'Drones', 'Printers & Scanners',
        'Power Banks', 'Chargers & Cables', 'Storage & USB Drives', 'Networking & Routers'
      ]
    },
    {
      name: 'Home Appliances',
      subcategories: [
        'Refrigerators', 'Washing Machines', 'Dishwashers', 'Microwaves', 'Ovens & Cooktops',
        'Vacuum Cleaners', 'Air Conditioners', 'Fans', 'Heaters', 'Water Heaters',
        'Blenders & Mixers', 'Coffee Makers', 'Kettles', 'Toasters', 'Irons',
        'Sewing Machines', 'Air Purifiers'
      ]
    },
    {
      name: 'Clothing & Fashion',
      subcategories: [
        "Men's Clothing", "Women's Clothing", "Kids' Clothing", 'T-Shirts', 'Shirts',
        'Jeans', 'Trousers', 'Dresses', 'Skirts', 'Jackets & Coats', 'Sweaters & Hoodies',
        'Activewear', 'Underwear & Lingerie', 'Socks & Hosiery', 'Sleepwear',
        'Traditional Wear', 'Suits & Formal Wear', 'Swimwear'
      ]
    },
    {
      name: 'Shoes & Footwear',
      subcategories: [
        "Men's Shoes", "Women's Shoes", "Kids' Shoes", 'Sneakers', 'Boots', 'Sandals',
        'Formal Shoes', 'Slippers', 'Sports Shoes', 'Heels'
      ]
    },
    {
      name: 'Bags & Luggage',
      subcategories: [
        'Backpacks', 'Handbags', 'Wallets', 'Suitcases', 'Travel Bags', 'Laptop Bags',
        'Duffel Bags', 'Purses & Clutches', 'School Bags'
      ]
    },
    {
      name: 'Jewelry & Watches',
      subcategories: [
        'Rings', 'Necklaces', 'Earrings', 'Bracelets', 'Watches', 'Gold Jewelry',
        'Silver Jewelry', 'Fashion Jewelry', 'Sunglasses'
      ]
    },
    {
      name: 'Beauty & Personal Care',
      subcategories: [
        'Skincare', 'Makeup', 'Fragrances', 'Hair Care', 'Nail Care', 'Bath & Body',
        "Men's Grooming", 'Beauty Tools', 'Oral Care', 'Shaving & Hair Removal'
      ]
    },
    {
      name: 'Health & Wellness',
      subcategories: [
        'Vitamins & Supplements', 'Medical Supplies', 'First Aid', 'Fitness Nutrition',
        'Massage & Relaxation', 'Personal Hygiene', 'Health Monitors', 'Mobility Aids'
      ]
    },
    {
      name: 'Home & Living',
      subcategories: [
        'Furniture', 'Kitchenware', 'Tableware & Dinnerware', 'Bedding', 'Bath & Towels',
        'Lighting', 'Home Decor', 'Curtains & Blinds', 'Rugs & Carpets',
        'Storage & Organization', 'Cleaning Supplies', 'Clocks', 'Mirrors', 'Candles & Scents'
      ]
    },
    {
      name: 'Groceries & Food',
      subcategories: [
        'Fresh Produce', 'Fruits & Vegetables', 'Meat & Poultry', 'Seafood', 'Dairy & Eggs',
        'Bakery', 'Beverages', 'Water & Juices', 'Tea & Coffee', 'Snacks', 'Sweets & Confectionery',
        'Frozen Foods', 'Canned & Packaged', 'Grains & Pasta', 'Oils & Spices', 'Nuts & Dried Fruits',
        'Honey & Jams', 'Baby Food'
      ]
    },
    {
      name: 'Baby & Kids',
      subcategories: [
        'Diapers', 'Baby Clothing', 'Baby Feeding', 'Strollers', 'Car Seats', 'Baby Toys',
        'Nursery Furniture', 'Baby Bath & Skincare', 'Baby Safety'
      ]
    },
    {
      name: 'Toys & Games',
      subcategories: [
        'Action Figures', 'Dolls', 'Building Blocks', 'Board Games', 'Puzzles',
        'Educational Toys', 'Remote Control Toys', 'Outdoor Play', 'Arts & Crafts for Kids',
        'Stuffed Animals'
      ]
    },
    {
      name: 'Sports & Outdoors',
      subcategories: [
        'Fitness Equipment', 'Gym Accessories', 'Sportswear', 'Cycling', 'Camping & Hiking',
        'Team Sports', 'Football', 'Water Sports', 'Winter Sports', 'Outdoor Gear',
        'Fishing', 'Hunting'
      ]
    },
    {
      name: 'Automotive & Motorcycle',
      subcategories: [
        'Car Accessories', 'Car Parts', 'Car Electronics', 'Tires & Wheels', 'Oils & Fluids',
        'Car Care', 'Motorcycle Parts', 'Motorcycle Accessories', 'Tools & Equipment', 'Safety & Security'
      ]
    },
    {
      name: 'Tools & Home Improvement',
      subcategories: [
        'Hand Tools', 'Power Tools', 'Building Materials', 'Plumbing', 'Electrical',
        'Paint & Supplies', 'Hardware', 'Safety Equipment', 'Doors & Windows', 'Measuring Tools'
      ]
    },
    {
      name: 'Garden & Outdoor',
      subcategories: [
        'Plants & Seeds', 'Garden Tools', 'Outdoor Furniture', 'Grills & BBQ', 'Pots & Planters',
        'Lawn Care', 'Fencing', 'Watering & Irrigation', 'Pest Control'
      ]
    },
    {
      name: 'Books & Stationery',
      subcategories: [
        'Fiction', 'Non-Fiction', "Children's Books", 'Textbooks', 'Religious Books',
        'Notebooks', 'Pens & Pencils', 'Office Supplies', 'Art Supplies', 'Calendars & Planners'
      ]
    },
    {
      name: 'Office & Business',
      subcategories: [
        'Office Furniture', 'Office Electronics', 'Printers & Ink', 'Paper Products',
        'Filing & Storage', 'Business Supplies', 'Calculators', 'Whiteboards & Presentation'
      ]
    },
    {
      name: 'Music & Instruments',
      subcategories: [
        'Guitars', 'Keyboards & Pianos', 'Drums & Percussion', 'Wind Instruments',
        'String Instruments', 'Traditional Instruments', 'DJ & Studio Equipment', 'Music Accessories'
      ]
    },
    {
      name: 'Pet Supplies',
      subcategories: [
        'Dog Supplies', 'Cat Supplies', 'Bird Supplies', 'Fish & Aquarium', 'Pet Food',
        'Pet Grooming', 'Pet Toys', 'Pet Beds & Housing'
      ]
    },
    {
      name: 'Arts & Crafts',
      subcategories: [
        'Painting Supplies', 'Drawing Supplies', 'Craft Kits', 'Sewing & Knitting',
        'Beads & Jewelry Making', 'Scrapbooking', 'Fabric & Textiles'
      ]
    },
    {
      name: 'Industrial & Scientific',
      subcategories: [
        'Lab Equipment', 'Safety Supplies', 'Industrial Tools', 'Packaging Materials',
        'Measuring Instruments', 'Cleaning & Janitorial', 'Agricultural Supplies'
      ]
    }
  ];

  console.log('Creating categories and subcategories (Tajik)...');
  for (const cat of categoryData) {
    const catName = tj(categoryTj, cat.name);
    const category = await prisma.category.upsert({
      where: { name: catName },
      update: {},
      create: { name: catName }
    });

    for (const subName of cat.subcategories) {
      const subNameTj = tj(subcategoryTj, subName);
      await prisma.subcategory.upsert({
        where: {
          name_categoryId: {
            name: subNameTj,
            categoryId: category.id
          }
        },
        update: {},
        create: {
          name: subNameTj,
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

  // 3. Create Default Colors (full palette with hex codes)
  const colors = [
    // Neutrals
    { name: 'Black', hexCode: '#000000' },
    { name: 'White', hexCode: '#FFFFFF' },
    { name: 'Grey', hexCode: '#808080' },
    { name: 'Light Grey', hexCode: '#D3D3D3' },
    { name: 'Dark Grey', hexCode: '#404040' },
    { name: 'Charcoal', hexCode: '#36454F' },
    { name: 'Silver', hexCode: '#C0C0C0' },
    // Reds & Pinks
    { name: 'Red', hexCode: '#FF0000' },
    { name: 'Dark Red', hexCode: '#8B0000' },
    { name: 'Maroon', hexCode: '#800000' },
    { name: 'Burgundy', hexCode: '#800020' },
    { name: 'Crimson', hexCode: '#DC143C' },
    { name: 'Pink', hexCode: '#FFC0CB' },
    { name: 'Hot Pink', hexCode: '#FF69B4' },
    { name: 'Rose', hexCode: '#FF007F' },
    { name: 'Coral', hexCode: '#FF7F50' },
    { name: 'Salmon', hexCode: '#FA8072' },
    // Oranges & Yellows
    { name: 'Orange', hexCode: '#FFA500' },
    { name: 'Dark Orange', hexCode: '#FF8C00' },
    { name: 'Peach', hexCode: '#FFE5B4' },
    { name: 'Gold', hexCode: '#FFD700' },
    { name: 'Yellow', hexCode: '#FFFF00' },
    { name: 'Mustard', hexCode: '#FFDB58' },
    // Browns & Earth tones
    { name: 'Brown', hexCode: '#A52A2A' },
    { name: 'Chocolate', hexCode: '#7B3F00' },
    { name: 'Tan', hexCode: '#D2B48C' },
    { name: 'Beige', hexCode: '#F5F5DC' },
    { name: 'Cream', hexCode: '#FFFDD0' },
    { name: 'Ivory', hexCode: '#FFFFF0' },
    { name: 'Khaki', hexCode: '#C3B091' },
    { name: 'Bronze', hexCode: '#CD7F32' },
    { name: 'Copper', hexCode: '#B87333' },
    { name: 'Rose Gold', hexCode: '#B76E79' },
    // Greens
    { name: 'Green', hexCode: '#008000' },
    { name: 'Dark Green', hexCode: '#006400' },
    { name: 'Light Green', hexCode: '#90EE90' },
    { name: 'Lime', hexCode: '#BFFF00' },
    { name: 'Olive', hexCode: '#808000' },
    { name: 'Mint', hexCode: '#98FF98' },
    { name: 'Emerald', hexCode: '#50C878' },
    { name: 'Teal', hexCode: '#008080' },
    // Blues
    { name: 'Blue', hexCode: '#0000FF' },
    { name: 'Navy', hexCode: '#000080' },
    { name: 'Royal Blue', hexCode: '#4169E1' },
    { name: 'Sky Blue', hexCode: '#87CEEB' },
    { name: 'Light Blue', hexCode: '#ADD8E6' },
    { name: 'Turquoise', hexCode: '#40E0D0' },
    { name: 'Cyan', hexCode: '#00FFFF' },
    // Purples
    { name: 'Purple', hexCode: '#800080' },
    { name: 'Violet', hexCode: '#EE82EE' },
    { name: 'Indigo', hexCode: '#4B0082' },
    { name: 'Lavender', hexCode: '#E6E6FA' },
    { name: 'Magenta', hexCode: '#FF00FF' },
    // Special
    { name: 'Multicolor', hexCode: null },
    { name: 'Transparent', hexCode: null }
  ];

  console.log('Creating colors (Tajik)...');
  for (const { name, hexCode } of colors) {
    const nameTj = tj(colorTj, name);
    await prisma.color.upsert({
      where: { name: nameTj },
      update: { hexCode },
      create: { name: nameTj, hexCode }
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

  // 5. Create Second Admin Account
  const admin2Email = 'saidovmuhammadsoleh75@gmail.com';
  const admin2Phone = '+992900000001';
  const admin2Password = '261010';
  const admin2Hashed = bcrypt.hashSync(admin2Password, 10);

  console.log('Creating second admin user...');
  await prisma.user.upsert({
    where: { email: admin2Email },
    update: {
      password: admin2Hashed,
      role: 'ADMIN',
      name: 'Muhammadsoleh Saidov',
    },
    create: {
      email: admin2Email,
      phone: admin2Phone,
      password: admin2Hashed,
      role: 'ADMIN',
      name: 'Muhammadsoleh Saidov',
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
