// backend/src/draws/draws.service.ts (extracto)
// Sorteo verificable: el ganador sale de una semilla pública (lotería oficial),
// así que cualquiera puede repetir el cálculo y comprobar el resultado.
import * as crypto from 'crypto';

@Injectable()
export class DrawsService {
  constructor(private prisma: PrismaService) {}

  // Semilla pública -> índice determinístico dentro de los números pagados.
  private seedToIndex(publicSeed: string, poolSize: number): number {
    const hash = crypto.createHash('sha256').update(publicSeed).digest('hex');
    return Number(BigInt('0x' + hash) % BigInt(poolSize));
  }

  async create(raffleId: string, organizerId: string, publicSeed: string, seedSource: string) {
    // ... validaciones: la rifa existe, es del organizador y no tiene sorteo ...

    // Solo participan los números pagados, en orden fijo para que sea reproducible.
    const paidNumbers = await this.prisma.raffleNumber.findMany({
      where: { raffleId, status: NumberStatus.PAID },
      orderBy: { number: 'asc' },
    });

    const index = this.seedToIndex(publicSeed, paidNumbers.length);
    const winningNumber = paidNumbers[index].number;

    // El sorteo y el cambio de estado de la rifa se guardan juntos o no se guardan.
    return this.prisma.$transaction(async (tx) => {
      const draw = await tx.draw.create({
        data: { raffleId, winningNumber, publicSeed, seedSource },
      });
      await tx.raffle.update({
        where: { id: raffleId },
        data: { status: RaffleStatus.DRAWN },
      });
      return draw;
    });
  }
}
