import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthProvider, Prisma } from '../generated/prisma/client';
import { toUserResponse, UserWithProfile } from '../users/user-response.mapper';
import { AuthResponseDto } from './dto/auth-response.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { GoogleAuthService } from './google-auth.service';
import { GoogleIdentity } from './auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from './token.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly googleAuth: GoogleAuthService,
    private readonly tokenService: TokenService,
  ) {}

  async googleLogin(dto: GoogleLoginDto): Promise<AuthResponseDto> {
    const identity = await this.googleAuth.verifyIdToken(dto.idToken);
    const user = await this.resolveGoogleUser(identity);
    return this.createSession(user.id);
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthResponseDto> {
    const payload = await this.tokenService.verifyRefreshToken(
      dto.refreshToken,
    );
    const tokenHash = this.tokenService.hashRefreshToken(dto.refreshToken);

    return this.prisma.$transaction(async (tx) => {
      const revoked = await tx.refreshToken.updateMany({
        where: {
          id: payload.jti,
          userId: payload.sub,
          tokenHash,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { revokedAt: new Date() },
      });

      if (revoked.count !== 1) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      const user = await tx.user.findUnique({
        where: { id: payload.sub },
        include: { driverProfile: true },
      });

      if (!user) {
        throw new UnauthorizedException('User no longer exists');
      }

      const tokens = await this.tokenService.issueSession(tx, user.id);
      return { user: toUserResponse(user), tokens };
    });
  }

  async logout(dto: RefreshTokenDto): Promise<void> {
    const payload = await this.tokenService.verifyRefreshToken(
      dto.refreshToken,
    );

    await this.prisma.refreshToken.updateMany({
      where: {
        id: payload.jti,
        userId: payload.sub,
        tokenHash: this.tokenService.hashRefreshToken(dto.refreshToken),
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  private async createSession(userId: string): Promise<AuthResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        include: { driverProfile: true },
      });

      if (!user) {
        throw new UnauthorizedException('User no longer exists');
      }

      const tokens = await this.tokenService.issueSession(tx, user.id);
      return { user: toUserResponse(user), tokens };
    });
  }

  private async resolveGoogleUser(
    identity: GoogleIdentity,
  ): Promise<UserWithProfile> {
    const existingBySub = await this.prisma.user.findUnique({
      where: { googleSub: identity.sub },
      include: { driverProfile: true },
    });
    if (existingBySub) {
      return existingBySub;
    }

    if (identity.email) {
      const existingByEmail = await this.prisma.user.findUnique({
        where: { email: identity.email },
        include: { driverProfile: true },
      });

      if (existingByEmail) {
        if (
          existingByEmail.authProvider !== AuthProvider.GOOGLE ||
          existingByEmail.googleSub
        ) {
          throw new ConflictException(
            'This email is already linked to another account',
          );
        }

        try {
          return await this.prisma.user.update({
            where: { id: existingByEmail.id },
            data: {
              googleSub: identity.sub,
              avatarUrl:
                existingByEmail.avatarUrl ?? identity.picture ?? undefined,
            },
            include: { driverProfile: true },
          });
        } catch (error) {
          if (this.isUniqueConstraint(error)) {
            const linkedUser = await this.prisma.user.findUnique({
              where: { googleSub: identity.sub },
              include: { driverProfile: true },
            });
            if (linkedUser) {
              return linkedUser;
            }
            throw new ConflictException(
              'This email is already linked to another account',
            );
          }
          throw error;
        }
      }
    }

    try {
      return await this.prisma.user.create({
        data: {
          googleSub: identity.sub,
          name: this.resolveName(identity),
          email: identity.email,
          avatarUrl: identity.picture,
          authProvider: AuthProvider.GOOGLE,
        },
        include: { driverProfile: true },
      });
    } catch (error) {
      if (this.isUniqueConstraint(error)) {
        const linkedUser = await this.prisma.user.findUnique({
          where: { googleSub: identity.sub },
          include: { driverProfile: true },
        });
        if (linkedUser) {
          return linkedUser;
        }
        throw new ConflictException(
          'An account with this email already exists',
        );
      }
      throw error;
    }
  }

  private resolveName(identity: GoogleIdentity): string {
    const googleName = identity.name?.trim();
    if (googleName) {
      return googleName.slice(0, 100);
    }

    const emailName = identity.email?.split('@')[0]?.trim();
    return emailName?.slice(0, 100) || 'Google User';
  }

  private isUniqueConstraint(
    error: unknown,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
