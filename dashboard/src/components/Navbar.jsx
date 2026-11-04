import React from 'react';
import { 
  Activity, 
  Layers, 
  Clock, 
  Zap, 
  Flame, 
  DatabaseZap, 
  Play, 
  Pause, 
  Radio, 
  ShieldCheck,
  Server
} from 'lucide-react';

export default function Navbar({
  isRunning,
  setIsRunning,
  simulationSpeed,
  setSimulationSpeed,
  windowProgress,
  triggerTrafficSpike,
  triggerDatabaseOutage,
}) {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-surface-border bg-background/80 backdrop-blur-xl">
      <div className="max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand & Pipeline Identification */}
        <div className="flex items-center space-x-4">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 text-cyan-400 shadow-glow-cyan">
            <Activity className="w-5 h-5 animate-pulse-subtle" />
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500"></span>
            </span>
          </div>

          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base font-semibold tracking-tight text-white flex items-center gap-2">
                <span>StreamPulse</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-mono font-normal bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  OBSERVABILITY
                </span>
              </h1>
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-1.5 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              Streaming Window Metrics Aggregator Pipeline
              <span className="text-slate-600">•</span>
              <span className="text-slate-500">v1.0.0 (FastAPI + Kafka + Redis + Neon DB)</span>
            </p>
          </div>
        </div>

        {/* Tumbling Window Progress Widget */}
        <div className="hidden xl:flex items-center space-x-6 px-4 py-1.5 rounded-xl bg-surface/80 border border-surface-border">
          <div className="flex items-center space-x-3">
            <div className="relative w-8 h-8 flex items-center justify-center">
              {/* Circular SVG Progress */}
              <svg className="w-8 h-8 transform -rotate-90">
                <circle
                  cx="16"
                  cy="16"
                  r="13"
                  stroke="rgba(255, 255, 255, 0.1)"
                  strokeWidth="2.5"
                  fill="transparent"
                />
                <circle
                  cx="16"
                  cy="16"
                  r="13"
                  stroke="#06b6d4"
                  strokeWidth="2.5"
                  strokeDasharray={81.68}
                  strokeDashoffset={81.68 - (81.68 * windowProgress) / 60}
                  strokeLinecap="round"
                  fill="transparent"
                  className="transition-all duration-300"
                />
              </svg>
              <Clock className="w-3.5 h-3.5 absolute text-cyan-400" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-300">Tumbling Window</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-800/40">
                  60s EPOCH
                </span>
              </div>
              <div className="text-xs font-mono text-cyan-400">
                <span className="font-semibold">{windowProgress}s</span>
                <span className="text-slate-500"> / 60s until flush</span>
              </div>
            </div>
          </div>

          <div className="h-6 w-px bg-surface-border" />

          {/* Infrastructure Health Status */}
          <div className="flex items-center space-x-4 text-xs font-mono">
            <div className="flex items-center space-x-1.5 text-slate-300">
              <Server className="w-3.5 h-3.5 text-emerald-400" />
              <span>Kafka KRaft:</span>
              <span className="text-emerald-400 font-semibold">ONLINE</span>
            </div>
            <div className="flex items-center space-x-1.5 text-slate-300">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              <span>Redis TB:</span>
              <span className="text-cyan-400 font-semibold">HEALTHY</span>
            </div>
          </div>
        </div>

        {/* Live Simulation & Test Triggers */}
        <div className="flex items-center space-x-3">
          {/* Simulation Speed */}
          <div className="hidden sm:flex items-center bg-surface-card rounded-lg p-0.5 border border-surface-border text-xs font-mono">
            {[1, 2, 5].map((speed) => (
              <button
                key={speed}
                onClick={() => setSimulationSpeed(speed)}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  simulationSpeed === speed
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title={`Simulation rate ${speed}x`}
              >
                {speed}x
              </button>
            ))}
          </div>

          {/* Pause / Resume Button */}
          <button
            onClick={() => setIsRunning(!isRunning)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              isRunning
                ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400 hover:bg-emerald-900/40'
                : 'bg-amber-950/40 border-amber-500/30 text-amber-400 hover:bg-amber-900/40'
            }`}
          >
            {isRunning ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Stream Live</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Stream Paused</span>
              </>
            )}
          </button>

          {/* Stress Test Spikes (Interactive demonstration) */}
          <button
            onClick={triggerTrafficSpike}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/10 border border-amber-500/20 text-amber-300 hover:bg-amber-500/20 transition-all shadow-sm active:scale-95"
            title="Inject traffic surge beyond token bucket capacity to simulate HTTP 429 shedding"
          >
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden md:inline">Spike Traffic</span>
          </button>

          <button
            onClick={triggerDatabaseOutage}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-500/10 border border-rose-500/20 text-rose-300 hover:bg-rose-500/20 transition-all shadow-sm active:scale-95"
            title="Simulate Neon DB connection failure to route batches to metrics-dlq with jittered retry"
          >
            <DatabaseZap className="w-3.5 h-3.5 text-rose-400" />
            <span className="hidden md:inline">Simulate DB Outage</span>
          </button>
        </div>
      </div>
    </header>
  );
}
