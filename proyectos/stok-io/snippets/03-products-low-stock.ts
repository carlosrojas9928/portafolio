// backend/src/products/products.service.ts (extracto)
// Todas las consultas se filtran por businessId: un negocio nunca ve
// ni modifica los productos de otro.

findAll(businessId: string) {
  return this.prisma.product.findMany({
    where: { businessId },
    include: { category: true },
    orderBy: { name: 'asc' },
  });
}

// Prisma no puede comparar dos columnas entre sí (stock <= minStock),
// así que esta consulta va en SQL. La plantilla etiquetada parametriza
// businessId, por lo que no hay riesgo de inyección SQL.
findLowStock(businessId: string) {
  return this.prisma.$queryRaw`
    SELECT * FROM "Product"
    WHERE "businessId" = ${businessId}
      AND "stock" <= "minStock"
    ORDER BY "stock" ASC
  `;
}

async findOne(businessId: string, id: string) {
  const product = await this.prisma.product.findFirst({
    where: { id, businessId }, // un id de otro negocio devuelve 404
    include: { category: true, movements: { orderBy: { date: 'desc' } } },
  });
  if (!product) throw new NotFoundException('Product not found');
  return product;
}

// update y remove reutilizan findOne para validar que el producto es del negocio
async update(businessId: string, id: string, dto: UpdateProductDto) {
  await this.findOne(businessId, id);
  return this.prisma.product.update({ where: { id }, data: dto });
}
