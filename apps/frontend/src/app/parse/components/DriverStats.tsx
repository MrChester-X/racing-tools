'use client';
import { DriverData } from '../types';

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) return `${mins}:${secs.toFixed(3).padStart(6, '0')}`;
  return secs.toFixed(3);
}

function formatAbsoluteTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function DriverStats({ driver, offset }: { driver: DriverData; offset: number }) {
  const laps = driver.laps;
  const sorted = [...laps].sort((a, b) => a.time - b.time);

  const getAbsStart = (lap: typeof laps[0]) =>
    laps.slice(0, lap.count).reduce((sum, l) => sum + l.time, 0);

  const lapLine = (lap: typeof laps[0], highlight?: boolean) => (
    <div className={`flex justify-between items-center py-0.5 ${highlight ? 'text-orange-400' : 'text-gray-400'}`}>
      <span className="font-mono text-xs">#{(lap.count + 1).toString().padStart(2, '0')}</span>
      <span className="font-mono text-sm font-medium">{formatTime(lap.time)}</span>
      <span className="font-mono text-xs text-gray-600">{formatAbsoluteTime(getAbsStart(lap) + offset)}</span>
    </div>
  );

  const bestLaps = sorted.slice(0, 5);
  const midIndex = Math.floor(sorted.length / 2);
  const medianLaps = sorted.slice(Math.max(0, midIndex - 3), midIndex + 3);
  const worstLaps = sorted.slice(-5);
  const lastLaps = laps.slice(-3);

  const Section = ({ title, items, accent }: { title: string; items: typeof laps; accent?: string }) => (
    <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-4">
      <h4 className={`text-[10px] font-bold uppercase tracking-[2px] mb-3 ${accent || 'text-gray-500'}`}>{title}</h4>
      <div className="space-y-0.5">
        {items.map((lap, i) => (
          <div key={i}>{lapLine(lap, i === 0 && title.includes('лучших'))}</div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-4 mt-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-bold text-lg">{driver.name}</h3>
          <div className="flex items-center gap-2 mt-1">
            {driver.karts.map((k, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-gray-700 text-xs">→</span>}
                <span className="text-[10px] font-mono text-gray-500 bg-white/[0.05] px-1.5 py-0.5 rounded">K{k}</span>
              </span>
            ))}
            <span className="text-gray-600 text-xs ml-2">{laps.length} laps</span>
          </div>
        </div>
        {sorted.length > 0 && (
          <div className="text-right">
            <div className="text-[10px] text-gray-600 uppercase tracking-wider">Best</div>
            <div className="text-orange-400 font-mono font-bold text-lg">{formatTime(sorted[0].time)}</div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Section title="Топ 5 лучших" items={bestLaps} accent="text-green-500" />
        <Section title="Медианные" items={medianLaps} />
        <Section title="Топ 5 худших" items={worstLaps} accent="text-red-400/60" />
        <Section title="Последние 3" items={lastLaps} accent="text-orange-500/60" />
      </div>
      <Section title={`Все круги (${Math.min(laps.length, 20)})`} items={laps.slice(0, 20)} />
    </div>
  );
}
