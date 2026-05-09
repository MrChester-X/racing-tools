import { ParsedRaceEvent } from "@/app/mega-secret-pits/types";
import { Utils } from "@/utils/Utils";
import ArrowLeftIcon from "./icons/ArrowLeftIcon";
import Kart from "@/app/mega-secret-pits/Kart";
import { useRaceStore } from "../store/useRaceStore";

interface PitlaneVisualizationProps {
  event: ParsedRaceEvent;
  eventIndex: number;
  onKartClick?: (kartNumber: string) => void;
}

export default function PitlaneVisualization({ event, eventIndex, onKartClick }: PitlaneVisualizationProps) {
  const { raceData } = useRaceStore();

  if (!raceData) return null;

  // Рассчитываем состояние питлейна ДО этого события
  const calculatePitlaneStateBefore = () => {
    const pitlane = structuredClone(raceData.startPitlane);
    const teams: { [startKart: string]: string[] } = {};

    // Инициализируем команды
    raceData.teams.forEach((team) => {
      teams[team.startKart] = [team.startKart];
    });

    // Применяем все события ДО текущего (не включая)
    for (let i = 0; i < eventIndex; i++) {
      const prevEvent = raceData.events[i];
      if (prevEvent.type === "pit") {
        const team = teams[prevEvent.kart];
        if (team) {
          // Процесс пит-стопа
          pitlane[prevEvent.lane].push(team.at(-1) as string);
          team.push(pitlane[prevEvent.lane][0]);
          pitlane[prevEvent.lane].shift();
        }
      } else if (prevEvent.type === "add_kart") {
        // Добавляем карт в указанную позицию или в конец питлейна
        if (prevEvent.position === undefined || prevEvent.position === -1) {
          pitlane[prevEvent.lane].push(prevEvent.kart);
        } else {
          pitlane[prevEvent.lane].splice(prevEvent.position, 0, prevEvent.kart);
        }
      } else if (prevEvent.type === "remove_kart") {
        // Удаляем карт из питлейна
        const index = pitlane[prevEvent.lane].indexOf(prevEvent.kart);
        if (index !== -1) {
          pitlane[prevEvent.lane].splice(index, 1);
        }
      } else if (prevEvent.type === "breakdown") {
        // Заменяем сломанный карт на новый
        if (prevEvent.newKart) {
          const index = pitlane[prevEvent.lane].indexOf(prevEvent.kart);
          if (index !== -1) {
            pitlane[prevEvent.lane][index] = prevEvent.newKart;
          }
        }
      }
    }

    return pitlane;
  };

  const pitlaneBefore = calculatePitlaneStateBefore();

  // Определяем заголовок в зависимости от типа события
  const getVisualizationTitle = () => {
    if (event.type === "pit") {
      return "Питлейн до пит-стопа:";
    } else if (event.type === "add_kart") {
      return "Питлейн до добавления карта:";
    } else if (event.type === "remove_kart") {
      return "Питлейн до удаления карта:";
    } else if (event.type === "breakdown") {
      return "Питлейн до поломки карта:";
    }
    return "Питлейн:";
  };

  return (
    <div className="mt-4 p-3 bg-blue-800/20 rounded-lg border border-blue-700/30">
      <div className="text-blue-200 text-xs font-medium mb-3">{getVisualizationTitle()}</div>

      <div className="space-y-2">
        {pitlaneBefore.map((lane, laneIndex) => (
          <div
            key={laneIndex}
            className={`
              flex items-center gap-3 p-2 rounded transition-all
              ${laneIndex === event.lane ? "bg-yellow-500/20 border border-yellow-500/50" : "bg-blue-700/20"}
            `}
          >
            {/* Название питлейна */}
            <div
              className={`
              font-bold text-sm min-w-[20px]
              ${laneIndex === event.lane ? "text-yellow-200" : "text-blue-200"}
            `}
            >
              {Utils.getLaneLetter(laneIndex)}
            </div>

            {/* Стрелка направления */}
            <ArrowLeftIcon
              className={`
              w-4 h-4 
              ${laneIndex === event.lane ? "text-yellow-300" : "text-blue-300"}
            `}
            />

            {/* Карты в очереди */}
            <div className="flex items-center gap-1 flex-1">
              {lane.length === 0 ? (
                <span className="text-blue-400 text-xs italic">пусто</span>
              ) : (
                lane.map((kart, kartIndex) => (
                  <div key={kartIndex} className="mr-1">
                    <Kart kart={kart} onKartClick={onKartClick} />
                  </div>
                ))
              )}

              {/* Призрачный кружок для въезжающего/добавляемого/заменяемого карта */}
              {laneIndex === event.lane && (
                <div className="mr-1">
                  {event.type === "pit" && event.team && event.pitCount && (
                    <Kart kart={event.team.karts[event.pitCount - 1]} isGhost={true} onKartClick={onKartClick} />
                  )}
                  {event.type === "add_kart" && (
                    <Kart kart={event.kart} isGhost={true} onKartClick={onKartClick} />
                  )}
                  {event.type === "breakdown" && event.newKart && (
                    <Kart kart={event.newKart} isGhost={true} onKartClick={onKartClick} />
                  )}
                  {/* Для remove_kart не показываем призрачный карт, так как он удаляется */}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
