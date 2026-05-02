import React from "react";
import { AbsoluteFill, OffthreadVideo } from "remotion";
import { RaceOverlayWithVideoProps } from "./types";
import { RaceOverlay } from "./RaceOverlay";

export const RaceOverlayWithVideo: React.FC<RaceOverlayWithVideoProps> = (props) => {
  const { sourceVideoUrl, ...overlayProps } = props;

  return (
    <AbsoluteFill>
      <OffthreadVideo
        src={sourceVideoUrl}
        style={{ width: "100%", height: "100%" }}
      />
      <RaceOverlay {...overlayProps} />
    </AbsoluteFill>
  );
};
