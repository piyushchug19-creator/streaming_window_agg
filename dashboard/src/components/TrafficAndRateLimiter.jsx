import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { 
  ShieldAlert, 
  ShieldCheck, 
  Flame, 
  Zap, 
  Cpu, 
  ArrowUpRight, 
  Percent,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Database
} from 'lucide-react';

export default function TrafficAndRateLimiter({
  tokenCapacity,
  tokensRemaining,
  refillRate,
  acceptedTotal,
  shedTotal,
  recentAcceptedRate,
  recentShedRate,
  triggerTrafficSpike,
}) {
  const totalRequests = acceptedTotal + shedTotal;
  const acceptedPercent = totalRequests > 0 ? ((acceptedTotal / totalRequests) * 100).toFixed(1) : 100;
  const shedPercent = totalRequests > 0 ? ((shedTotal / totalRequests) * 100).toFixed(1) : 0;

  // Donut chart data: Accepted (202) vs Shed (429)
  const donutData = [
    { name: 'Accepted (HTTP 202)', value: acceptedTotal, color: '#10b981' },
    { name: 'Shed Load (HTTP 429)', value: shedTotal, color: '#f59e0b' },
  ];

  // Token remaining percentage
  const tokenPercent = Math.min(100, Math.max(0, (tokensRemaining / tokenCapacity) * 100));

  // Determine token bucket status color
  const getTokenColor = () => {
    if (tokenPercent > 40) return { bg: 'bg-emerald-500', text: 'text-emerald-400', border: 'border-emerald-500/30', glow: 'shadow-glow-emerald' };
    if (tokenPercent > 15) return { bg: 'bg-amber-500', text: 'text-amber-400', border: 'border-amber-500/30', glow: 'shadow-glow-amber' };
    return { bg: 'bg-rose-500', text: 'text-rose-400', border: 'border-rose-500/30', glow: 'shadow-glow-rose' };
  };

  const statusColor = getTokenColor();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* 1. Traffic Load & Shedding (Donut Chart Card) */}
      <div className="glass-panel rounded-2xl p-5 relative border border-surface-border flex flex-col justify-between">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-surface-border">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white tracking-tight">
                  Traffic Management & Load Shedding
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  HTTP 202 Accepted vs HTTP 429 Load Shed Ratio
                </p>
              </div>
            </div>

            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              99.8% Availability Target
            </span>
          </div>

          {/* Donut Chart & Breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center pt-4">
            {/* Donut visualization with centered metric */}
            <div className="sm:col-span-6 relative h-[180px] flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={56}
                    outerRadius={78}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {donutData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val, name) => [
                      `${val.toLocaleString()} (${((val / totalRequests) * 100).toFixed(1)}%)`,
                      name,
                    ]}
                    contentStyle={{
                      backgroundColor: 'rgba(14, 17, 24, 0.95)',
                      borderColor: 'rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontFamily: 'JetBrains Mono, monospace',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* Center Stat inside the Donut */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                <span className="text-2xl font-bold font-mono text-emerald-400 tracking-tight">
                  {acceptedPercent}%
                </span>
                <span className="text-[10px] uppercase font-mono text-slate-400 tracking-wider">
                  ACCEPTED
                </span>
              </div>
            </div>

            {/* Metrics Breakdown Cards */}
            <div className="sm:col-span-6 space-y-3">
              {/* Accepted 202 Card */}
              <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/20">
                <div className="flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-1.5 text-emerald-400">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span className="font-semibold">HTTP 202 Accepted</span>
                  </div>
                  <span className="text-emerald-300 font-bold">{acceptedPercent}%</span>
                </div>
                <div className="flex items-baseline justify-between mt-1 text-slate-300 font-mono">
                  <span className="text-base font-bold text-white">
                    {acceptedTotal.toLocaleString()}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    ~{recentAcceptedRate.toLocaleString()} req/s
                  </span>
                </div>
              </div>

              {/* Shed 429 Card */}
              <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/20">
                <div className="flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-1.5 text-amber-400">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span className="font-semibold">HTTP 429 Shed Load</span>
                  </div>
                  <span className="text-amber-300 font-bold">{shedPercent}%</span>
                </div>
                <div className="flex items-baseline justify-between mt-1 text-slate-300 font-mono">
                  <span className="text-base font-bold text-white">
                    {shedTotal.toLocaleString()}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    ~{recentShedRate} req/s shed
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Card Footer Info */}
        <div className="pt-3 mt-4 border-t border-surface-border flex items-center justify-between text-[11px] font-mono text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
            Headers: X-RateLimit-Remaining, Retry-After
          </span>
          <span className="text-slate-500">Atomic Lua Protection</span>
        </div>
      </div>

      {/* 2. Rate Limiting Status (Redis Token Bucket Live Gauge Card) */}
      <div className="glass-panel rounded-2xl p-5 relative border border-surface-border flex flex-col justify-between">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-surface-border">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white tracking-tight">
                  Redis Token Bucket Rate Limiter
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  Atomic Lua Script Token Replenishment Engine
                </p>
              </div>
            </div>

            <button
              onClick={triggerTrafficSpike}
              className="flex items-center gap-1 text-[11px] font-mono px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition-all active:scale-95"
              title="Test burst capacity exhaustion"
            >
              <Flame className="w-3 h-3 text-amber-400" />
              Test Spike Burst
            </button>
          </div>

          {/* Live Bucket Gauge & Capacity Visual */}
          <div className="pt-4 space-y-4">
            {/* Tokens remaining meter display */}
            <div>
              <div className="flex items-center justify-between font-mono text-xs mb-2">
                <span className="text-slate-300 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Bucket Tokens:</span>
                  <span className={`font-bold ${statusColor.text}`}>
                    {tokensRemaining.toFixed(1)}
                  </span>
                  <span className="text-slate-500">/ {tokenCapacity.toFixed(1)} tokens</span>
                </span>
                <span className="text-cyan-400 font-semibold">{tokenPercent.toFixed(1)}% Full</span>
              </div>

              {/* High-tech segmented progress bar */}
              <div className="h-4 w-full bg-slate-900 rounded-lg p-0.5 border border-white/10 relative overflow-hidden flex">
                <div
                  className={`h-full rounded-md transition-all duration-300 ${statusColor.bg}`}
                  style={{ width: `${tokenPercent}%` }}
                />
                {/* Visual marker lines for capacity steps */}
                <div className="absolute inset-0 flex justify-between px-2 pointer-events-none opacity-20">
                  <span className="border-r border-white h-full"></span>
                  <span className="border-r border-white h-full"></span>
                  <span className="border-r border-white h-full"></span>
                </div>
              </div>
            </div>

            {/* Micro Stats Grid for Rate Limiter */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
              <div className="p-2.5 rounded-xl bg-surface/70 border border-surface-border">
                <div className="text-[10px] font-mono text-slate-400">Replenish Rate</div>
                <div className="text-sm font-bold font-mono text-emerald-400 mt-0.5 flex items-center gap-1">
                  +{refillRate.toFixed(1)}
                  <span className="text-[10px] text-slate-500 font-normal">/sec</span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-surface/70 border border-surface-border">
                <div className="text-[10px] font-mono text-slate-400">Burst Capacity</div>
                <div className="text-sm font-bold font-mono text-cyan-300 mt-0.5 flex items-center gap-1">
                  {tokenCapacity.toFixed(0)}
                  <span className="text-[10px] text-slate-500 font-normal">max</span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-surface/70 border border-surface-border col-span-2 sm:col-span-1">
                <div className="text-[10px] font-mono text-slate-400">Key Prefix</div>
                <div className="text-xs font-semibold font-mono text-slate-200 mt-0.5 truncate">
                  rate_limit:ip
                </div>
              </div>
            </div>

            {/* Lua Script Formula Details */}
            <div className="p-2.5 rounded-xl bg-surface/40 border border-white/5 text-[11px] font-mono text-slate-400">
              <div className="flex items-center justify-between text-[10px] text-slate-500 pb-1 mb-1 border-b border-white/5">
                <span>ATOMIC SCRIPT SPECIFICATION</span>
                <span className="text-cyan-400">O(1) Memory</span>
              </div>
              <div className="text-slate-300">
                tokens = min(capacity, current + (delta_time * refill_rate))
              </div>
            </div>
          </div>
        </div>

        {/* Card Footer Info */}
        <div className="pt-3 mt-4 border-t border-surface-border flex items-center justify-between text-[11px] font-mono text-slate-400">
          <span className="flex items-center gap-1 text-emerald-400">
            <RefreshCw className="w-3 h-3 animate-spin" />
            Active Continuous Replenishment
          </span>
          <span className="text-slate-500">Atomic Redis EVALSHA</span>
        </div>
      </div>
    </div>
  );
}
