import { Race } from "@/app/video/classes/race.class";

const kartsMap = {
  // "1": "#999900",
  // "2": "#003366",
  // "3": "#660000",
  // "4": "#660000",
  // "5": "#999900",
  // "6": "#003300",
  // "7": "#660000",
  // "8": "#999900",
  // "9": "#660000",
  // "10": "#003300",
  // "11": "#003366",
  // "12": "#003366",
  // "13": "#660000",
  // "14": "#999900",
  // "15": "#999900",
  // "16": "#003366",
  "8": "#003300",
  "4": "#003300",
  "15": "#003300",
  "20": "#003300",
  "9": "#003300",
  "10": "#660000",
  "17": "#660000",
  "12": "#660000",
  "1": "#660000",
  // "11": "#660000",
  "14": "#999900",
  "3": "#999900",
  "24": "#999900",
  "25": "#999900",
  "11": "#999900",
  "38": "#999900",
} as { [kart: string]: string };

const KartElement = ({ race, count }: { race: Race; count: string }) => {
  const getKartColor = (kart: string) => {
    if (!race.kartsOrder) {
      return "#003366";
    }
    const index = race.kartsOrder.indexOf(kart);
    if (index < 0) {
      return "#003366";
    }
    if (index <= 4) {
      return "#003300";
    }
    if (index <= 9) {
      return "#999900";
    }
    return "#660000";
  };

  return (
    <div className="flex gap-1">
      <div style={{ backgroundColor: kartsMap[count] || "#003366" }} className={`flex justify-center items-center w-8 h-8 rounded-full`}>
        {count}
      </div>
      {/*<div*/}
      {/*  style={{ backgroundColor: getKartColor(count) || "#003366" }}*/}
      {/*  className={`flex justify-center items-center w-8 h-8 rounded-full`}*/}
      {/*>*/}
      {/*  {count}*/}
      {/*</div>*/}
    </div>
  );
};

export default KartElement;
