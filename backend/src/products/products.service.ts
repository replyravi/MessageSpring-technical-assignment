import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient, Product } from '@prisma/client';
import { ListProductsDto } from './dto/list-products.dto';

export interface ProductPage {
  items: Product[];
  // null when we've reached the end of the listing.
  nextCursor: number | null;
  hasMore: boolean;
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(dto: ListProductsDto): Promise<ProductPage> {
    const limit = dto.limit;
    // Fetch one extra row as a cheap "hasMore" signal.
    const take = limit + 1;

    const where: Prisma.ProductWhereInput = {};
    if (dto.cursor) where.id = { gt: dto.cursor };
    if (dto.category) where.category = { equals: dto.category };
    if (dto.maxPriceCents) where.priceCents = { lte: dto.maxPriceCents };

    const rows = await this.prisma.product.findMany({
      where,
      orderBy: { id: 'asc' },
      take,
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  count() {
    return this.prisma.product.count();
  }
}
