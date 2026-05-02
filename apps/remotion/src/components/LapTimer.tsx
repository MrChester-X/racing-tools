import React from "react";
import { useCurrentFrame, useVideoConfig, spring } from "remotion";
import { colors, fonts } from "../styles";

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toFixed(2).padStart(5, "0")}`;
};

const SPRING_CONFIG = { damping: 18, stiffness: 120 } as const;

export const LapTimer: React.FC<{
  elapsedInLap?: number;
  frozenTime?: string;
  isAbsoluteBest: boolean;
  lapStartFrame: number;
}> = ({ elapsedInLap, frozenTime, isAbsoluteBest, lapStartFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeIn = spring({
    frame: frame - lapStartFrame,
    fps,
    config: SPRING_CONFIG,
  });

  const timerColor = isAbsoluteBest ? colors.purple : colors.white;
  // const glowColor = isAbsoluteBest ? colors.purpleGlow : "rgba(0,0,0,0.9)";

  const displayTime = frozenTime ?? formatTime(elapsedInLap ?? 0);

  return (
    <div
      style={{
        backgroundColor: colors.panelBg,
        border: `1px solid ${isAbsoluteBest ? "rgba(167, 139, 250, 0.3)" : colors.panelBorder}`,
        borderRadius: 16,
        padding: "14px 40px",
        // position: "relative",
        // overflow: "hidden",
      }}
    >
      {/* PERF: radial-gradient disabled for render speed
      {isAbsoluteBest && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(ellipse at center, ${colors.purpleBg}, transparent 70%)`,
          }}
        />
      )}
      */}
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: 64,
          fontWeight: 800,
          color: timerColor,
          opacity: fadeIn,
          letterSpacing: 3,
          // PERF: textShadow disabled for render speed
          // textShadow: `0 0 24px ${glowColor}, 0 2px 8px rgba(0,0,0,0.9)`,
          // position: "relative",
          lineHeight: 1,
        }}
      >
        {displayTime}
      </div>
    </div>
  );
};
