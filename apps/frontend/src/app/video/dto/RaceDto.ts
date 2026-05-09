import { DriverDto } from "@/app/video/dto/DriverDto";

export class RaceDto {
  pitlane?: string[];
  drivers!: DriverDto[];
}
