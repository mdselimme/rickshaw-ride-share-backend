import { DriverProfile, User } from '../generated/prisma/client';
import { UserResponseDto } from './dto/user-response.dto';

export type UserWithProfile = User & {
  driverProfile: DriverProfile | null;
};

export function toUserResponse(user: UserWithProfile): UserResponseDto {
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    phone: user.phone,
    email: user.email,
    authProvider: user.authProvider,
    avatarUrl: user.avatarUrl,
    onboardingCompleted: user.role !== null,
    driverProfile: user.driverProfile
      ? {
          id: user.driverProfile.id,
          isActive: user.driverProfile.isActive,
          rickshawNumber: user.driverProfile.rickshawNumber,
          lat: user.driverProfile.lat,
          lng: user.driverProfile.lng,
          lastLocationUpdateAt: user.driverProfile.lastLocationUpdateAt,
          createdAt: user.driverProfile.createdAt,
          updatedAt: user.driverProfile.updatedAt,
        }
      : null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
