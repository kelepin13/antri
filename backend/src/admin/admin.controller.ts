import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/auth.decorators';
import { CreateStaffDto, CreateVenueDto, UpdateVenueDto } from './admin.dto';
import { AdminService } from './admin.service';

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  @Post('venues')
  createVenue(@Body() dto: CreateVenueDto) {
    return this.admin.createVenue(dto);
  }

  @Patch('venues/:venueId')
  updateVenue(@Param('venueId', ParseUUIDPipe) venueId: string, @Body() dto: UpdateVenueDto) {
    return this.admin.updateVenue(venueId, dto);
  }

  @Get('staff')
  listStaff() {
    return this.admin.listStaff();
  }

  @Post('staff')
  createStaff(@Body() dto: CreateStaffDto) {
    return this.admin.createStaff(dto);
  }

  @Delete('staff/:staffId')
  @HttpCode(204)
  deleteStaff(@Param('staffId', ParseUUIDPipe) staffId: string) {
    return this.admin.deleteStaff(staffId);
  }
}
