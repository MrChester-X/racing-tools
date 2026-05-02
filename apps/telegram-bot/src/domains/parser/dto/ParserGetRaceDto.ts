import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ParserGetRaceDto {
  @ApiProperty({
    description: 'URL of race (timing.batyrshin.name or miks.racemann.com)',
    example: 'https://timing.batyrshin.name/tracks/premium/heats/75818',
    // examples: [
    //   'https://timing.batyrshin.name/tracks/premium/heats/75818',
    //   'https://timing.batyrshin.name/tracks/premium/heats',
    //   'https://miks.racemann.com/Race/id/fa6f0d08-1cca-4d14-938b-92efd272a904',
    // ],
  })
  @IsString()
  url: string;

  @ApiProperty({
    description: 'Start pitlane (split by whitespace)',
    example: '11 6',
    required: false,
  })
  @IsString()
  @IsOptional()
  pitlane?: string;
}
