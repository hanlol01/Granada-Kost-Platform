import { Injectable, NotFoundException } from '@nestjs/common';
import { NOTIFICATION_TEMPLATES, NotificationTemplateCode } from '../constants/notification.constants';
import { NotificationTemplateVariables, RenderedNotificationTemplate } from '../types/notification.types';

@Injectable()
export class NotificationTemplateRenderer {
  render(code: NotificationTemplateCode, variables: NotificationTemplateVariables): RenderedNotificationTemplate {
    const template = NOTIFICATION_TEMPLATES[code];
    if (!template) {
      throw new NotFoundException({ code: 'NOTIFICATION_TEMPLATE_NOT_FOUND', message: 'Notification template not found' });
    }

    const title = this.interpolate(template.title, variables);
    const body = this.interpolate(template.body, variables);
    const subject = template.subject ? this.interpolate(template.subject, variables) : undefined;
    const htmlContent = template.html ? this.interpolate(template.html, variables) : undefined;

    return {
      title,
      body,
      subject,
      htmlContent,
      textContent: body,
    };
  }

  private interpolate(template: string, variables: NotificationTemplateVariables): string {
    return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
      const value = variables[key];
      return value === null || value === undefined ? '' : String(value);
    });
  }
}
