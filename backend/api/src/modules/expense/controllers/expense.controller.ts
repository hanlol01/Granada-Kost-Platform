import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RequestWithCorrelationId } from '../../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../../iam/types/iam.types';
import { PropertyService } from '../../property/property.service';
import { CurrentUser } from '../../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { CancelExpenseDto } from '../dto/cancel-expense.dto';
import { CreateExpenseDto } from '../dto/create-expense.dto';
import { ListExpensesQueryDto } from '../dto/list-expenses-query.dto';
import { PayExpenseDto } from '../dto/pay-expense.dto';
import { ReverseExpenseDto } from '../dto/reverse-expense.dto';
import { ExpenseService } from '../services/expense.service';

function key(request: RequestWithCorrelationId): string {
  const raw = request.headers['idempotency-key'];
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  if (!value)
    throw new BadRequestException({
      code: 'IDEMPOTENCY_KEY_REQUIRED',
      message: 'Idempotency-Key wajib diisi untuk perubahan pengeluaran.',
    });
  return value;
}
function context(user: UserAccessContext, request: RequestWithCorrelationId) {
  return {
    actorUserId: user.id,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
    correlationId: request.correlationId,
  };
}

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin')
@RequirePermissions('billing.manage')
@Controller('expenses')
export class ExpenseController {
  constructor(
    private readonly expenses: ExpenseService,
    private readonly properties: PropertyService,
  ) {}

  @Get()
  async list(@CurrentUser() user: UserAccessContext, @Query() query: ListExpensesQueryDto) {
    const propertyIds = query.property_id ? [query.property_id] : user.propertyIds;
    for (const propertyId of propertyIds)
      await this.properties.assertCanReadProperty(user, propertyId);
    return this.expenses.list(propertyIds, query.status, query.limit, query.offset);
  }

  @Get(':expenseId')
  async get(
    @CurrentUser() user: UserAccessContext,
    @Param('expenseId', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const expense = await this.expenses.get(id);
    await this.properties.assertCanReadProperty(user, expense.propertyId);
    return expense;
  }

  @Post()
  async create(
    @CurrentUser() user: UserAccessContext,
    @Body() dto: CreateExpenseDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    await this.properties.assertCanReadProperty(user, dto.property_id);
    return this.expenses.create(
      {
        propertyId: dto.property_id,
        buildingId: dto.building_id,
        workOrderId: dto.work_order_id,
        proofFileId: dto.proof_file_id,
        category: dto.category,
        expenseDate: dto.expense_date,
        amount: dto.amount,
        paymentMethod: dto.payment_method,
        vendorName: dto.vendor_name,
        notes: dto.notes,
        createdByUserId: user.id,
      },
      {
        idempotencyKey: key(request),
        route: '/api/v1/expenses',
        fingerprint: ExpenseService.fingerprint(dto),
        context: context(user, request),
      },
    );
  }

  @Post(':expenseId/submit') submit(
    @CurrentUser() user: UserAccessContext,
    @Param('expenseId') id: string,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.mutate(user, id, request, 'submit', () =>
      this.expenses.submit(id, user.id, this.options(request, user, id, 'submit')),
    );
  }
  @Post(':expenseId/approve') approve(
    @CurrentUser() user: UserAccessContext,
    @Param('expenseId') id: string,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.mutate(user, id, request, 'approve', () =>
      this.expenses.approve(id, user.id, this.options(request, user, id, 'approve')),
    );
  }
  @Post(':expenseId/reject') reject(
    @CurrentUser() user: UserAccessContext,
    @Param('expenseId') id: string,
    @Body() dto: CancelExpenseDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.mutate(user, id, request, 'reject', () =>
      this.expenses.reject(id, user.id, dto.reason, {
        ...this.options(request, user, id, 'reject'),
        fingerprint: ExpenseService.fingerprint(dto),
      }),
    );
  }
  @Post(':expenseId/pay') pay(
    @CurrentUser() user: UserAccessContext,
    @Param('expenseId') id: string,
    @Body() dto: PayExpenseDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.mutate(user, id, request, 'pay', () =>
      this.expenses.pay(id, user.id, dto.payment_method, dto.reference ?? null, {
        ...this.options(request, user, id, 'pay'),
        fingerprint: ExpenseService.fingerprint(dto),
      }),
    );
  }
  @Post(':expenseId/cancel') cancel(
    @CurrentUser() user: UserAccessContext,
    @Param('expenseId') id: string,
    @Body() dto: CancelExpenseDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.mutate(user, id, request, 'cancel', () =>
      this.expenses.cancel(id, user.id, dto.reason, {
        ...this.options(request, user, id, 'cancel'),
        fingerprint: ExpenseService.fingerprint(dto),
      }),
    );
  }
  @Post(':expenseId/reverse') reverse(
    @CurrentUser() user: UserAccessContext,
    @Param('expenseId') id: string,
    @Body() dto: ReverseExpenseDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.mutate(user, id, request, 'reverse', () =>
      this.expenses.reverse(id, user.id, dto.reason, {
        ...this.options(request, user, id, 'reverse'),
        fingerprint: ExpenseService.fingerprint(dto),
      }),
    );
  }
  @Post(':expenseId/archive') archive(
    @CurrentUser() user: UserAccessContext,
    @Param('expenseId') id: string,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.mutate(user, id, request, 'archive', () =>
      this.expenses.archive(id, user.id, {
        ...this.options(request, user, id, 'archive'),
      }),
    );
  }

  private async mutate(
    user: UserAccessContext,
    id: string,
    request: RequestWithCorrelationId,
    _action: string,
    operation: () => Promise<unknown>,
  ) {
    const expense = await this.expenses.get(id);
    await this.properties.assertCanReadProperty(user, expense.propertyId);
    return operation();
  }
  private options(
    request: RequestWithCorrelationId,
    user: UserAccessContext,
    id: string,
    action: string,
  ) {
    return {
      idempotencyKey: key(request),
      route: `/api/v1/expenses/${id}/${action}`,
      fingerprint: ExpenseService.fingerprint({ id, action }),
      context: context(user, request),
    };
  }
}
