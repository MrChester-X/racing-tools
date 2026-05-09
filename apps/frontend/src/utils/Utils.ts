// const { exec } = require('child_process');

// const sound = require('sound-play');

// const gtts = require('gtts');

export class Utils {
  static timeFromText(timeText: string) {
    if (!timeText) {
      return null;
    }
    if (timeText.includes(":")) {
      const [minutes, seconds] = timeText.split(":");
      return Number.parseInt(minutes) * 60 + Number.parseFloat(seconds);
    }
    return Number.parseFloat(timeText);
  }

  static timeToText(time: number, showZeroMinutes = false) {
    const seconds = time % 60;
    const secondsText = Utils.normalizeTime(Utils.normalizeSeconds(seconds));
    const minutes = Math.floor(time / 60) % 60;
    const minutesText = Utils.normalizeTime(minutes);
    const hours = Math.floor(time / 3600);
    const hoursText = Utils.normalizeTime(hours);
    if (hours) {
      return `${hoursText}:${minutesText}:${secondsText}`;
    }
    if (minutes || showZeroMinutes) {
      return `${minutesText}:${secondsText}`;
    }
    return secondsText;
  }

  static normalizeTime(time: string | number) {
    const timeText = `${time}`;
    const [integer, decimal] = timeText.split(".");
    const normalizedInteger = integer.padStart(2, "0");
    if (decimal) {
      return `${normalizedInteger}.${decimal}`;
    }
    return normalizedInteger;
  }

  static normalizeSeconds(seconds: number) {
    return seconds.toFixed(3);
  }

  static makeSound(_text: string) {
    // const voice = new gtts(text, 'ru');
    // voice.save('voice.mp3', () =>
    //     exec('afplay /Users/p.bulychev/Documents/Projects/Other/telegram-race-time/voice.mp3'),
    // );
  }

  static getLaneLetter(lane: number) {
    if (lane === 0) {
      return "А";
    }
    if (lane === 1) {
      return "Б";
    }
    return "unknown";
  }

  static getLetterLane(letter: string) {
    letter = letter.toLowerCase();
    if (letter === "а") {
      return 0;
    }
    if (letter === "б") {
      return 1;
    }
    throw new Error(`Невалидная буква ${letter} явахуи с тебя`);
  }

  static formatRaceTime(eventTimestamp: number | undefined, raceStartTime: number | null): string | null {
    if (!raceStartTime) return null;
    const effectiveTime = eventTimestamp && eventTimestamp > raceStartTime ? eventTimestamp : raceStartTime;
    const elapsed = effectiveTime - raceStartTime;
    const totalSeconds = Math.floor(elapsed / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
}
