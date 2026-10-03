// backend/src/numbers/numbers.service.ts (extracto)
// Reserva atómica: si dos compradores piden el mismo número a la vez,
// solo uno lo consigue y al otro se le revierte toda la operación.

async reserve(buyerId: string, dto: ReserveNumberDto) {
  const raffle = await this.prisma.raffle.findUnique({ where: { id: dto.raffleId } });
  if (!raffle) throw new NotFoundException('Rifa no encontrada');
  if (raffle.status !== RaffleStatus.ACTIVE) {
    throw new BadRequestException('Esta rifa no está activa para la venta');
  }

  return this.prisma.$transaction(async (tx) => {
    // status: AVAILABLE en el where hace la reserva atómica:
    // un número ya tomado por otro comprador no se toca.
    const result = await tx.raffleNumber.updateMany({
      where: {
        raffleId: dto.raffleId,
        number: { in: dto.numbers },
        status: NumberStatus.AVAILABLE,
      },
      data: {
        status: NumberStatus.RESERVED,
        buyerId,
        reservedAt: new Date(),
      },
    });

    // Si alguno ya no estaba disponible, el throw revierte la transacción completa.
    if (result.count !== dto.numbers.length) {
      throw new BadRequestException(
        'Uno o más números ya no están disponibles. Intenta de nuevo.',
      );
    }

    return tx.raffleNumber.findMany({
      where: { raffleId: dto.raffleId, number: { in: dto.numbers }, buyerId },
    });
  });
}
