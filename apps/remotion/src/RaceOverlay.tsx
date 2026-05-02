import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { RaceOverlayProps } from "./types";
import { useRaceData, findActiveLapIndex, lastCompletedLapIndex, useBestSoFar, findBestSoFarAtFrame, PrecomputedLap } from "./hooks/useRaceData";
import { LapCounter } from "./components/LapCounter";
import { LapTimer } from "./components/LapTimer";
import { LapHistory } from "./components/LapHistory";
import { LapDelta } from "./components/LapDelta";
import { LapBeep } from "./components/LapBeep";
import { BestSoFar } from "./components/BestSoFar";

export const RaceOverlay: React.FC<RaceOverlayProps> = ({
  laps,
  totalLaps,
  offsetSeconds,
  raceLapEvents,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const raceData = useRaceData(laps, offsetSeconds);
  const bestSoFarTimeline = useBestSoFar(raceLapEvents, offsetSeconds);
  const lapIndex = findActiveLapIndex(raceData.precomputedLaps, frame);

  if (lapIndex === -1) {
    return <AbsoluteFill />;
  }

  const pl = raceData.precomputedLaps[lapIndex];
  const timeSeconds = frame / fps;
  const elapsedInLap = timeSeconds - offsetSeconds - pl.absoluteStartTime;

  // Check freeze: are we in the first 3s of this lap AND there's a previous lap?
  let frozenLap: PrecomputedLap | null = null;
  if (lapIndex > 0) {
    const prevLap = raceData.precomputedLaps[lapIndex - 1];
    if (frame < prevLap.freezeEndFrame) {
      frozenLap = prevLap;
    }
  }

  // History: completed laps + 1 upcoming, or just upcoming during first lap
  const completedIdx = lastCompletedLapIndex(raceData.precomputedLaps, frame);
  const historyEntries = raceData.historyAtLap.get(completedIdx) ?? null;

  return (
    <AbsoluteFill>
      {/* Top left — Lap counter */}
      <div style={{ position: "absolute", top: 32, left: 32 }}>
        <LapCounter currentLap={pl.count + 1} totalLaps={totalLaps} />
      </div>

      {/* Top center — Timer + Delta below */}
      <div
        style={{
          position: "absolute",
          top: 32,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
        }}
      >
        {frozenLap ? (
          <>
            <LapTimer
              frozenTime={frozenLap.formattedTime}
              isAbsoluteBest={frozenLap.isBest}
              lapStartFrame={frozenLap.startFrame}
            />
            <LapDelta
              formattedDelta={frozenLap.formattedDelta}
              delta={frozenLap.delta}
              deltaShowStartFrame={frozenLap.freezeStartFrame}
              deltaShowEndFrame={frozenLap.freezeEndFrame}
            />
          </>
        ) : (
          <LapTimer
            elapsedInLap={elapsedInLap}
            isAbsoluteBest={pl.isBest}
            lapStartFrame={pl.startFrame}
          />
        )}
      </div>

      {/* Top right — Lap history */}
      <div style={{ position: "absolute", top: 32, right: 32 }}>
        <LapHistory entries={historyEntries} />
      </div>

      {/* Bottom right — Best so far */}
      {(() => {
        const bestEntry = findBestSoFarAtFrame(bestSoFarTimeline, frame);
        return bestEntry ? (
          <div style={{ position: "absolute", bottom: 32, right: 32 }}>
            <BestSoFar entry={bestEntry} />
          </div>
        ) : null;
      })()}

      {/* Beep sounds at each lap start */}
      {raceData.beeps.map((b) => (
        <LapBeep
          key={b.lapCount}
          lapStartFrame={b.startFrame}
          isAbsoluteBest={b.isBest}
        />
      ))}
    </AbsoluteFill>
  );
};
