import { IsString, MaxLength, MinLength } from 'class-validator';

export class ImportRaceDto {
  @IsString()
  @MinLength(10)
  @MaxLength(300)
  url!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
}
