// backend/src/payments/payments.service.ts (extracto)
// Revisión manual de pagos (Nequi / transferencia): el organizador aprueba o
// rechaza el comprobante, y los números cambian de estado en la misma transacción.

// Solo el organizador dueño de todas las rifas del pago puede revisarlo.
private async findAndVerifyOrganizer(paymentId: string, organizerId: string) {
  const payment = await this.prisma.payment.findUnique({
    where: { id: paymentId },
    include: { numbers: { include: { raffle: true } } },
  });
  if (!payment) throw new NotFoundException('Pago no encontrado');
  if (!payment.numbers.every((n) => n.raffle.organizerId === organizerId)) {
    throw new ForbiddenException('No eres el organizador de esta rifa');
  }
  return payment;
}

async approve(paymentId: string, organizerId: string) {
  const payment = await this.findAndVerifyOrganizer(paymentId, organizerId);
  if (payment.status !== PaymentStatus.PENDING) {
    throw new BadRequestException('Este pago ya fue revisado');
  }
  return this.prisma.$transaction(async (tx) => {
    await tx.raffleNumber.updateMany({
      where: { paymentId: payment.id },
      data: { status: NumberStatus.PAID },
    });
    return tx.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.APPROVED, reviewedAt: new Date() },
    });
  });
}

async reject(paymentId: string, organizerId: string, rejectionNote: string) {
  // ... misma verificación que approve ...
  return this.prisma.$transaction(async (tx) => {
    // Al rechazar, los números vuelven a estar disponibles para otros compradores.
    await tx.raffleNumber.updateMany({
      where: { paymentId: payment.id },
      data: { status: NumberStatus.AVAILABLE, buyerId: null, reservedAt: null, paymentId: null },
    });
    return tx.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.REJECTED, reviewedAt: new Date(), rejectionNote },
    });
  });
}
