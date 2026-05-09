import { Body, Controller, Post } from '@nestjs/common';
import { ImportRaceDto } from './dto/import-race.dto';
import { ImportResult, RacemannService } from './racemann.service';

@Controller('racemann')
export class RacemannController {
  constructor(private readonly service: RacemannService) {}

  @Post('import')
  async import(@Body() dto: ImportRaceDto): Promise<ImportResult> {
    return this.service.importRace(dto.url, dto.name);
  }
}
