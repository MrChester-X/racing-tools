import { useRaceStore } from "./store/useRaceStore";
import { useLinkedHeatStore } from "./linked-heat/useLinkedHeatStore";
import { useKartBests } from "./linked-heat/kartBests";

const Colors = ["bg-blue-500", "bg-green-700", "bg-yellow-600", "bg-red-700", "bg-gray-600", "bg-white"];

interface KartProps {
  kart: string;
  isGhost?: boolean;
  onKartClick?: (kartNumber: string) => void;
  teamStartKart?: string;
  stintIndex?: number;
}

function deltaColorClass(deltaMs: number): string {
  if (deltaMs < 300) return "text-emerald-400";
  if (deltaMs < 800) return "text-lime-400";
  if (deltaMs < 1500) return "text-amber-400";
  if (deltaMs < 3000) return "text-orange-400";
  return "text-red-500";
}

function KartDeltaByPhysical({ kart }: { kart: string }) {
  const { kartBest, globalBest } = useKartBests(kart);
  if (kartBest === null || globalBest === null) return null;
  const delta = Math.max(0, kartBest - globalBest);
  const colorClass = delta === 0 ? "text-violet-400" : deltaColorClass(delta);
  return (
    <span className={`text-[9px] leading-none font-mono font-bold mt-0.5 ${colorClass}`}>
      +{(delta / 1000).toFixed(2)}
    </span>
  );
}

const Kart = ({ kart, isGhost = false, onKartClick, teamStartKart, stintIndex }: KartProps) => {
  const { focusKart, setFocusKart, raceData } = useRaceStore();
  const linkedHeat = useLinkedHeatStore((s) => s.heat);

  const kartColors = raceData?.kartColors || {};

  const handleClick = () => {
    if (onKartClick) {
      onKartClick(kart);
    }
  };

  const currentColorIndex = kartColors[kart] ?? 5;
  const currentColor = Colors[currentColorIndex];
  const isWhiteColor = currentColorIndex === 5; // white color

  // +X under a kart = (best on this physical kart by any team/stint) − (global best).
  // Always use the physical-kart variant; stint-only variant was misleading because
  // it ignored other stints/teams that drove the same kart.
  const deltaNode: React.ReactNode = linkedHeat ? <KartDeltaByPhysical kart={kart} /> : null;

  const circle = isGhost ? (
    <div
      onMouseEnter={() => setFocusKart(kart)}
      onMouseLeave={() => setFocusKart(null)}
      onClick={handleClick}
      className={`flex justify-center items-center select-none text-xs w-7 h-7 rounded-full font-bold border-2 border-dashed cursor-grab ${kart === focusKart ? "opacity-90 border-fuchsia-400" : `opacity-70 ${currentColor} border-current`} ${isWhiteColor ? "text-black" : "text-white"}`}
    >
      {kart.padStart(2, "0")}
    </div>
  ) : (
    <div
      onMouseEnter={() => setFocusKart(kart)}
      onMouseLeave={() => setFocusKart(null)}
      onClick={handleClick}
      className={`flex justify-center items-center select-none text-xs w-7 h-7 rounded-full font-bold ${kart === focusKart ? "bg-fuchsia-600" : currentColor} cursor-grab ${isWhiteColor && kart !== focusKart ? "text-black" : "text-white"}`}
    >
      {kart.padStart(2, "0")}
    </div>
  );

  if (!deltaNode) return circle;

  return (
    <div className="flex flex-col items-center">
      {circle}
      {deltaNode}
    </div>
  );
};

export default Kart;
