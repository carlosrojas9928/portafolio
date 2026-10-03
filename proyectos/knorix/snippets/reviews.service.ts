import { Injectable, ForbiddenException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService) {}

  // Crear resena — solo estudiantes inscritos
  async create(userId: string, courseId: string, rating: number, comment?: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (!enrollment) throw new ForbiddenException('Solo estudiantes inscritos pueden resenar');

    const exists = await this.prisma.review.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (exists) throw new ConflictException('Ya dejaste una resena para este curso');

    const review = await this.prisma.review.create({
      data: { userId, courseId, rating, comment },
      include: { user: { select: { id: true, name: true, avatar: true } } },
    });

    await this.updateCourseRating(courseId);
    return review;
  }

  // Listar resenas de un curso con paginacion
  async findByCourse(courseId: string, page = 1) {
    const skip = (page - 1) * 10;
    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where: { courseId },
        include: { user: { select: { id: true, name: true, avatar: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: 10,
      }),
      this.prisma.review.count({ where: { courseId } }),
    ]);
    return { reviews, total, pages: Math.ceil(total / 10) };
  }

  // Editar resena — solo el autor
  async update(reviewId: string, userId: string, rating: number, comment?: string) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Resena no encontrada');
    if (review.userId !== userId)
      throw new ForbiddenException('Solo el autor puede editar esta resena');

    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        rating,
        comment: comment ?? null,
        updatedAt: new Date(),
      },
      include: { user: { select: { id: true, name: true, avatar: true } } },
    });

    await this.updateCourseRating(review.courseId);
    return updated;
  }

  // Eliminar resena — solo el autor o un admin
  async remove(reviewId: string, userId: string, role: string) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Resena no encontrada');
    if (review.userId !== userId && role !== 'ADMIN')
      throw new ForbiddenException('Sin permiso para eliminar esta resena');
    await this.prisma.review.delete({ where: { id: reviewId } });
    await this.updateCourseRating(review.courseId);
  }

  // Recalcular el rating promedio del curso
  private async updateCourseRating(courseId: string) {
    const result = await this.prisma.review.aggregate({
      where: { courseId },
      _avg: { rating: true },
      _count: { rating: true },
    });
    await this.prisma.course.update({
      where: { id: courseId },
      data: {
        rating: result._avg.rating || 0,
        totalRatings: result._count.rating,
      },
    });
  }
}
