import { IsArray, IsInt, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { DriverLapDto } from './DriverLapDto';

export class DriverDto {
  @ApiProperty({
    description: 'Driver index on site',
    example: 2,
  })
  @IsInt()
  index: number;

  @ApiProperty({
    description: 'Driver name',
    example: 'Kuksenko',
  })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Start kart of race',
    example: '6',
  })
  @IsString()
  startKart: string;

  @ApiProperty({
    description: 'Array of all driver karts in race',
    example: ['6', '2', '11'],
  })
  @IsArray()
  karts: string[];

  @ApiProperty({
    type: [DriverLapDto],
    description: 'Array of driver laps',
  })
  @IsArray()
  @Type(() => DriverLapDto)
  laps: DriverLapDto[];
}
