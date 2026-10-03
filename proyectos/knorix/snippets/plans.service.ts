// ─────────────────────────────────────────────────────────────
// src/plans/plans.service.ts
// ─────────────────────────────────────────────────────────────
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  /** Público: solo planes activos, ordenados */
  findAllPublic() {
    return this.prisma.plan.findMany({
      where: { active: true },
      orderBy: { order: 'asc' },
    });
  }

  /** Admin: todos los planes */
  findAll() {
    return this.prisma.plan.findMany({ orderBy: { order: 'asc' } });
  }

  async findOne(id: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException(`Plan ${id} no encontrado`);
    return plan;
  }

  create(dto: any) {
    return this.prisma.plan.create({ data: dto });
  }

  async update(id: string, dto: any) {
    await this.findOne(id); // valida existencia
    return this.prisma.plan.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.plan.delete({ where: { id } });
  }
}
