import { ApiProperty } from '@nestjs/swagger';
import { AuthProvider, UserRole } from '../../generated/prisma/client';

export class DriverProfileResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ nullable: true })
  rickshawNumber!: string | null;

  @ApiProperty({ nullable: true })
  lat!: number | null;

  @ApiProperty({ nullable: true })
  lng!: number | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastLocationUpdateAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class UserResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({
    enum: UserRole,
    enumName: 'UserRole',
    nullable: true,
  })
  role!: UserRole | null;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true })
  phone!: string | null;

  @ApiProperty({ nullable: true })
  email!: string | null;

  @ApiProperty({ enum: AuthProvider, enumName: 'AuthProvider' })
  authProvider!: AuthProvider;

  @ApiProperty({ nullable: true })
  avatarUrl!: string | null;

  @ApiProperty()
  onboardingCompleted!: boolean;

  @ApiProperty({ type: DriverProfileResponseDto, nullable: true })
  driverProfile!: DriverProfileResponseDto | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class UserEnvelopeDto {
  @ApiProperty({ type: UserResponseDto })
  user!: UserResponseDto;
}
