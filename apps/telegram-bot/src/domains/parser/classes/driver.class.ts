import { DriverLap } from './driver-lap.class';
import { DriverDto } from '../dto/DriverDto';

export class Driver {
  constructor(
    public index: number,
    public name: string,
    public kart: string,
    public laps: DriverLap[] = [],
    public karts: string[] = [],
  ) {}

  addLap(driverLap: DriverLap) {
    this.laps.push(driverLap);
  }

  getSortedLaps(): DriverLap[] {
    return [...this.laps].sort((a, b) => a.time - b.time);
  }

  toDto(): DriverDto {
    return {
      index: this.index,
      name: this.name,
      startKart: this.karts[0],
      karts: this.karts,
      laps: this.laps.map((lap) => lap.toDto()),
    };
  }

  static fromDto(dto: DriverDto) {
    const driver = new Driver(dto.index, dto.name, dto.startKart, [], dto.karts);
    dto.laps.forEach((lap) => driver.addLap(DriverLap.fromDto(lap, driver)));
    return driver;
  }
}
