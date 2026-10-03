// backend/src/common/guards/roles.guard.ts
// Control de acceso por rol (OWNER / EMPLOYEE) con un decorador @Roles(...).
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Lee los roles del método y, si no hay, de la clase
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Sin @Roles(...) el endpoint no restringe por rol
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('No tienes permisos para realizar esta acción');
    }
    return true;
  }
}

// Uso (JwtAuthGuard va primero para que exista req.user):
//   @UseGuards(JwtAuthGuard, RolesGuard)
//   @Roles(Role.OWNER)
//   @Delete(':id')
//   remove(...) { ... }
