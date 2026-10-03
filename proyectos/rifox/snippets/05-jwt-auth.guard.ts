// backend/src/auth/guards/jwt-auth.guard.ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Protege las rutas que requieren sesión: valida el access token JWT
// con la estrategia 'jwt' de Passport.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

// Uso en un controller:
//   @UseGuards(JwtAuthGuard)
//   @Post('reserve')
//   reserve(@Req() req, @Body() dto: ReserveNumberDto) { ... }
