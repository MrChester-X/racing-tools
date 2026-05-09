"use client";

import { ChangeEvent, useState } from "react";
import RaceElement from "@/app/video/RaceElement";
import { Race } from "@/app/video/classes/race.class";

export default function Video() {
  const [file, setFile] = useState<File | null>(null);
  const [checked, setChecked] = useState<boolean>(false);
  const [, setRace] = useState<Race | null>(null);
  const [secondRace, setSecondRace] = useState<Race | null>(null);

  const handleInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files.length) {
      return;
    }
    setFile(e.target.files[0]);
  };
  const handleButton = () => {
    console.log("клик");
  };

  return (
    <div className="flex flex-col gap-10">
      <RaceElement
        setRace={
          !secondRace
            ? setRace
            : (oldRace) => {
                const kartsMap = secondRace.drivers.reduce((acc, driver) => {
                  const karts = driver.getKarts();
                  return Object.assign(acc, { [karts[0]]: karts.at(-1) });
                }, {}) as { [kart: string]: string };
                oldRace.drivers.forEach((driver) => (driver.startKart = kartsMap[driver.startKart]));
                oldRace.processPitlane();
                console.log("changed", kartsMap);
                return oldRace;
              }
        }
      />
      <div>
        <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} /> Учитывать предыдущий заезд
        {checked && <RaceElement setRace={setSecondRace} />}
      </div>
      <input type="file" accept="video/mp4" onChange={handleInput} />
      {file?.name}
      <button className="bg-white text-blue-600 rounded-xl p-5 w-[400px]" onClick={handleButton}>
        Жеска нагрузить пк Платона шоб не втыкал
      </button>
    </div>
  );
}
