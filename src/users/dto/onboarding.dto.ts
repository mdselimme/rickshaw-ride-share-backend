import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsString, Length, Matches, ValidateIf } from 'class-validator';
import { UserRole } from '../../generated/prisma/client';
import { trimString } from '../../common/transformers/trim.transformer';
import { E164_PHONE_MESSAGE, E164_PHONE_PATTERN } from '../user.constants';

export class OnboardingDto {
  @ApiProperty({ enum: UserRole, enumName: 'UserRole' })
  @IsEnum(UserRole)
  role!: UserRole;

  @ApiProperty({ minLength: 1, maxLength: 100 })
  @Transform(trimString)
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiPropertyOptional({
    description: 'Required for drivers; optional for passengers',
    example: '+8801712345678',
  })
  @ValidateIf(
    (dto: OnboardingDto) =>
      dto.role === UserRole.DRIVER || dto.phone !== undefined,
  )
  @Transform(trimString)
  @IsString()
  @Matches(E164_PHONE_PATTERN, { message: E164_PHONE_MESSAGE })
  phone?: string;
}
