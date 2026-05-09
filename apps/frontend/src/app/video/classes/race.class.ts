import { Driver } from "./driver.class";
import { RaceDto } from "../dto/RaceDto";

export class Race {
  drivers: Driver[] = [];
  karts: { [kart: string]: number } = {};
  kartsOrder: string[] = [];

  constructor(public startPitlane?: string[]) {}

  addDriver(driver: Driver) {
    this.drivers.push(driver);
    this.processPitlane();
  }

  getLaps() {
    return this.drivers
      .map((driver) => driver.laps)
      .flat()
      .sort((a, b) => a.getAbsoluteStartTime() - b.getAbsoluteStartTime());
  }

  processPitlane() {
    const pitlane = this.startPitlane!.slice();
    const driversKarts = this.drivers.reduce((acc, driver) => Object.assign(acc, { [driver.index]: driver.startKart }), {}) as {
      [kart: string]: string;
    };
    for (const lap of this.getLaps()) {
      if (lap.isPit()) {
        const kart = driversKarts[lap.driver.index];
        driversKarts[lap.driver.index] = pitlane[0];
        for (let i = 0; i < pitlane.length - 1; i++) {
          pitlane[i] = pitlane[i + 1];
        }
        pitlane[pitlane.length - 1] = kart;
      }
      lap.pitlane = pitlane.slice();
      lap.kart = driversKarts[lap.driver.index];
    }

    // TODO: to refactor
    for (const driver of this.drivers) {
      this.karts[driver.startKart] = 1000;
    }
    for (const lap of this.getLaps()) {
      if (!lap.isCurrentStint()) {
        continue;
      }
      this.karts[lap.kart] = Math.min(this.karts[lap.kart], lap.time);
    }
    console.log(this.karts["1"]);
    this.kartsOrder = Object.keys(this.karts).sort((a, b) => this.karts[a] - this.karts[b]);
    console.log(this.kartsOrder);
  }

  getPitlane() {
    const lastLap = this.getLaps().at(-1)!;
    return lastLap.pitlane;
  }

  toDto(): RaceDto {
    return {
      pitlane: this.startPitlane,
      drivers: this.drivers.map((driver) => driver.toDto()),
    };
  }

  static fromDto(dto: RaceDto) {
    const race = new Race(dto.pitlane);
    dto.drivers.forEach((driver) => race.addDriver(Driver.fromDto(driver, race)));
    return race;
  }
}
