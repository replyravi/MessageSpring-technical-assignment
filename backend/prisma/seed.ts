import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

const CATEGORIES = [
  'Audio',
  'Wearables',
  'Phones',
  'Laptops',
  'Gaming',
  'Cameras',
  'Home',
  'Accessories',
] as const;

// Tiny deterministic PRNG so the seed is reproducible across machines.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function price(rand: () => number) {
  // 499 - 2499 USD in cents, biased toward the lower end.
  return Math.floor((499 + rand() * rand() * 2000) * 100);
}

function makeName(i: number, category: string) {
  const adjectives = [
    'Aurora',
    'Helios',
    'Nimbus',
    'Vector',
    'Quartz',
    'Onyx',
    'Cobalt',
    'Zephyr',
  ];
  const types: Record<string, string> = {
    Audio: 'Headphones',
    Wearables: 'Band',
    Phones: 'Phone',
    Laptops: 'Laptop',
    Gaming: 'Controller',
    Cameras: 'Camera',
    Home: 'Hub',
    Accessories: 'Charger',
  };
  const adj = adjectives[i % adjectives.length]!;
  return `${adj} ${types[category]!} ${Math.floor(i / adjectives.length) + 1}`;
}

async function main() {
  console.log('→ seeding user');
  const password = await argon2.hash(process.env.SEED_USER_PASSWORD ?? 'Password123!');
  await prisma.user.upsert({
    where: { email: 'demo@example.com' },
    update: {},
    create: {
      email: 'demo@example.com',
      password,
      fullName: 'Demo User',
      role: 'USER',
    },
  });

  console.log('→ seeding products');
  const rand = mulberry32(42);
  const products = Array.from({ length: 200 }, (_, i) => {
    const category = CATEGORIES[i % CATEGORIES.length]!;
    const name = makeName(i + 1, category);
    const cents = price(rand);
    return {
      slug: `${category.toLowerCase()}-${i + 1}-${Math.floor(rand() * 1e6)}`,
      name,
      description: `The ${name} blends thoughtful engineering with everyday utility. ` +
        `Category-leading battery life, premium build, and a 2-year warranty.`,
      priceCents: cents,
      currency: 'USD',
      category,
      imageUrl: `https://picsum.photos/seed/eco-${i + 1}/600/600`,
      rating: Math.round((3 + rand() * 2) * 10) / 10,
      stock: Math.floor(rand() * 200),
    };
  });

  // Wipe + re-insert. Cheap and idempotent for a demo.
  await prisma.product.deleteMany({});
  await prisma.product.createMany({ data: products });

  console.log(`✓ inserted ${products.length} products`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
