import React from "react";
import { Composition } from "remotion";
import { getVideoMetadata } from "@remotion/media-utils";
import { RaceOverlay } from "./RaceOverlay";
import { RaceOverlayWithVideo } from "./RaceOverlayWithVideo";
import { RaceOverlayProps, RaceOverlayWithVideoProps } from "./types";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition<RaceOverlayProps>
        id="RaceOverlay"
        component={RaceOverlay}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          laps: [
            { count: 0, time: 27.5, absoluteStartTime: 0, absoluteEndTime: 27.5, isBestSoFar: true },
            { count: 1, time: 28.1, absoluteStartTime: 27.5, absoluteEndTime: 55.6, isBestSoFar: false },
            { count: 2, time: 26.8, absoluteStartTime: 55.6, absoluteEndTime: 82.4, isBestSoFar: true },
            { count: 3, time: 27.2, absoluteStartTime: 82.4, absoluteEndTime: 109.6, isBestSoFar: false },
          ],
          totalLaps: 4,
          offsetSeconds: 0,
          driverName: "Test Driver",
          driverPosition: 3,
          totalDrivers: 10,
          raceLapEvents: [
            { driverName: "Ivanov", kart: "5", time: 26.9, absoluteEndTime: 26.9 },
            { driverName: "Test Driver", kart: "3", time: 27.5, absoluteEndTime: 27.5 },
            { driverName: "Petrov", kart: "7", time: 27.8, absoluteEndTime: 27.8 },
            { driverName: "Ivanov", kart: "5", time: 27.1, absoluteEndTime: 54.0 },
            { driverName: "Test Driver", kart: "3", time: 28.1, absoluteEndTime: 55.6 },
            { driverName: "Petrov", kart: "7", time: 26.5, absoluteEndTime: 54.3 },
            { driverName: "Test Driver", kart: "3", time: 26.8, absoluteEndTime: 82.4 },
            { driverName: "Ivanov", kart: "5", time: 27.3, absoluteEndTime: 81.3 },
            { driverName: "Test Driver", kart: "3", time: 27.2, absoluteEndTime: 109.6 },
          ],
        }}
        calculateMetadata={({ props }) => {
          const lastLap = props.laps[props.laps.length - 1];
          const totalDuration = lastLap
            ? lastLap.absoluteEndTime + props.offsetSeconds
            : 10;
          return {
            durationInFrames: Math.ceil(totalDuration * 30),
            fps: 30,
          };
        }}
      />
      <Composition<RaceOverlayWithVideoProps>
        id="RaceOverlayWithVideo"
        component={RaceOverlayWithVideo}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          laps: [
            { count: 0, time: 27.5, absoluteStartTime: 0, absoluteEndTime: 27.5, isBestSoFar: true },
            { count: 1, time: 28.1, absoluteStartTime: 27.5, absoluteEndTime: 55.6, isBestSoFar: false },
          ],
          totalLaps: 2,
          offsetSeconds: 0,
          driverName: "Test Driver",
          driverPosition: 3,
          totalDrivers: 10,
          sourceVideoUrl: "",
          raceLapEvents: [
            { driverName: "Ivanov", kart: "5", time: 26.9, absoluteEndTime: 26.9 },
            { driverName: "Test Driver", kart: "3", time: 27.5, absoluteEndTime: 27.5 },
            { driverName: "Ivanov", kart: "5", time: 27.1, absoluteEndTime: 54.0 },
            { driverName: "Test Driver", kart: "3", time: 28.1, absoluteEndTime: 55.6 },
          ],
        }}
        calculateMetadata={async ({ props }) => {
          if (props.sourceVideoUrl) {
            const { durationInSeconds } = await getVideoMetadata(props.sourceVideoUrl);
            return {
              durationInFrames: Math.ceil(durationInSeconds * 30),
              fps: 30,
            };
          }
          const lastLap = props.laps[props.laps.length - 1];
          const totalDuration = lastLap
            ? lastLap.absoluteEndTime + props.offsetSeconds
            : 10;
          return {
            durationInFrames: Math.ceil(totalDuration * 30),
            fps: 30,
          };
        }}
      />
    </>
  );
};
