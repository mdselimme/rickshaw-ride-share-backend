import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { trimString } from '../../common/transformers/trim.transformer';
import {
  IsString,
  IsUrl,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { E164_PHONE_MESSAGE, E164_PHONE_PATTERN } from '../user.constants';

export class UpdateMeDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 100 })
  @ValidateIf((_dto: UpdateMeDto, value: unknown) => value !== undefined)
  @Transform(trimString)
  @IsString()
  @Length(1, 100)
  name?: string;

  @ApiPropertyOptional({ example: '+8801712345678' })
  @ValidateIf((_dto: UpdateMeDto, value: unknown) => value !== undefined)
  @Transform(trimString)
  @IsString()
  @Matches(E164_PHONE_PATTERN, { message: E164_PHONE_MESSAGE })
  phone?: string;

  @ApiPropertyOptional({ maxLength: 2048 })
  @ValidateIf((_dto: UpdateMeDto, value: unknown) => value !== undefined)
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  avatarUrl?: string;
}
