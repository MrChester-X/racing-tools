import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { Driver } from './classes/driver.class';
import { DriverLap } from './classes/driver-lap.class';
import { Utils } from '../utils/utils.class';
import { Race } from './classes/race.class';

@Injectable()
export class ParserService {
  static isRacemannUrl(url: string): boolean {
    return /racemann\.com\/race\/id\//i.test(url);
  }

  async parseRacemannRace(url: string) {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/race\/id\/([0-9a-f-]{36})/i);
    if (!match) {
      throw new Error('Не удалось извлечь raceId из ссылки');
    }
    const raceId = match[1];

    const { data } = await axios.post(
      `${parsed.origin}/race/GetRaceStartData`,
      { raceId },
      { headers: { 'Content-Type': 'application/json' } },
    );

    const raceName: string = data?.raceSettings?.RaceName?.trim() || '';

    const comps: any[] = Array.isArray(data?.comps) ? data.comps : [];
    const lastLaps: any[] = Array.isArray(data?.lastLaps) ? data.lastLaps : [];

    const lapsByRn = new Map<string, any[]>();
    for (const lap of lastLaps) {
      const rn = String(lap.rn ?? '');
      if (!rn) continue;
      if (!lapsByRn.has(rn)) lapsByRn.set(rn, []);
      lapsByRn.get(rn)!.push(lap);
    }

