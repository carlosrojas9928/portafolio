import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ForumService {
  constructor(private prisma: PrismaService) {}

  // Crear pregunta en el foro
  async create(userId: string, courseId: string, title: string, body: string) {
    return this.prisma.forumPost.create({
      data: { userId, courseId, title, body },
      include: {
        user: { select: { name: true, avatar: true, role: true } },
      },
    });
  }

  // Listar preguntas de un curso con paginacion
  async findByCourse(courseId: string, page = 1) {
    const skip = (page - 1) * 20;
    const [posts, total] = await Promise.all([
      this.prisma.forumPost.findMany({
        where: { courseId },
        include: {
          user: { select: { name: true, avatar: true, role: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: 20,
      }),
      this.prisma.forumPost.count({ where: { courseId } }),
    ]);
    return { posts, total, pages: Math.ceil(total / 20) };
  }

  // Eliminar pregunta — autor, tutor del curso o admin
  async remove(postId: string, userId: string, role: string) {
    const post = await this.prisma.forumPost.findUnique({
      where: { id: postId },
      include: { course: { select: { tutorId: true } } },
    });
    if (!post) throw new NotFoundException('Post no encontrado');

    const isTutor = post.course.tutorId === userId;
    const isAuthor = post.userId === userId;
    const isAdmin = role === 'ADMIN';

    if (!isAuthor && !isTutor && !isAdmin)
      throw new ForbiddenException('Sin permiso para eliminar este post');

    return this.prisma.forumPost.delete({ where: { id: postId } });
  }
}
