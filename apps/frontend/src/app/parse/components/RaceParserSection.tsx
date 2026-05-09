'use client';
import { useParseStore } from '../store/useParseStore';
import { DriverStats } from './DriverStats';

export function RaceParserSection() {
  const {
    raceUrl, setRaceUrl, loadRace, isLoadingRace, raceError,
    raceData, selectedDriver, selectDriver, offset, setOffset,
  } = useParseStore();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-1 h-6 bg-gradient-to-b from-orange-500 to-orange-600 rounded-full" />
        <h2 className="text-lg font-bold text-white tracking-wide uppercase">Race Data</h2>
      </div>

      {/* URL input */}
      <div className="flex gap-3">
        <div className="flex-1 relative group">
          <input
            type="text"
            value={raceUrl}
            onChange={(e) => setRaceUrl(e.target.value)}
            placeholder="https://timing.batyrshin.name/tracks/... or https://miks.racemann.com/Race/id/..."
            className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-5 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-orange-500/40 focus:bg-white/[0.05] transition-all font-mono"
          />
          <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-orange-500/0 via-orange-500/5 to-orange-500/0 opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none" />
        </div>
        <button
          onClick={loadRace}
          disabled={isLoadingRace || !raceUrl}
          className="bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-500 hover:to-orange-600 text-white font-semibold px-7 py-3 rounded-xl disabled:opacity-30 disabled:cursor-not-allowed transition-all text-sm tracking-wide uppercase shadow-lg shadow-orange-600/20 hover:shadow-orange-500/30"
        >
          {isLoadingRace ? (
            <span className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Loading
            </span>
          ) : 'Parse'}
        </button>
      </div>

      {raceError && (
        <div className="text-red-400 text-sm bg-red-500/5 border border-red-500/10 rounded-xl px-5 py-3">{raceError}</div>
      )}

      {raceData && (
        <div className="space-y-4">
          {raceData.raceName && (
            <h3 className="text-white text-xl font-bold">{raceData.raceName}</h3>
          )}

          {/* Offset input */}
          <div className="flex items-center gap-3">
            <label className="text-gray-500 text-xs uppercase tracking-wider">Offset</label>
            <input
              type="number"
              step="0.1"
              value={offset}
              onChange={(e) => setOffset(parseFloat(e.target.value) || 0)}
              className="w-28 bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-orange-500/40 transition-all"
            />
            <span className="text-gray-600 text-xs">sec</span>
          </div>

          {/* Driver grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {raceData.drivers.map((d) => {
              const isSelected = selectedDriver?.name === d.name;
              return (
                <button
                  key={`${d.index}-${d.name}`}
                  onClick={() => selectDriver(isSelected ? null : d)}
                  className={`relative text-left px-4 py-3.5 rounded-xl border transition-all duration-200 group overflow-hidden ${
                    isSelected
                      ? 'bg-orange-500/10 border-orange-500/30 shadow-lg shadow-orange-500/10'
                      : 'bg-white/[0.02] border-white/[0.05] hover:bg-white/[0.04] hover:border-white/[0.1]'
                  }`}
                >
                  {isSelected && (
                    <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-orange-500 to-orange-600 rounded-r" />
                  )}
                  <div className={`font-semibold text-sm ${isSelected ? 'text-orange-400' : 'text-gray-200'}`}>
                    {d.name}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-mono text-gray-500 bg-white/[0.05] px-1.5 py-0.5 rounded">
                      K{d.startKart}
                    </span>
                    <span className="text-[10px] text-gray-600">
                      {d.laps.length} laps
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selectedDriver && <DriverStats driver={selectedDriver} offset={offset} />}
    </div>
  );
}
