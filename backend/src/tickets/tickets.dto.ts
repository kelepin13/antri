import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CallNextDto {
  @ApiProperty({ example: 'Counter 1', description: 'Where the customer should go' })
  @IsString()
  @MaxLength(30)
  @Matches(/\S/, { message: 'counter must not be blank' })
  counter: string;

  @ApiPropertyOptional({ default: true, description: 'Mark the ticket currently at this counter as served first' })
  @IsOptional()
  @IsBoolean()
  completePrevious?: boolean;
}

export class FinishTicketDto {
  @ApiProperty({ enum: ['SERVED', 'NO_SHOW'] })
  @IsIn(['SERVED', 'NO_SHOW'])
  outcome: 'SERVED' | 'NO_SHOW';
}

export class VenueOpenDto {
  @ApiProperty()
  @IsBoolean()
  isOpen: boolean;
}
