import { ChangeEvent, useEffect, useState } from "react";
import { Race } from "@/app/video/classes/race.class";
import axios from "axios";
import { RaceDto } from "@/app/video/dto/RaceDto";
import KartElement from "@/app/video/KartElement";

const RaceElement = ({ setRace }: { setRace: (race: Race) => void | Race }) => {
  const [elementRace, setElementRace] = useState<Race | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [pitlane, setPitlane] = useState<string[]>([]);

  const handleUrl = (e: ChangeEvent<HTMLInputElement>) => {
    setUrl(e.currentTarget.value);
  };
  const handlePitlane = (e: ChangeEvent<HTMLInputElement>) => {
    console.log(e.currentTarget.value.split(" "));
    setPitlane(e.currentTarget.value.split(" "));
  };

  useEffect(() => {
    const handle = async () => {
      if (!url) {
        return;
      }
      console.log(url);
      console.log(pitlane);
      const raceDto = (
        await axios.get(`http://localhost:3010/parser/race`, {
          params: {
            url,
            pitlane: pitlane.join(" "),
          },
        })
      ).data as RaceDto;
      const race = Race.fromDto(raceDto);
      const newRace = setRace(race);
      if (newRace) {
        setElementRace(newRace);
      } else {
        setElementRace(race);
      }
    };
    const interval = setInterval(() => handle().catch(console.error), 1e3);
    handle().catch(console.error);
    return () => clearInterval(interval);
  }, [url, pitlane]);

  return (
    <div className="flex flex-col gap-5 w-fit border-2 rounded-xl p-5 whitespace-pre-wrap">
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input className="text-black w-[450px]" accept="text" onChange={handleUrl} placeholder="" />
          <div>Ссылка на заезд/трассу</div>
        </div>
        <div className="flex gap-2">
          <input className="text-black w-[450px]" accept="text" onChange={handlePitlane} placeholder="" />
          <div>Карты в питах</div>
        </div>
        {elementRace && (
          <table className="table-auto w-fit mt-3">
            <tbody>
              {elementRace.drivers
                .sort((a, b) => a.getStintBest() - b.getStintBest())
                .map((driver) => (
                  <tr key={driver.index} className="">
                    <td>
                      <div className="flex items-center font-bold">
                        {driver.name} {driver.index}
                      </div>
                    </td>
                    <td>
                      <div className="pl-4 pr-4">
                        {driver.getStintLaps()}l / {driver.getMaxStingLaps()}l
                      </div>
                    </td>
                    <td>
                      <div className="pl-4 pr-4">{driver.laps.at(-1)!.time.toFixed(3)}</div>
                    </td>
                    <td>
                      <div className="pl-4 pr-4">SB {driver.getStintBest().toFixed(3)}</div>
                    </td>
                    {driver.getKarts().map((kart, index) => (
                      <td key={index} className="pl-4 font-light">
                        <KartElement race={elementRace} count={kart} />
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="flex flex-row gap-2 items-center">
        <div>Питы</div>
        {elementRace && elementRace.getPitlane().map((kart, index) => <KartElement race={elementRace} key={index} count={kart} />)}
      </div>
    </div>
  );
};

export default RaceElement;
