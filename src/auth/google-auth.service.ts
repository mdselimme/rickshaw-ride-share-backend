import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import type { TokenPayload } from 'google-auth-library';
import { GoogleIdentity } from './auth.types';

@Injectable()
export class GoogleAuthService {
  private readonly client = new OAuth2Client();
  private readonly clientIds: string[];

  constructor(config: ConfigService) {
    this.clientIds = config
      .getOrThrow<string>('GOOGLE_CLIENT_IDS')
      .split(',')
      .map((clientId) => clientId.trim())
      .filter(Boolean);

    if (this.clientIds.length === 0) {
      throw new Error('GOOGLE_CLIENT_IDS must contain at least one client ID');
    }
  }

  async verifyIdToken(idToken: string): Promise<GoogleIdentity> {
    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.clientIds,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Invalid Google identity token');
    }

    if (!payload?.sub) {
      throw new UnauthorizedException('Invalid Google identity token');
    }

    if (payload.email && payload.email_verified !== true) {
      throw new UnauthorizedException('Google email is not verified');
    }

    return {
      sub: payload.sub,
      email: payload.email?.toLowerCase(),
      name: payload.name,
      picture: payload.picture,
    };
  }
}
