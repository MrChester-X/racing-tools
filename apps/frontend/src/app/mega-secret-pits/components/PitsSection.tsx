import Kart from "@/app/mega-secret-pits/Kart";
import { Utils } from "@/utils/Utils";
import { useRaceStore } from "../store/useRaceStore";

interface PitsSectionProps {
  onKartClick?: (kartNumber: string) => void;
}

export default function PitsSection({ onKartClick }: PitsSectionProps) {
  const { pitlane } = useRaceStore();

  if (!pitlane) return null;
  return (
    <section className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 shadow-2xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-6 h-6 bg-gradient-to-r from-blue-500 to-cyan-400 rounded-lg flex items-center justify-center">
          🏎️
        </div>
        <h2 className="text-xl font-bold text-white">Питлейн</h2>
        <div className="flex-1 h-px bg-gradient-to-r from-white/20 to-transparent"></div>
      </div>
      <div className="flex flex-col gap-4">
        {pitlane.map((row, index) => (
          <div key={index} className="flex flex-row gap-4 items-center p-3 bg-white/5 rounded-lg border border-white/10">
            <div className="text-white font-bold text-lg min-w-[60px] flex items-center gap-2">
              <span className="text-blue-300">Питлейн</span>
              <span className="text-yellow-300">{Utils.getLaneLetter(index)}</span>
              <span className="text-gray-400">←</span>
            </div>
            {row.map((kart, index) => (
              <Kart key={index} kart={kart} onKartClick={onKartClick} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
