import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CompanyId } from '../common/decorators/company-id.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { AttendanceService } from './attendance.service';
import { KioskPunchDto } from './dto/attendance.dto';

/**
 * Public-facing kiosk punch surface (point 19). Reachable by ANY authenticated
 * employee (only TenantGuard — no manager `attendance` permission), so staff can
 * clock themselves in by scanning the store QR. The employee is resolved from
 * the auth token; the QR token + registered device are validated server-side.
 */
@ApiTags('kiosk')
@ApiBearerAuth()
@Controller('attendance/kiosk')
@UseGuards(TenantGuard)
export class KioskController {
  constructor(private readonly attendance: AttendanceService) {}

  @Post('punch')
  punch(@CompanyId() companyId: string, @Body() dto: KioskPunchDto) {
    return this.attendance.kioskPunch(companyId, dto);
  }
}
