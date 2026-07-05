import { Body, Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { RequestWithCorrelationId } from '../../shared/types/request-with-correlation-id';
import { PaymentGatewayService } from './payment-gateway.service';

@Controller('payment-gateways/midtrans')
export class PaymentGatewayWebhookController {
  constructor(private readonly paymentGateway: PaymentGatewayService) {}

  @Post('webhook')
  @HttpCode(200)
  handleMidtransWebhook(
    @Req() request: RequestWithCorrelationId,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
  ) {
    return this.paymentGateway.handleMidtransWebhook(
      {
        headers,
        rawBody: request.rawBody ?? Buffer.from(JSON.stringify(body ?? {})),
        body,
      },
      {
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        correlationId: request.correlationId,
      },
    );
  }
}
