import { PrismaClient } from './prisma.client';

const prisma = new PrismaClient();

async function main() {
  // Create a demo tenant (idempotent)
  let tenant = await prisma.tenant.findFirst({
    where: { slug: 'green-tea-house' },
  });

  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        name: 'Green Tea House',
        slug: 'green-tea-house',
        currency: 'MMK',
        status: 'ACTIVE',
      },
    });
  }

  // Create a demo user (idempotent)
  let user = await prisma.user.findFirst({
    where: { email: 'owner@greenteahouse.com' },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: 'owner@greenteahouse.com',
        phone: '+95940123456',
        name: 'Aung Win',
        status: 'ACTIVE',
        passwordHash: '$2a$10$1234567890abcdefghijklmnopqrstuvwxyz',
      },
    });
  }

  // Create membership linking user as OWNER of the tenant (idempotent)
  let membership = await prisma.membership.findFirst({
    where: {
      tenantId: tenant.id,
      userId: user.id,
    },
  });

  if (!membership) {
    membership = await prisma.membership.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        role: 'OWNER',
        status: 'ACTIVE',
      },
    });
  }

  // Create menu categories (idempotent)
  let beverages = await prisma.menuCategory.findFirst({
    where: {
      tenantId: tenant.id,
      name: 'Beverages',
    },
  });

  if (!beverages) {
    beverages = await prisma.menuCategory.create({
      data: {
        tenantId: tenant.id,
        name: 'Beverages',
        nameMm: 'ကုံလက်များ',
        sortOrder: 0,
        isActive: true,
      },
    });
  }

  let food = await prisma.menuCategory.findFirst({
    where: {
      tenantId: tenant.id,
      name: 'Food',
    },
  });

  if (!food) {
    food = await prisma.menuCategory.create({
      data: {
        tenantId: tenant.id,
        name: 'Food',
        nameMm: 'ဘuchoစ',
        sortOrder: 1,
        isActive: true,
      },
    });
  }

  // Create menu items - only if they don't already exist for this tenant
  // Latte
  let latte = await prisma.menuItem.findFirst({
    where: {
      tenantId: tenant.id,
      name: 'Latte',
      categoryId: beverages.id,
    },
  });

  if (!latte) {
    latte = await prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        categoryId: beverages.id,
        name: 'Latte',
        nameMm: 'လေ',
        price: 1500,
        costPrice: 600,
        isActive: true,
        isAvailable: true,
      },
    });
  }

  // Green Tea
  let greenTea = await prisma.menuItem.findFirst({
    where: {
      tenantId: tenant.id,
      name: 'Green Tea',
      categoryId: beverages.id,
    },
  });

  if (!greenTea) {
    greenTea = await prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        categoryId: beverages.id,
        name: 'Green Tea',
        nameMm: 'က်ရည်',
        price: 800,
        costPrice: 300,
        isActive: true,
        isAvailable: true,
      },
    });
  }

  // Tea Leaf Salad
  let teaLeafSalad = await prisma.menuItem.findFirst({
    where: {
      tenantId: tenant.id,
      name: 'Tea Leaf Salad',
      categoryId: food.id,
    },
  });

  if (!teaLeafSalad) {
    teaLeafSalad = await prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        categoryId: food.id,
        name: 'Tea Leaf Salad',
        nameMm: 'လက်စူး',
        price: 2000,
        costPrice: 800,
        isActive: true,
        isAvailable: true,
      },
    });
  }

  // Burmese Curry
  let burmeseCurry = await prisma.menuItem.findFirst({
    where: {
      tenantId: tenant.id,
      name: 'Burmese Curry',
      categoryId: food.id,
    },
  });

  if (!burmeseCurry) {
    burmeseCurry = await prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        categoryId: food.id,
        name: 'Burmese Curry',
        nameMm: 'မက္ခါ',
        price: 3500,
        costPrice: 1200,
        isActive: true,
        isAvailable: true,
      },
    });
  }

  console.log('Seed data ready!');
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });