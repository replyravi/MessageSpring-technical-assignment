import { Test } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { PrismaClient } from '@prisma/client';

// Minimal mock — we only care about pagination math here.
const findMany = jest.fn();
const count = jest.fn();
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({ product: { findMany, count } })),
}));

describe('ProductsService pagination', () => {
  let svc: ProductsService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      providers: [ProductsService, { provide: PrismaClient, useValue: { product: { findMany, count } } }],
    }).compile();
    svc = mod.get(ProductsService);
  });

  beforeEach(() => jest.clearAllMocks());

  it('returns nextCursor + hasMore when more pages exist', async () => {
    // service asks for limit+1; we return 21 rows for a limit of 20
    findMany.mockResolvedValue(
      Array.from({ length: 21 }, (_, i) => ({ id: i + 1 })),
    );

    const page = await svc.list({ limit: 20 });

    expect(page.items).toHaveLength(20);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe(20);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 21 }));
  });

  it('returns null cursor when at the end', async () => {
    findMany.mockResolvedValue([{ id: 199 }, { id: 200 }]);
    const page = await svc.list({ limit: 20 });
    expect(page.items).toHaveLength(2);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });
});
