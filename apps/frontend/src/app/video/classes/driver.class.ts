import { DriverLap } from "./driver-lap.class";
import { DriverDto } from "../dto/DriverDto";
import { Race } from "@/app/video/classes/race.class";

export class Driver {
  constructor(
    public race: Race,
    public index: number,
    public name: string,
    public startKart: string,
    public laps: DriverLap[] = [],
  ) {}

  getStintLaps() {
    return this.laps.length - this.laps.findLastIndex((lap) => lap.isPit()) - 1;
  }

  getMaxStingLaps() {
    const laps = this.laps.length;
    const stintLaps = this.getStintLaps();
    const totalLaps = 145;
    const minStintLaps = 0;
    const stintsMaxCount = 6;
    const stintsCount = this.laps.filter((lap) => lap.isPit()).length + 1;
    const maxStintLaps = totalLaps - (laps - stintLaps) - (stintsMaxCount - stintsCount) * minStintLaps;
    return maxStintLaps;
  }

  getStintBest() {
    return Math.min(...this.laps.filter(lap => lap.isCurrentStint()).map(lap => lap.time));
  }

  getKarts() {
    return this.laps.map((lap) => lap.kart).filter((kart, index, karts) => kart != karts[index + 1]);
  }

  addLaps(driverLaps: DriverLap | DriverLap[]) {
    driverLaps = Array.isArray(driverLaps) ? driverLaps : [driverLaps];
    this.laps = this.laps.concat(driverLaps);
  }

  getSortedLaps(): DriverLap[] {
    return [...this.laps].sort((a, b) => a.time - b.time);
  }

  toDto(): DriverDto {
    return {
      index: this.index,
      name: this.name,
      startKart: this.startKart,
      laps: this.laps.map((lap) => lap.toDto()),
    };
  }

  static fromDto(dto: DriverDto, race: Race) {
    const driver = new Driver(race, dto.index, dto.name, dto.startKart);
    const laps = dto.laps.map((lap) => DriverLap.fromDto(lap, driver));
    driver.addLaps(laps);
    race.processPitlane();
    return driver;
  }
}
