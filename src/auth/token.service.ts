import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '../generated/prisma/client';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  ACCESS_TOKEN_TYPE,
  BEARER_TOKEN_TYPE,
  JWT_AUDIENCE,
  JWT_ISSUER,
  REFRESH_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TYPE,
} from './auth.constants';
import {
  AccessTokenPayload,
  RefreshTokenPayload,
  TokenPair,
} from './auth.types';

@Injectable()
export class TokenService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;

  constructor(
    private readonly jwtService: JwtService,
    config: ConfigService,
  ) {
    this.accessSecret = config.getOrThrow<string>('JWT_ACCESS_SECRET');
    this.refreshSecret = config.getOrThrow<string>('JWT_REFRESH_SECRET');

    if (this.accessSecret === this.refreshSecret) {
      throw new Error('JWT access and refresh secrets must be different');
    }

    if (this.accessSecret.length < 32 || this.refreshSecret.length < 32) {
      throw new Error('JWT secrets must be at least 32 characters long');
    }
  }

  async issueSession(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<TokenPair> {
    const accessToken = await this.signAccessToken(userId);
    const jti = randomUUID();
    const refreshToken = await this.signRefreshToken(userId, jti);

    await tx.refreshToken.create({
      data: {
        id: jti,
        userId,
        tokenHash: this.hashRefreshToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
      },
    });

    return {
      accessToken,
      refreshToken,
      tokenType: BEARER_TOKEN_TYPE,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      refreshExpiresIn: REFRESH_TOKEN_TTL_SECONDS,
    };
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: this.accessSecret,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    if (!payload?.sub || payload.typ !== ACCESS_TOKEN_TYPE) {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    return payload;
  }

  async verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.refreshSecret,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (!payload?.sub || !payload.jti || payload.typ !== REFRESH_TOKEN_TYPE) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    return payload;
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private signAccessToken(userId: string): Promise<string> {
    return this.jwtService.signAsync(
      { sub: userId, typ: ACCESS_TOKEN_TYPE },
      {
        secret: this.accessSecret,
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      },
    );
  }

  private signRefreshToken(userId: string, jti: string): Promise<string> {
    return this.jwtService.signAsync(
      { sub: userId, typ: REFRESH_TOKEN_TYPE, jti },
      {
        secret: this.refreshSecret,
        expiresIn: REFRESH_TOKEN_TTL_SECONDS,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      },
    );
  }
}
