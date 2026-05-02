import { Driver } from './driver.class';
import { RaceDto } from '../dto/RaceDto';

export class Race {
  drivers: Driver[] = [];

  constructor(public pitlane?: string[][], public raceName?: string) {}

  addDriver(driver: Driver) {
    this.drivers.push(driver);
  }

  toDto(): RaceDto {
    return {
      raceName: this.raceName,
      pitlane: this.pitlane?.[0],
      drivers: this.drivers.map((driver) => driver.toDto()),
    };
  }

  static fromDto(dto: RaceDto) {
    const race = new Race(dto.pitlane && [dto.pitlane], dto.raceName);
    dto.drivers.forEach((driver) => race.addDriver(Driver.fromDto(driver)));
    return race;
  }
}
