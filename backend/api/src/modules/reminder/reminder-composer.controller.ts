import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { UserAccessContext } from '../iam/types/iam.types';
import { RequestWithCorrelationId } from '../../shared/types/request-with-correlation-id';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import {
  CreateReminderTemplateDto,
  CurrentMonthReminderPreviewDto,
  ReminderHandoffDto,
  CreateReminderAttemptDto,
  ReminderAttemptQueryDto,
  ReminderPropertyQueryDto,
  ReminderWorkspaceQueryDto,
  ResidentReminderPreviewDto,
} from './dto/reminder-composer.dto';
import { ReminderComposerService } from './reminder-composer.service';
import { ReminderShareRateLimiterService } from './reminder-share-rate-limiter.service';
import { ReminderWorkspaceService } from './reminder-workspace.service';
import { ReminderHistoryService } from './reminder-history.service';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin')
@RequirePermissions('billing.manage')
@Controller('admin/reminders')
export class ReminderComposerController {
  constructor(
    private readonly reminders: ReminderComposerService,
    private readonly workspace: ReminderWorkspaceService,
    private readonly history: ReminderHistoryService,
  ) {}
  @Get('workspace') workspaceView(
    @CurrentUser() user: UserAccessContext,
    @Query() query: ReminderWorkspaceQueryDto,
  ) {
    return this.workspace.workspace(user, query.property_id);
  }
  @Get('templates/active') active(
    @CurrentUser() user: UserAccessContext,
    @Query() query: ReminderPropertyQueryDto,
  ) {
    return this.reminders.activeTemplate(user, query.property_id);
  }
  @Post('templates') create(
    @CurrentUser() user: UserAccessContext,
    @Body() dto: CreateReminderTemplateDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.reminders.createVersion(user, dto.property_id, dto, key);
  }
  @Post('invoices/:invoiceId/current-month-preview') currentMonth(
    @CurrentUser() user: UserAccessContext,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Query() query: CurrentMonthReminderPreviewDto,
  ) {
    return this.reminders.currentMonthPreview(user, query.property_id, invoiceId);
  }
  @Post('residents/:residentId/preview') resident(
    @CurrentUser() user: UserAccessContext,
    @Param('residentId', ParseUUIDPipe) residentId: string,
    @Body() dto: ResidentReminderPreviewDto,
  ) {
    return this.reminders.residentPreview(user, dto.property_id, residentId, dto.invoice_ids);
  }
  @Post('residents/:residentId/whatsapp') whatsapp(
    @CurrentUser() user: UserAccessContext,
    @Param('residentId', ParseUUIDPipe) residentId: string,
    @Body() dto: ReminderHandoffDto,
  ) {
    return this.reminders.whatsappHandoff(user, dto.property_id, residentId, dto.invoice_ids);
  }
  @Post('email') email() {
    return this.reminders.emailDisabled();
  }

  @Get('history') historyList(
    @CurrentUser() user: UserAccessContext,
    @Query() query: ReminderAttemptQueryDto,
  ) {
    return this.history.list(user, query);
  }

  @Post('residents/:residentId/attempts') attempt(
    @CurrentUser() user: UserAccessContext,
    @Param('residentId', ParseUUIDPipe) residentId: string,
    @Body() dto: CreateReminderAttemptDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.history.createAttempt(user, dto.property_id, residentId, dto, key);
  }

  @Post('history/:attemptId/archive') archive(
    @CurrentUser() user: UserAccessContext,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Query() query: ReminderPropertyQueryDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.history.archive(user, query.property_id, attemptId, key);
  }
}

@Controller('reminders')
export class ReminderShareController {
  constructor(
    private readonly reminders: ReminderComposerService,
    private readonly rateLimiter: ReminderShareRateLimiterService,
  ) {}

  @Get('invoice-share/:token')
  @Header('Cache-Control', 'private, no-store')
  async invoice(@Param('token') token: string, @Req() request: RequestWithCorrelationId) {
    await this.rateLimiter.assertAllowed(request.ip);
    const document = await this.reminders.sharedInvoiceDocument(token);
    return new StreamableFile(document.content, {
      type: 'application/pdf',
      disposition: `attachment; filename="${document.filename}"`,
      length: document.content.length,
    });
  }
}
