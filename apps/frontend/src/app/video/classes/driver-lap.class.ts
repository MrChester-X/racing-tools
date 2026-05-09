import { Driver } from "./driver.class";
import { DriverLapDto } from "../dto/DriverLapDto";
import { Utils } from "@/utils/Utils";

export class DriverLap {
  constructor(
    public driver: Driver,
    public count: number,
    public time: number,
    public stintText?: string,
  ) {}

  kart!: string;
  pitlane!: string[];

  getAbsoluteStartTime(): number {
    return this.driver.laps.slice(0, this.count).reduce((total, lap) => total + lap.time, 0);
  }

  getAbsoluteEndTime(): number {
    return this.driver.laps.slice(0, this.count + 1).reduce((total, lap) => total + lap.time, 0);
  }

  toText(offset = 0): string {
    const startTimeText = Utils.timeToText(this.getAbsoluteStartTime() + offset, true);
    return `№${this.count + 1} ${Utils.timeToText(this.time)} (на ${startTimeText})`;
  }

  toVideoText(): string {
    return `№${this.count + 1} ${Utils.timeToText(this.time)}`;
  }

  getPreviousLap() {
    const index = this.driver.laps.indexOf(this);
    if (index <= 0) {
      return null;
    }
    return this.driver.laps[index - 1];
  }

  isCurrentStint() {
    const stintIndex = this.driver.laps!.findLastIndex((lap) => lap.isPit());
    return this.count > stintIndex;
  }

  isPit(): boolean {
    // const previousLap = this.getPreviousLap();
    // if (previousLap && previousLap.time >= 120 && previousLap.time <= 130) {
    //   return true;
    // }
    return this.time >= 51 && this.time <= 120;
  }

  toDto(): DriverLapDto {
    return {
      count: this.count,
      time: this.time,
      stintText: this.stintText,
    };
  }

  static fromDto(dto: DriverLapDto, driver: Driver) {
    return new DriverLap(driver, dto.count, dto.time, dto.stintText);
  }
}
