import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { OnboardingDto } from './dto/onboarding.dto';
import { UserEnvelopeDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@ApiTags('onboarding')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Choose a role and complete the profile once' })
  @ApiOkResponse({ type: UserEnvelopeDto })
  @ApiUnauthorizedResponse()
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: OnboardingDto,
  ): Promise<UserEnvelopeDto> {
    return this.usersService.completeOnboarding(user.id, dto);
  }
}
