import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { RequestWithCorrelationId } from '../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../iam/types/iam.types';
import { PropertyService } from '../property/property.service';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import { CompleteBookingLeadDto } from './dto/complete-booking-lead.dto';
import { CancelBookingLeadPaymentCommitmentDto } from './dto/cancel-booking-lead-payment-commitment.dto';
import { BookingLeadCompletionService } from './booking-lead-completion.service';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin')
@Controller('booking-leads')
export class BookingLeadCompletionController {
  constructor(
    private readonly completions: BookingLeadCompletionService,
    private readonly properties: PropertyService,
  ) {}

  @Post(':leadId/complete')
  @RequirePermissions('room.manage')
  async complete(
    @CurrentUser() user: UserAccessContext,
    @Param('leadId', new ParseUUIDPipe({ version: '4' })) leadId: string,
    @Body() dto: CompleteBookingLeadDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    await this.properties.assertCanReadProperty(user, dto.property_id);
    return this.completions.complete(leadId, dto, user.id, key, request.correlationId);
  }

  @Post(':leadId/cancel-payment-commitment')
  @RequirePermissions('room.manage')
  async cancelPaymentCommitment(
    @CurrentUser() user: UserAccessContext,
    @Param('leadId', new ParseUUIDPipe({ version: '4' })) leadId: string,
    @Body() dto: CancelBookingLeadPaymentCommitmentDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    await this.properties.assertCanReadProperty(user, dto.property_id);
    return this.completions.cancelPaymentCommitment(
      leadId,
      dto,
      user.id,
      key,
      request.correlationId,
    );
  }

  @Get(':leadId/rental-context')
  @RequirePermissions('resident.read')
  async context(
    @CurrentUser() user: UserAccessContext,
    @Param('leadId', new ParseUUIDPipe({ version: '4' })) leadId: string,
    @Query('property_id', new ParseUUIDPipe({ version: '4' })) propertyId: string,
  ) {
    await this.properties.assertCanReadProperty(user, propertyId);
    return this.completions.context(leadId, propertyId);
  }

  @Get(':leadId/progress')
  @RequirePermissions('room.read')
  async progress(
    @CurrentUser() user: UserAccessContext,
    @Param('leadId', new ParseUUIDPipe({ version: '4' })) leadId: string,
    @Query('property_id', new ParseUUIDPipe({ version: '4' })) propertyId: string,
  ) {
    await this.properties.assertCanReadProperty(user, propertyId);
    return this.completions.progress(leadId, propertyId);
  }

  @Get(':leadId/completion-quote')
  @RequirePermissions('room.manage')
  async quote(
    @CurrentUser() user: UserAccessContext,
    @Param('leadId', new ParseUUIDPipe({ version: '4' })) leadId: string,
    @Query('property_id', new ParseUUIDPipe({ version: '4' })) propertyId: string,
    @Query('start_date') startDate: string,
    @Query('term_months', new ParseIntPipe()) termMonths: number,
  ) {
    await this.properties.assertCanReadProperty(user, propertyId);
    return this.completions.quote(leadId, propertyId, startDate, termMonths);
  }

  @Get(':leadId/payment-commitment-receipt/document')
  @RequirePermissions('room.read')
  @Header('Cache-Control', 'private, no-store')
  async paymentCommitmentReceiptDocument(
    @CurrentUser() user: UserAccessContext,
    @Param('leadId', new ParseUUIDPipe({ version: '4' })) leadId: string,
    @Query('property_id', new ParseUUIDPipe({ version: '4' })) propertyId: string,
  ) {
    await this.properties.assertCanReadProperty(user, propertyId);
    const document = await this.completions.paymentCommitmentReceiptDocument(leadId, propertyId);
    return new StreamableFile(document.content, {
      type: 'application/pdf',
      disposition: `attachment; filename="${document.filename}"`,
      length: document.content.length,
    });
  }

  @Get(':leadId/cancellation-receipt/document')
  @RequirePermissions('room.read')
  @Header('Cache-Control', 'private, no-store')
  async cancellationReceiptDocument(
    @CurrentUser() user: UserAccessContext,
    @Param('leadId', new ParseUUIDPipe({ version: '4' })) leadId: string,
    @Query('property_id', new ParseUUIDPipe({ version: '4' })) propertyId: string,
  ) {
    await this.properties.assertCanReadProperty(user, propertyId);
    const document = await this.completions.cancellationReceiptDocument(leadId, propertyId);
    return new StreamableFile(document.content, {
      type: 'application/pdf',
      disposition: `attachment; filename="${document.filename}"`,
      length: document.content.length,
    });
  }
}