    const activeComps = comps
      .filter((c) => (c?.lc ?? 0) > 0 && lapsByRn.has(String(c.rn ?? '')))
      .sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0));

    const drivers: Driver[] = [];
    activeComps.forEach((comp, index) => {
      const name = String(comp.fn ?? comp.rn ?? '').trim();
      const kart = String(comp.rn ?? comp.nn ?? '').trim();
      const driver = new Driver(index, name, kart);
      driver.karts.push(kart);

      const laps = (lapsByRn.get(kart) || [])
        .slice()
        .sort((a, b) => (a.n ?? 0) - (b.n ?? 0));
      for (const lap of laps) {
        const lapNumber = Number(lap.n ?? 0);
        const timeSec = Number(lap.lt ?? 0) / 1000;
        if (!lapNumber || !timeSec) continue;
        driver.addLap(new DriverLap(driver, lapNumber - 1, timeSec));
      }

      drivers.push(driver);
    });

    const race = new Race([[]], raceName);
    drivers.forEach((driver) => race.addDriver(driver));

    return { race };
  }

  async findUrl(url: string) {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const urls: string[] = [];
    $(
      'div.list-group.list-group-flush.border-bottom.scrollarea > div.list-group-item.list-group-item-action.py-3.lh-tight',
    ).each((index, element) => {
      const heatElement = $(element);
      const heatLinkElement = heatElement.find('a.text-dark').first();
      const heatLink = heatLinkElement.attr('href') || '';
      urls.push(`https://timing.batyrshin.name${heatLink}`);
      return;
    });
    return urls[0];
  }

  async parsePage(url: string, reqName?: string, pitlane: string[] = []) {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);

    const changes: { [id: string]: string } = {
      // '6': '3',
      // '10': '8',
      // '8': '14',
      // '4': '7',
      // '2': '2',
      // '12': '9',
      // '1': '13',
      // '9': '1',
      // '13': '12', // убрали
      // '14': '10',
      // '3': '4', // питы
      // '7': '6', // питы
    };
    const getRealKart = (kart: string) => {
      if (kart in changes) {
        return changes[kart];
      }
      return kart;
    };

    // Parse race name from page heading, strip trailing date like "19 Nov 2024, 22:43"
    const rawRaceName = $('h5').first().text().trim()
      || $('h4').first().text().trim()
      || $('h3').first().text().trim()
      || $('h1').first().text().trim()
      || '';
    const raceName = rawRaceName.replace(/\s*\d{1,2}\s+\w{3}\s+\d{4}.*$/, '').replace(/[«»""]/g, '').trim();

    const drivers: Driver[] = [];
    const matches: Driver[] = [];
    const kartNumbers: string[] = [];

    // Work with the first table only (lap times), not pit history
    const firstThead = $('thead').first();

    // Find the kart row by looking for .kart elements
    firstThead.find('tr').each((_, row) => {
      const karts = $(row).find('.kart');
      if (karts.length > 0) {
        karts.each((__, element) => {
          kartNumbers.push(getRealKart($(element).text().trim()));
        });
      }
    });

    // Find the driver names row by looking for the row with th[scope="row"] containing "Driver"
    let driverRow: cheerio.Cheerio | null = null;
    firstThead.find('tr').each((_, row) => {
      const rowHeader = $(row).find('th[scope="row"]').first().text().trim();
      if (rowHeader === 'Driver') {
        driverRow = $(row);
      }
    });

    // Fallback: find the row that has <a> links to driver profiles
    if (!driverRow) {
      firstThead.find('tr').each((_, row) => {
        const links = $(row).find('a[href*="/drivers/"]');
        if (links.length > 0 && !driverRow) {
          driverRow = $(row);
        }
      });
    }

    if (driverRow) {
      $(driverRow).find('th[scope="col"]').each((index, element) => {
        const name = $(element).text().trim();
        const driver = new Driver(index, name, kartNumbers[index]);
        driver.karts.push(driver.kart);
        drivers.push(driver);
        if (reqName && name.toLowerCase().includes(reqName.toLowerCase())) {
          matches.push(driver);
        }
      });
    }
    console.log(kartNumbers);
    if (reqName) {
      if (!matches.length) {
        throw new Error('Такое имя не найдено');
      }
      if (matches.length >= 2) {
        throw new Error(
          `Найдено более одного совпадения по заданному имени (${matches.map((driver) => driver.name).join(', ')})`,
        );
      }
    }

    const driver = reqName ? matches[0] : drivers[0];

    // Only process the first table's tbody (lap times), skip pit history table
    const firstTbody = $('tbody').first();
    firstTbody.find('tr').each((index, row) => {
      // Skip summary rows (Gap, Best, Avg, etc.)
      const rowHeader = $(row).find('th[scope="row"]').first().text().trim();
      if (rowHeader && isNaN(Number(rowHeader))) return;

      $(row)
        .find('td')
        .each((indexDriver, cell) => {
          const cellText = $(cell).contents().first().text().trim();
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const [timeText, stintText] = cellText.split(' ');
          const time = Utils.timeFromText(timeText);
          if (!time) {
            return;
          }
          drivers[indexDriver].addLap(new DriverLap(drivers[indexDriver], index, time, stintText));
        });
    });

    // const pitlaneStartText = $('#pitlane_karts').text().trim();
    // const pitlane = pitlaneStartText.split(',');
    // const pitlane = [getRealKart('7'), getRealKart('10')];

    const startPitlane = pitlane.slice();
    const laps = drivers
      .reduce((acc, driver) => [...acc, ...driver.laps], [])
      .sort((a, b) => a.getAbsoluteStartTime() - b.getAbsoluteStartTime());
    for (const lap of laps) {
      // console.log(lap.driver.name, lap.driver.kart, lap.count, lap.time);
      if (lap.isPit()) {
        console.log(`До питов: <- ${pitlane.join(', ')} (карт ${lap.driver.kart} ${lap.driver.name})`);
        const kart = lap.driver.kart;
        lap.driver.kart = pitlane[0];
        lap.driver.karts.push(lap.driver.kart);
        for (let i = 0; i < pitlane.length - 1; i++) {
          pitlane[i] = pitlane[i + 1];
        }
        pitlane[pitlane.length - 1] = kart;
        console.log(`После питов: <- ${pitlane.join(', ')} (карт ${lap.driver.kart} ${lap.driver.name})`);
      }
    }

    const race = new Race([startPitlane], raceName);
    drivers.forEach((driver) => race.addDriver(driver));

    return { race, driver };
  }
}
