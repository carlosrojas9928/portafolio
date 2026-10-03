// src/subscriptions/subscriptions.service.ts

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService }  from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import Stripe from 'stripe';

@Injectable()
export class SubscriptionsService {
  private stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-02-25.clover',
  });

  constructor(
    private prisma: PrismaService,
    // forwardRef evita la dependencia circular PaymentsModule ↔ SubscriptionsModule
    @Inject(forwardRef(() => PaymentsService))
    private paymentsService: PaymentsService,
  ) {}

  // ─── Helper: obtener configuración de un plan desde la BD ────────────────────
  //
  // Reemplaza el objeto PLANS hardcodeado. Busca por slug (basic, pro, unlimited,
  // agency) con fallback al slug en minúsculas del PlanType enum.
  //
  private async getPlanConfig(planKey: string) {
    const slug = planKey.toLowerCase(); // "BASIC" → "basic"
    const plan = await this.prisma.plan.findUnique({ where: { slug } });
    if (!plan) throw new BadRequestException(`Plan "${planKey}" no encontrado en la base de datos`);
    return {
      priceId:     plan.stripePriceId,
      maxCourses:  plan.maxCourses  ?? -1, // null en BD = ilimitado → -1 en lógica
      maxStudents: plan.maxStudents ?? -1,
    };
  }

  // ─── Checkout de suscripción ─────────────────────────────────────────────────

  async createCheckout(tutorId: string, plan: 'BASIC' | 'PRO' | 'UNLIMITED' | 'AGENCY') {
    const tutor = await this.prisma.user.findUnique({ where: { id: tutorId } });
    if (!tutor) throw new NotFoundException('Tutor no encontrado');

    const planConfig = await this.getPlanConfig(plan);
    if (!planConfig.priceId) {
      throw new BadRequestException(
        `El plan "${plan}" no tiene un Price ID de Stripe configurado. Agrega STRIPE_PRICE_${plan} al .env o actualiza el campo stripePriceId en la BD.`,
      );
    }

    let customerId: string;
    const existingSub = await this.prisma.subscription.findUnique({ where: { tutorId } });

    if (existingSub?.stripeCustomerId) {
      customerId = existingSub.stripeCustomerId;
    } else {
      const customer = await this.stripe.customers.create({
        email: tutor.email,
        name:  tutor.name,
        metadata: { userId: tutorId },
      });
      customerId = customer.id;
    }

    const session = await this.stripe.checkout.sessions.create({
      customer:             customerId,
      payment_method_types: ['card'],
      mode:                 'subscription',
      line_items: [{ price: planConfig.priceId, quantity: 1 }],
      metadata: { userId: tutorId, plan },
      subscription_data: { metadata: { userId: tutorId, plan } },
      success_url: `${process.env.FRONTEND_URL}/dashboard/tutor?subscribed=true`,
      cancel_url:  `${process.env.FRONTEND_URL}/dashboard/tutor/suscripcion`,
    });

    return { checkoutUrl: session.url };
  }

  // ─── Suscripción actual del tutor ────────────────────────────────────────────

  async getMySubscription(tutorId: string) {
    const sub = await this.prisma.subscription.findUnique({ where: { tutorId } });
    if (!sub) return null;

    const courseCount  = await this.prisma.course.count({ where: { tutorId } });
    const studentCount = await this.prisma.enrollment.count({ where: { course: { tutorId } } });

    // Leer límites reales desde la BD
    const planConfig = await this.getPlanConfig(sub.plan).catch(() => ({
      priceId: null, maxCourses: -1, maxStudents: -1,
    }));

    return {
      ...sub,
      usage: {
        courses:  { current: courseCount,  max: planConfig.maxCourses  },
        students: { current: studentCount, max: planConfig.maxStudents },
      },
    };
  }

  // ─── Cancelar suscripción ────────────────────────────────────────────────────

  async cancel(tutorId: string) {
    const sub = await this.prisma.subscription.findUnique({ where: { tutorId } });
    if (!sub || !sub.stripeSubId) throw new NotFoundException('Sin suscripcion activa');

    await this.stripe.subscriptions.update(sub.stripeSubId, { cancel_at_period_end: true });
    return { message: 'Suscripcion cancelada al final del periodo actual' };
  }

  // ─── Portal de facturación de Stripe ─────────────────────────────────────────

  async createBillingPortalSession(tutorId: string): Promise<{ portalUrl: string }> {
    const sub = await this.prisma.subscription.findUnique({ where: { tutorId } });
    if (!sub?.stripeCustomerId) {
      throw new BadRequestException('No tienes una suscripción activa');
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer:   sub.stripeCustomerId,
      return_url: `${process.env.FRONTEND_URL}/dashboard/tutor/suscripcion`,
    });

    return { portalUrl: session.url };
  }

  // ─── Webhook ─────────────────────────────────────────────────────────────────
  //
  // El webhook de Stripe usa el PlanType enum (BASIC, PRO, UNLIMITED, AGENCY)
  // guardado en subscription.metadata para asociar el evento al plan correcto.
  // En lugar de buscar por priceId en el mapa hardcodeado, buscamos en la BD.

  async handleWebhook(payload: Buffer, signature: string) {
    const event = this.stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );

    // Delegar eventos de cursos a PaymentsService
    const courseEvents = new Set([
      'checkout.session.completed',
      'checkout.session.expired',
      'charge.refunded',
    ]);

    if (courseEvents.has(event.type)) {
      await this.paymentsService.handleCourseWebhookEvent(event);
      return { received: true };
    }

    switch (event.type) {

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub    = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.userId;
        if (!userId) break;

        const priceId = sub.items.data[0]?.price.id;

        // Buscar el plan en BD por stripePriceId en lugar de mapa hardcodeado
        let planSlug: string | null = null;
        if (priceId) {
          const planRecord = await this.prisma.plan.findFirst({
            where: { stripePriceId: priceId },
          });
          planSlug = planRecord?.slug?.toUpperCase() ?? null; // "basic" → "BASIC"
        }

        // Fallback: intentar leer del metadata de la suscripción
        if (!planSlug) {
          planSlug = sub.metadata?.plan ?? null;
        }

        if (!planSlug) break;

        const customerId = typeof sub.customer === 'string'
          ? sub.customer
          : (sub.customer as any)?.id;

        await this.prisma.subscription.upsert({
          where:  { tutorId: userId },
          create: {
            tutorId:          userId,
            plan:             planSlug as any,
            stripeSubId:      sub.id,
            stripeCustomerId: customerId,
            status:           (sub.status === 'active' ? 'ACTIVE' : 'PENDING') as any,
            currentPeriodEnd: new Date(sub.items.data[0].current_period_end * 1000),
          },
          update: {
            plan:             planSlug as any,
            stripeSubId:      sub.id,
            stripeCustomerId: customerId,
            status:           (sub.status === 'active' ? 'ACTIVE' : 'PENDING') as any,
            currentPeriodEnd: new Date(sub.items.data[0].current_period_end * 1000),
          },
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const sub    = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.userId;
        if (!userId) break;

        await this.prisma.subscription.updateMany({
          where: { tutorId: userId },
          data:  { status: 'CANCELLED' },
        });
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice    = event.data.object as Stripe.Invoice;
        console.log('💰 invoice.payment_succeeded recibido', invoice.id);

        const customerId = invoice.customer as string;

        let userId: string | undefined;
        const subFromDb = await this.prisma.subscription.findFirst({
          where: { stripeCustomerId: customerId },
        });
        userId = subFromDb?.tutorId;

        if (!userId) {
          const customer = await this.stripe.customers.retrieve(customerId);
          if (!('deleted' in customer)) {
            userId = customer.metadata?.userId;
            if (userId) {
              await this.prisma.subscription.updateMany({
                where: { tutorId: userId, stripeCustomerId: null },
                data:  { stripeCustomerId: customerId },
              });
            }
          }
        }

        if (!userId) break;

        const exists = await this.prisma.payment.findFirst({
          where: { stripePaymentId: invoice.id },
        });
        if (exists) break;

        const subscriptionLine = invoice.lines?.data?.find(
          (line: any) => line.type === 'subscription' || line.subscription != null,
        );
        const priceId = (subscriptionLine as any)?.price?.id ?? null;

        // Buscar el plan por stripePriceId en la BD
        let subscriptionPlan: string | null = null;
        if (priceId) {
          const planRecord = await this.prisma.plan.findFirst({
            where: { stripePriceId: priceId },
          });
          subscriptionPlan = planRecord?.slug?.toUpperCase() ?? null; // "basic" → "BASIC"
        }

        await this.prisma.payment.create({
          data: {
            userId,
            courseId:        null,
            subscriptionPlan,
            stripePaymentId: invoice.id,
            amount:          (invoice.amount_paid ?? 0) / 100,
            currency:        invoice.currency?.toUpperCase() ?? 'COP',
            status:          'COMPLETED',
          },
        });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice    = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const customer   = await this.stripe.customers.retrieve(customerId);
        if ('deleted' in customer) break;
        const userId = customer.metadata?.userId;
        if (!userId) break;

        await this.prisma.subscription.updateMany({
          where: { tutorId: userId },
          data:  { status: 'PAST_DUE' },
        });
        break;
      }
    }

    return { received: true };
  }

  // ─── Guardas de límites ───────────────────────────────────────────────────────

  async canCreateCourse(tutorId: string): Promise<void> {
    const sub = await this.getMySubscription(tutorId);
    if (!sub || sub.status !== 'ACTIVE') {
      throw new BadRequestException('Necesitas una suscripcion activa para crear cursos');
    }
    const { maxCourses } = await this.getPlanConfig(sub.plan);
    if (maxCourses === -1) return; // ilimitado
    if (sub.usage.courses.current >= maxCourses) {
      throw new BadRequestException(
        `Tu plan ${sub.plan} permite máximo ${maxCourses} cursos. Actualiza tu plan para crear más.`,
      );
    }
  }

  async canEnrollStudent(tutorId: string): Promise<void> {
    const sub = await this.getMySubscription(tutorId);
    if (!sub || sub.status !== 'ACTIVE') return;
    const { maxStudents } = await this.getPlanConfig(sub.plan);
    if (maxStudents === -1) return; // ilimitado
    if (sub.usage.students.current >= maxStudents) {
      throw new BadRequestException(
        `El tutor alcanzó el límite de estudiantes de su plan ${sub.plan}.`,
      );
    }
  }
}