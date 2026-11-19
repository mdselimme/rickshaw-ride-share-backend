import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, UserRole } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OnboardingDto } from './dto/onboarding.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { UserEnvelopeDto } from './dto/user-response.dto';
import { toUserResponse } from './user-response.mapper';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string): Promise<UserEnvelopeDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { driverProfile: true },
    });

    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    return { user: toUserResponse(user) };
  }

  async updateMe(userId: string, dto: UpdateMeDto): Promise<UserEnvelopeDto> {
    if (
      dto.name === undefined &&
      dto.phone === undefined &&
      dto.avatarUrl === undefined
    ) {
      throw new BadRequestException('At least one profile field is required');
    }

    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) {
      data.name = dto.name;
    }
    if (dto.phone !== undefined) {
      data.phone = dto.phone;
    }
    if (dto.avatarUrl !== undefined) {
      data.avatarUrl = dto.avatarUrl;
    }

    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data,
        include: { driverProfile: true },
      });
      return { user: toUserResponse(user) };
    } catch (error) {
      this.rethrowWriteError(error);
    }
  }

  async completeOnboarding(
    userId: string,
    dto: OnboardingDto,
  ): Promise<UserEnvelopeDto> {
    if (dto.role === UserRole.DRIVER && !dto.phone) {
      throw new BadRequestException('Phone number is required for drivers');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.user.findUnique({
          where: { id: userId },
          select: { id: true, role: true },
        });

        if (!existing) {
          throw new UnauthorizedException('User no longer exists');
        }

        if (existing.role !== null) {
          throw new ConflictException('Onboarding has already been completed');
        }

        const data: Prisma.UserUpdateManyMutationInput = {
          role: dto.role,
          name: dto.name,
        };
        if (dto.phone !== undefined) {
          data.phone = dto.phone;
        }

        const updated = await tx.user.updateMany({
          where: { id: userId, role: null },
          data,
        });

        if (updated.count !== 1) {
          throw new ConflictException('Onboarding has already been completed');
        }

        if (dto.role === UserRole.DRIVER) {
          await tx.driverProfile.create({
            data: { userId },
          });
        }

        const user = await tx.user.findUnique({
          where: { id: userId },
          include: { driverProfile: true },
        });

        if (!user) {
          throw new UnauthorizedException('User no longer exists');
        }

        return { user: toUserResponse(user) };
      });
    } catch (error) {
      this.rethrowWriteError(error);
    }
  }

  private rethrowWriteError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException('Phone number already in use');
      }
      if (error.code === 'P2025') {
        throw new UnauthorizedException('User no longer exists');
      }
    }
    throw error;
  }
}
