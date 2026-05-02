import React from "react";
import { colors, fonts } from "../styles";

export const LapCounter: React.FC<{
  currentLap: number;
  totalLaps: number;
}> = ({ currentLap, totalLaps }) => {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        backgroundColor: colors.panelBg,
        border: `1px solid ${colors.panelBorder}`,
        borderRadius: 14,
        padding: "12px 24px",
      }}
    >
      <span
        style={{
          fontFamily: fonts.heading,
          fontSize: 18,
          fontWeight: 700,
          color: colors.offWhite,
          letterSpacing: 4,
          textTransform: "uppercase",
          // PERF: textShadow disabled for render speed
          // textShadow: "0 1px 4px rgba(0,0,0,0.9)",
        }}
      >
        LAP
      </span>
      <span
        style={{
          fontFamily: fonts.mono,
          fontSize: 44,
          fontWeight: 800,
          color: colors.white,
          lineHeight: 1,
          // PERF: textShadow disabled for render speed
          // textShadow: "0 2px 8px rgba(0,0,0,0.8)",
        }}
      >
        {currentLap.toString().padStart(2, "0")}
      </span>
      <span
        style={{
          fontFamily: fonts.mono,
          fontSize: 22,
          color: colors.offWhite,
          fontWeight: 600,
          // PERF: textShadow disabled for render speed
          // textShadow: "0 1px 4px rgba(0,0,0,0.9)",
        }}
      >
        /{totalLaps.toString().padStart(2, "0")}
      </span>
    </div>
  );
};
