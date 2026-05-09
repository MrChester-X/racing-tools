import { DriverLapDto } from "./DriverLapDto";

export class DriverDto {
  index!: number;
  name!: string;
  startKart!: string;
  laps!: DriverLapDto[];
}
