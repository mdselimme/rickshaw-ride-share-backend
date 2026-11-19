export interface AuthenticatedUser {
  id: string;
}

export interface AccessTokenPayload {
  sub: string;
  typ: string;
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload extends AccessTokenPayload {
  jti: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  refreshExpiresIn: number;
}

export interface GoogleIdentity {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
}
