import React, { useMemo } from "react";
import { Audio, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

/**
 * Plays a short beep sound at the start of each lap.
 * Uses a different tone for the absolute best lap.
 */
export const LapBeep: React.FC<{
  lapStartFrame: number;
  isAbsoluteBest: boolean;
}> = ({ lapStartFrame, isAbsoluteBest }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Generate beep as inline data URI — a short sine wave
  const beepDataUri = useMemo(() => {
    const sampleRate = 44100;
    const duration = isAbsoluteBest ? 0.25 : 0.15;
    const frequency = isAbsoluteBest ? 880 : 660;
    const samples = Math.floor(sampleRate * duration);
    const amplitude = 0.5;

    // Create WAV buffer
    const bufferSize = 44 + samples * 2;
    const buffer = new ArrayBuffer(bufferSize);
    const view = new DataView(buffer);

    // WAV header
    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };
    writeString(0, "RIFF");
    view.setUint32(4, bufferSize - 8, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, samples * 2, true);

    // Sine wave with fade-out
    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate;
      const fadeOut = 1 - i / samples;
      const sample = Math.sin(2 * Math.PI * frequency * t) * amplitude * fadeOut;
      const intSample = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
      view.setInt16(44 + i * 2, intSample, true);
    }

    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return `data:audio/wav;base64,${btoa(binary)}`;
  }, [isAbsoluteBest]);

  // Only render audio near the lap start
  if (frame < lapStartFrame || frame > lapStartFrame + fps) {
    return null;
  }

  return (
    <Audio
      src={beepDataUri}
      startFrom={0}
      volume={0.7}
    />
  );
};
