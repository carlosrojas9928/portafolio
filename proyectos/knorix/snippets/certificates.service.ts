import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CertificatesService {
  constructor(private prisma: PrismaService) {}

  // Mis certificados — del estudiante autenticado
  async getMyCertificates(userId: string) {
    return this.prisma.certificate.findMany({
      where: { userId },
      include: {
        course: {
          select: {
            title: true,
            thumbnail: true,
            tutor: { select: { name: true } },
          },
        },
      },
      orderBy: { issuedAt: 'desc' },
    });
  }

  // Verificacion publica por codigo UUID — sin autenticacion
  async verify(code: string) {
    const cert = await this.prisma.certificate.findUnique({
      where: { code },
      include: {
        user: { select: { name: true } },
        course: {
          select: {
            title: true,
            tutor: { select: { name: true } },
          },
        },
      },
    });
    if (!cert) throw new NotFoundException('Certificado no encontrado o codigo invalido');
    return cert;
  }
}
