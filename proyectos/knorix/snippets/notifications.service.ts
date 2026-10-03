import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationType } from '@prisma/client';

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private gateway: NotificationsGateway,
  ) {}

  /**
   * Crea una notificación: la guarda en la BD (para que el bell la muestre
   * al cargar el dashboard / historial) y la emite por socket en tiempo real
   * (para que el bell se actualice al instante si el usuario está conectado).
   *
   * Reemplaza las llamadas directas a `notificationsGateway.sendToUser(...)`
   * que existían antes en EnrollmentsService — ahora todo pasa por aquí.
   *
   * Ejemplo:
   *   await this.notifications.create({
   *     userId: course.tutorId,
   *     title: 'Nuevo estudiante',
   *     message: `Nuevo estudiante en "${course.title}"`,
   *     type: 'NEW_ENROLLMENT',
   *     link: `/dashboard/tutor/cursos/${course.slug}`,
   *   });
   */
  async create(data: {
    userId: string;
    title: string;
    message: string;
    type?: NotificationType;
    link?: string;
  }) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: data.userId,
        title: data.title,
        message: data.message,
        type: data.type ?? 'GENERAL',
        link: data.link,
      },
    });

    // Push en tiempo real — si el usuario no está conectado, socket.io simplemente
    // no entrega el evento; la notificación ya quedó guardada y el bell la mostrará
    // al hacer polling o al recargar.
    this.gateway.emitToUser(data.userId, notification);

    return notification;
  }

  /** Lista las notificaciones del usuario, más recientes primero */
  async findAllForUser(userId: string, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: {
        userId,
        ...(unreadOnly ? { read: false } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, read: false },
    });
    return { count };
  }

  async markAsRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification) throw new NotFoundException('Notificación no encontrada');
    if (notification.userId !== userId) throw new ForbiddenException();

    return this.prisma.notification.update({
      where: { id },
      data: { read: true },
    });
  }

  async markAllAsRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return { success: true };
  }

  async remove(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification) throw new NotFoundException('Notificación no encontrada');
    if (notification.userId !== userId) throw new ForbiddenException();

    await this.prisma.notification.delete({ where: { id } });
    return { success: true };
  }
}
