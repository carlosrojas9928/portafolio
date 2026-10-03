import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';


@Injectable()
export class EnrollmentsService {
  constructor(private prisma: PrismaService) {}

  async enroll(userId: string, courseId: string) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Curso no encontrado');
    if (course.status !== 'PUBLISHED') throw new NotFoundException('Curso no disponible');

    const exists = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (exists) throw new ConflictException('Ya estás inscrito en este curso');

    return this.prisma.enrollment.create({ data: { userId, courseId } });
  }

  async getMyEnrollments(userId: string) {
    return this.prisma.enrollment.findMany({
      where: { userId },
      include: {
        course: {
          include: {
            tutor: { select: { name: true, avatar: true } },
            _count: { select: { lessons: true } },
          },
        },
        _count: { select: { lessonProgress: true } },
      },
      orderBy: { enrolledAt: 'desc' },
    });
  }

  async completeLesson(userId: string, courseId: string, lessonId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (!enrollment) throw new NotFoundException('No estás inscrito en este curso');

    // Registrar la lección como completada (upsert = crear si no existe, ignorar si ya existe)
    await this.prisma.lessonProgress.upsert({
      where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } },
      create: { enrollmentId: enrollment.id, lessonId },
      update: {},
    });

    // Recalcular progreso
    const totalLessons = await this.prisma.lesson.count({ where: { courseId } });
    const completedLessons = await this.prisma.lessonProgress.count({
      where: { enrollmentId: enrollment.id },
    });
    const progress = totalLessons > 0 ? (completedLessons / totalLessons) * 100 : 0;

    await this.prisma.enrollment.update({
      where: { id: enrollment.id },
      data: {
        progress,
        completedAt: progress >= 100 ? new Date() : null,
      },
    });

    // Generar certificado automáticamente al llegar al 100%
    if (progress >= 100) {
      await this.prisma.certificate.create({
        data: { userId, courseId },
      }).catch(() => {}); // ignorar si ya existe
    }

    return { progress, completedLessons, totalLessons };
  }

  async isEnrolled(userId: string, courseId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    return { enrolled: !!enrollment, enrollment };
  }
}
