import {
    Controller,
    Get,
    Patch,
    Param,
    UseGuards,
    Req,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '@app/common';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
    constructor(private readonly notificationsService: NotificationsService) { }

    @Get()
    async getNotifications(@Req() req: any) {
        return this.notificationsService.getByUserId(req.user.id);
    }

    @Get('unread-count')
    async getUnreadCount(@Req() req: any) {
        const count = await this.notificationsService.getUnreadCount(req.user.id);
        return { count };
    }

    @Patch(':id/read')
    async markAsRead(@Req() req: any, @Param('id') id: string) {
        await this.notificationsService.markAsRead(req.user.id, id);
        return { message: 'Marked as read' };
    }

    @Patch('read-all')
    async markAllAsRead(@Req() req: any) {
        await this.notificationsService.markAllAsRead(req.user.id);
        return { message: 'All notifications marked as read' };
    }
}
