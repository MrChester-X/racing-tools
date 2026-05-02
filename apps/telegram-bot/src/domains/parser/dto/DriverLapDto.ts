import { IsInt, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DriverLapDto {
  @ApiProperty({
    description: 'Count of lap',
    example: 10,
  })
  @IsInt()
  count: number;

  @ApiProperty({
    description: 'Time of lap (up to 3 numbers after dot)',
    example: 29.235,
  })
  @IsNumber()
  time: number;

  @ApiProperty({
    description: '[dev] Text after lap',
    required: false,
    example: '29l',
  })
  @IsOptional()
  @IsString()
  stintText?: string;
}
