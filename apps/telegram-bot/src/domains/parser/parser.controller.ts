import { Controller, Get, Query } from '@nestjs/common';
import { ParserService } from './parser.service';
import { ParserGetRaceDto } from './dto/ParserGetRaceDto';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RaceDto } from './dto/RaceDto';

@ApiTags('Parser')
@Controller('parser')
export class ParserController {
  constructor(private readonly parserService: ParserService) {}

  @Get('race')
  @ApiOperation({ summary: 'Parse race url' })
  @ApiOkResponse({ type: RaceDto })
  async get(@Query() dto: ParserGetRaceDto) {
    if (ParserService.isRacemannUrl(dto.url)) {
      const raceObj = await this.parserService.parseRacemannRace(dto.url);
      return raceObj.race.toDto();
    }
    const pitlane = dto.pitlane?.split(' ');
    const raceUrl = dto.url.includes('heats/') ? dto.url : await this.parserService.findUrl(dto.url);
    const raceObj = await this.parserService.parsePage(raceUrl, undefined, pitlane);
    const race = raceObj.race;
    return race.toDto();
  }
}
