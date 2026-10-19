import { Composition } from "remotion";

import { Q1, Q1_FRAMES } from "./Q1";

export const Root = () => (
  <Composition id="Q1" component={Q1} durationInFrames={Q1_FRAMES} fps={30} width={1920} height={1080} />
);
