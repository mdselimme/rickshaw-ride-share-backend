import { ApiProperty } from '@nestjs/swagger';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  BEARER_TOKEN_TYPE,
  REFRESH_TOKEN_TTL_SECONDS,
} from '../auth.constants';
import { UserResponseDto } from '../../users/dto/user-response.dto';

export class TokenPairDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty({ example: BEARER_TOKEN_TYPE })
  tokenType!: 'Bearer';

  @ApiProperty({ example: ACCESS_TOKEN_TTL_SECONDS })
  expiresIn!: number;

  @ApiProperty({ example: REFRESH_TOKEN_TTL_SECONDS })
  refreshExpiresIn!: number;
}

export class AuthResponseDto {
  @ApiProperty({ type: UserResponseDto })
  user!: UserResponseDto;

  @ApiProperty({ type: TokenPairDto })
  tokens!: TokenPairDto;
}
