// backend/src/products/products.service.ts (extracto)
// Entradas y salidas: el movimiento y el cambio de stock se guardan juntos
// en una transacción, y las salidas nunca dejan el stock en negativo.

async registerMovement(
  businessId: string,
  productId: string,
  userId: string,
  type: MovementType,
  quantity: number,
  reason?: string,
) {
  if (quantity <= 0) {
    throw new BadRequestException('Quantity must be greater than zero');
  }

  // El producto debe pertenecer al negocio del usuario
  const product = await this.prisma.product.findFirst({
    where: { id: productId, businessId },
    select: { id: true },
  });
  if (!product) throw new NotFoundException('Product not found');

  return this.prisma.$transaction(async (tx) => {
    if (type === MovementType.OUT) {
      // La condición stock >= cantidad va dentro del UPDATE, así que es atómica:
      // dos salidas simultáneas no pueden dejar el stock en negativo.
      const result = await tx.product.updateMany({
        where: { id: productId, stock: { gte: quantity } },
        data: { stock: { decrement: quantity } },
      });
      if (result.count === 0) {
        throw new BadRequestException('Insufficient stock for this movement');
      }
    } else {
      await tx.product.update({
        where: { id: productId },
        data: { stock: { increment: quantity } },
      });
    }

    return tx.movement.create({
      data: { productId, userId, type, quantity, reason },
    });
  });
}
