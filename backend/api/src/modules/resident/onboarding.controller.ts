import { Body, Controller, Headers, Post, Req, UseGuards } from '@nestjs/common';
import { RequestWithCorrelationId } from '../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../iam/types/iam.types';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import { CommitOnboardingDto } from './dto/commit-onboarding.dto';
import { OnboardingService } from './onboarding.service';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin')
@RequirePermissions('resident.manage')
@Controller('residents')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}
  @Post('onboard')
  async commit(
    @CurrentUser() user: UserAccessContext,
    @Body() dto: CommitOnboardingDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return {
      data: await this.onboarding.commit(user, dto, key, {
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        correlationId: request.correlationId,
      }),
    };
  }
}
