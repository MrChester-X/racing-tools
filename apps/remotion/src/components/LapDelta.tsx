import React from "react";
import { useCurrentFrame, useVideoConfig, spring } from "remotion";
import { colors, fonts } from "../styles";

export const LapDelta: React.FC<{
  formattedDelta: string | null;
  delta: number | null;
  deltaShowStartFrame: number;
  deltaShowEndFrame: number;
}> = ({ formattedDelta, delta, deltaShowStartFrame, deltaShowEndFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (formattedDelta === null || delta === null) return null;
  if (frame < deltaShowStartFrame || frame >= deltaShowEndFrame) return null;

  const fadeIn = spring({
    frame: frame - deltaShowStartFrame,
    fps,
    config: { damping: 14, stiffness: 100 },
  });

  const isPositive = delta > 0;
  const color = isPositive ? colors.red : colors.green;
  // const glowColor = isPositive
  //   ? "rgba(248, 113, 113, 0.4)"
  //   : "rgba(52, 211, 153, 0.4)";

  return (
    <div
      style={{
        backgroundColor: colors.panelBg,
        border: `1px solid ${colors.panelBorder}`,
        borderRadius: 12,
        padding: "8px 24px",
        opacity: fadeIn,
      }}
    >
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: 32,
          fontWeight: 700,
          color,
          lineHeight: 1,
          // PERF: textShadow disabled for render speed
          // textShadow: `0 0 12px ${glowColor}, 0 2px 6px rgba(0,0,0,0.9)`,
        }}
      >
        {formattedDelta}
      </div>
    </div>
  );
};
