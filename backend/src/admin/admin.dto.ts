import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateVenueDto {
  @ApiProperty({ example: 'Klinik Pratama Harapan' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @ApiProperty({ example: 'Clinic' })
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  category: string;

  @ApiProperty({ example: 'Jl. Mawar No. 3, Tangerang' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  address: string;

  @ApiPropertyOptional({ example: 'Asia/Jakarta', description: 'IANA time zone; queues reset at local midnight' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: 10, description: 'Default minutes per customer until real data exists' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(240)
  avgServiceMinutes?: number;

  @ApiPropertyOptional({ example: 3, description: 'How many customers ahead get an "almost up" alert' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  notifyAhead?: number;
}

export class UpdateVenueDto extends PartialType(CreateVenueDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isOpen?: boolean;
}

export class CreateStaffDto {
  @ApiProperty({ example: 'rina@klinik.id' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Rina' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @ApiProperty()
  @IsUUID()
  venueId: string;
}
