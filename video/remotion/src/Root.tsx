import { Composition, Still } from "remotion";

import { CRYPTO_LIVE_FRAMES, CryptoLive } from "./CryptoLive";
import { Q1, Q1_FRAMES } from "./Q1";
import { RecordCard } from "./RecordCard";

export const Root = () => (
  <>
    <Composition id="Q1" component={Q1} durationInFrames={Q1_FRAMES} fps={30} width={1920} height={1080} />
    <Composition id="CryptoLive" component={CryptoLive} durationInFrames={CRYPTO_LIVE_FRAMES} fps={30} width={1920} height={1080} />
    <Still id="RecordCard" component={RecordCard} width={1600} height={900} />
  </>
);
