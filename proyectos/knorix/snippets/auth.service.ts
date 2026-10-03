import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  // ── REGISTRO ───────────────────────────────────────────
  async register(dto: RegisterDto) {
    // 1. Verificar que el email no exista ya
    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (exists) throw new ConflictException('El email ya está registrado');

    // 2. Hashear la contraseña (nunca guardar en texto plano)
    const hash = await bcrypt.hash(dto.password, 12);

    // 3. Crear el usuario en la BD
    const user = await this.prisma.user.create({
      data: { name: dto.name, email: dto.email, password: hash, role: dto.role },
    });

    // 4. Si es tutor, crear también su perfil
    if (dto.role === 'TUTOR') {
      await this.prisma.tutorProfile.create({ data: { userId: user.id } });
    }

    // 5. Generar tokens y retornar
    return this.generateTokens(user.id, user.email, user.role);
  }

  // ── LOGIN ────────────────────────────────────────────────
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) throw new UnauthorizedException('Credenciales incorrectas');

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Credenciales incorrectas');

    return this.generateTokens(user.id, user.email, user.role);
  }

  // ── GENERAR TOKENS ──────────────────────────────────────
  private async generateTokens(userId: string, email: string, role: string) {
    const payload = { sub: userId, email, role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: process.env.JWT_SECRET,
        expiresIn: '15m',
      }),
      this.jwt.signAsync(payload, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: '7d',
      }),
    ]);

    const hashedRefresh = await bcrypt.hash(refreshToken, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: hashedRefresh },
    });

    return { accessToken, refreshToken };
  }
}
