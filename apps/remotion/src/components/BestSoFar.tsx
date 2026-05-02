import React from "react";
import { useCurrentFrame, useVideoConfig, spring } from "remotion";
import { BestSoFarEntry } from "../hooks/useRaceData";
import { colors, fonts } from "../styles";

export const BestSoFar: React.FC<{
  entry: BestSoFarEntry;
}> = ({ entry }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeIn = spring({
    frame: frame - entry.fromFrame,
    fps,
    config: { damping: 15, stiffness: 100 },
  });

  return (
    <div
      style={{
        backgroundColor: colors.panelBg,
        border: `1px solid ${colors.panelBorder}`,
        borderRadius: 14,
        padding: "12px 20px",
        opacity: fadeIn,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div
        style={{
          fontFamily: fonts.heading,
          fontSize: 13,
          fontWeight: 700,
          color: colors.offWhite,
          letterSpacing: 3,
          textTransform: "uppercase",
          marginBottom: 2,
        }}
      >
        BEST SO FAR
      </div>
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: 28,
          fontWeight: 700,
          color: colors.purple,
          lineHeight: 1,
        }}
      >
        {entry.formattedTime}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span
          style={{
            fontFamily: fonts.heading,
            fontSize: 16,
            fontWeight: 600,
            color: colors.offWhite,
            lineHeight: 1,
          }}
        >
          {entry.driverName}
        </span>
        <span
          style={{
            fontFamily: fonts.heading,
            fontSize: 11,
            fontWeight: 800,
            color: colors.gray,
            letterSpacing: 2,
            padding: "3px 8px",
            borderRadius: 6,
            backgroundColor: "rgba(255, 255, 255, 0.08)",
            border: `1px solid ${colors.panelBorder}`,
          }}
        >
          K{entry.kart}
        </span>
      </div>
    </div>
  );
};
