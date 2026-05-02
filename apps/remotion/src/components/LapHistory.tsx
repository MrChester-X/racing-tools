import React from "react";
import { useCurrentFrame, useVideoConfig, spring } from "remotion";
import { HistoryEntry } from "../hooks/useRaceData";
import { colors, fonts } from "../styles";

export const LapHistory: React.FC<{
  entries: HistoryEntry[] | null;
}> = ({ entries }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (!entries || entries.length === 0) return null;

  return (
    <div
      style={{
        backgroundColor: colors.panelBg,
        border: `1px solid ${colors.panelBorder}`,
        borderRadius: 14,
        padding: "12px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        width: 300,
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
        HISTORY
      </div>
      {entries.map((entry) => {
        const slideIn = spring({
          frame: frame - entry.entryFrame,
          fps,
          config: { damping: 15, stiffness: 100 },
        });

        return (
          <div
            key={entry.count}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              opacity: Math.min(slideIn, entry.upcoming ? 0.4 : 1),
              height: 32,
            }}
          >
            <span
              style={{
                fontFamily: fonts.mono,
                fontSize: 18,
                fontWeight: 700,
                color: colors.offWhite,
                width: 36,
              }}
            >
              {entry.formattedLabel}
            </span>
            <span
              style={{
                fontFamily: fonts.mono,
                fontSize: 24,
                fontWeight: 700,
                color: entry.isBest ? colors.purple : colors.offWhite,
                minWidth: 120,
              }}
            >
              {entry.formattedTime}
            </span>
            <span
              style={{
                width: 70,
                textAlign: "left",
                flexShrink: 0,
              }}
            >
              {entry.isBest ? (
                <span
                  style={{
                    fontFamily: fonts.heading,
                    fontSize: 11,
                    fontWeight: 800,
                    color: colors.purple,
                    letterSpacing: 2,
                    padding: "3px 8px",
                    borderRadius: 6,
                    backgroundColor: colors.purpleBg,
                    border: "1px solid rgba(167, 139, 250, 0.25)",
                  }}
                >
                  BEST
                </span>
              ) : entry.formattedDelta !== null ? (
                <span
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 16,
                    fontWeight: 700,
                    color: entry.delta! > 0 ? colors.red : colors.green,
                  }}
                >
                  {entry.formattedDelta}
                </span>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
};
