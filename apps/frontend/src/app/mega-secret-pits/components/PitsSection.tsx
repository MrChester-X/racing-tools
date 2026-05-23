import { useEffect } from "react";
import Kart from "@/app/mega-secret-pits/Kart";
import { Utils } from "@/utils/Utils";
import { useRaceStore } from "../store/useRaceStore";
import { usePitlaneDisplayStore } from "../store/usePitlaneDisplayStore";

interface PitsSectionProps {
  onKartClick?: (kartNumber: string) => void;
}

const EXIT_OPTIONS: { id: "left" | "right"; label: string }[] = [
  { id: "left", label: "← Слева" },
  { id: "right", label: "Справа →" },
];

const ORDER_OPTIONS: { id: "top-down" | "bottom-up"; label: string }[] = [
  { id: "top-down", label: "A сверху" },
  { id: "bottom-up", label: "A снизу" },
];

export default function PitsSection({ onKartClick }: PitsSectionProps) {
  const { pitlane } = useRaceStore();
  const exitDirection = usePitlaneDisplayStore((s) => s.exitDirection);
  const order = usePitlaneDisplayStore((s) => s.order);
  const setExitDirection = usePitlaneDisplayStore((s) => s.setExitDirection);
  const setOrder = usePitlaneDisplayStore((s) => s.setOrder);
  const hydrate = usePitlaneDisplayStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (!pitlane) return null;

  const isExitRight = exitDirection === "right";

  // Индексы питлейнов в порядке отображения. Сами данные не мутируем —
  // только порядок их обхода для рендера.
  const laneIndices = pitlane.map((_, i) => i);
  if (order === "bottom-up") laneIndices.reverse();

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
        {laneIndices.map((index) => {
          const row = pitlane[index];
          // При выезде справа карты идут в обратном порядке (последний в очереди — слева, первый на выезд — справа).
          const displayKarts = isExitRight ? [...row].reverse() : row;
          const label = (
            <div className="text-white font-bold text-lg min-w-[60px] flex items-center gap-2">
              {isExitRight ? (
                <>
                  <span className="text-gray-400">→</span>
                  <span className="text-blue-300">Питлейн</span>
                  <span className="text-yellow-300">{Utils.getLaneLetter(index)}</span>
                </>
              ) : (
                <>
                  <span className="text-blue-300">Питлейн</span>
                  <span className="text-yellow-300">{Utils.getLaneLetter(index)}</span>
                  <span className="text-gray-400">←</span>
                </>
              )}
            </div>
          );
          const karts = (
            <div className="flex flex-row gap-4 items-center">
              {displayKarts.map((kart, kartIndex) => (
                <Kart key={kartIndex} kart={kart} onKartClick={onKartClick} />
              ))}
            </div>
          );
          return (
            <div
              key={index}
              className="flex flex-row gap-4 items-center p-3 bg-white/5 rounded-lg border border-white/10"
            >
              {isExitRight ? (
                <>
                  {karts}
                  {label}
                </>
              ) : (
                <>
                  {label}
                  {karts}
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-gray-500">Выезд:</span>
          <div className="flex items-center bg-white/[0.03] rounded-lg p-0.5 border border-white/[0.06] flex-wrap">
            {EXIT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setExitDirection(opt.id)}
                className={`px-3 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  exitDirection === opt.id
                    ? "bg-white/[0.08] text-white"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-gray-500">Порядок:</span>
          <div className="flex items-center bg-white/[0.03] rounded-lg p-0.5 border border-white/[0.06] flex-wrap">
            {ORDER_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setOrder(opt.id)}
                className={`px-3 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  order === opt.id
                    ? "bg-white/[0.08] text-white"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
