import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/auth.decorators';
import { VenuesService } from './venues.service';

@ApiTags('venues')
@Public()
@Controller('venues')
export class VenuesController {
  constructor(private readonly venues: VenuesService) {}

  @Get()
  list() {
    return this.venues.list();
  }

  @Get(':venueId')
  get(@Param('venueId', ParseUUIDPipe) venueId: string) {
    return this.venues.snapshot(venueId);
  }
}
