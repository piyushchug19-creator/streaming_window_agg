import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Zap, AlertTriangle, ShieldCheck, Flame } from 'lucide-react';

export default function TrafficIngestionPage({
  trafficHistory,
  throughput,
  acceptedTotal,
  shedTotal,
  tokensRemaining,
  tokenCapacity,
  tokenStatus,
  onSimulateBurst,
  isStreamingTraffic = false,
  onToggleStreamingTraffic = () => {},
}) {
  const totalRequests = acceptedTotal + shedTotal;
  const acceptedPercent = totalRequests > 0 ? ((acceptedTotal / totalRequests) * 100).toFixed(1) : '100';
  const shedPercent = totalRequests > 0 ? ((shedTotal / totalRequests) * 100).toFixed(1) : '0';

  const donutData = [
    { name: 'Accepted (HTTP 202)', value: acceptedTotal, color: '#10b981' },
    { name: 'Shed Load (HTTP 429)', value: shedTotal, color: '#f59e0b' },
  ];

  const tokenPercent = Math.min(100, Math.max(0, Math.round((tokensRemaining / tokenCapacity) * 100)));

  return (
    <div className="space-y-6">
      {/* Page Title & Context Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 tracking-tight">
            Traffic & Ingestion
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            API Gateway admission, Redis token-bucket rate limiting, and HTTP 429 load shedding.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 text-right">
            <div className="text-[11px] font-mono uppercase text-slate-400">Current Ingestion</div>
            <div className="text-xl font-bold font-mono text-slate-100">
              {throughput.toLocaleString()} <span className="text-xs font-normal text-slate-400">req/s</span>
            </div>
          </div>

          <button
            onClick={onToggleStreamingTraffic}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-medium text-sm transition-all shadow-sm active:scale-95 ${
              isStreamingTraffic
                ? 'bg-rose-600 hover:bg-rose-500 text-white animate-pulse'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
            title="Stream continuous real metrics to FastAPI gateway"
          >
            {isStreamingTraffic ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-white inline-block"></span>
                <span>Stop Stream</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                <span>Stream Real Data (60 req/s)</span>
              </>
            )}
          </button>

          <button
            onClick={onSimulateBurst}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium text-sm transition-colors active:scale-95 shadow-sm"
            title="Inject real 120-request burst to test Redis Token Bucket load shedding (HTTP 429)"
          >
            <Flame className="w-4 h-4" />
            <span>Simulate Burst</span>
          </button>
        </div>
      </div>

      {/* Component 1 (Top): Wide Recharts Area Chart */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-2 gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-100">
              Current Ingestion Rate
            </h3>
            <p className="text-xs text-slate-400">
              Real-time streaming throughput: Accepted (HTTP 202) vs Shed Requests (HTTP 429)
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block"></span>
              Accepted HTTP 202
            </span>
            <span className="flex items-center gap-1.5 text-amber-400">
              <span className="w-3 h-3 rounded-sm bg-amber-500 inline-block"></span>
              Shed HTTP 429
            </span>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trafficHistory} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="time"
                stroke="#64748b"
                fontSize={12}
                tickLine={false}
              />
              <YAxis
                stroke="#64748b"
                fontSize={12}
                tickLine={false}
                tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v)}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#334155',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                }}
                formatter={(val, name) => [`${val.toLocaleString()} req/s`, name]}
              />
              <Area
                type="monotone"
                dataKey="accepted"
                name="Accepted HTTP 202"
                stroke="#10b981"
                strokeWidth={2}
                fill="#10b981"
                fillOpacity={0.15}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="shed"
                name="Shed HTTP 429"
                stroke="#f59e0b"
                strokeWidth={2}
                fill="#f59e0b"
                fillOpacity={0.35}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom Grid: 2 Clean Components */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Component 2 (Bottom Left): Request Admission Donut Chart */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  Request Admission Ratio
                </h3>
                <p className="text-xs text-slate-400">
                  HTTP 202 Accepted vs HTTP 429 Load Shed Percentages
                </p>
              </div>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                Target: &gt;99%
              </span>
            </div>

            <div className="relative h-56 flex items-center justify-center my-2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={95}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {donutData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '8px',
                      color: '#f8fafc',
                      fontSize: '12px',
                    }}
                    formatter={(val, name) => [
                      `${val.toLocaleString()} (${((val / totalRequests) * 100).toFixed(1)}%)`,
                      name,
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* Centered Stat */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                <span className="text-3xl font-bold font-mono text-emerald-400">
                  {acceptedPercent}%
                </span>
                <span className="text-[11px] font-mono uppercase text-slate-400 tracking-wider">
                  ACCEPTED
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-800 text-xs font-mono">
            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
              <div className="text-slate-400">Accepted (HTTP 202)</div>
              <div className="text-lg font-bold text-emerald-400 mt-1">
                {acceptedTotal.toLocaleString()}
              </div>
              <div className="text-slate-400 text-[11px] mt-0.5">{acceptedPercent}% of total</div>
            </div>

            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
              <div className="text-slate-400">Shed Load (HTTP 429)</div>
              <div className="text-lg font-bold text-amber-400 mt-1">
                {shedTotal.toLocaleString()}
              </div>
              <div className="text-slate-400 text-[11px] mt-0.5">{shedPercent}% of total</div>
            </div>
          </div>
        </div>

        {/* Component 3 (Bottom Right): Redis Token Bucket Gauge */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  Redis Token Bucket Status
                </h3>
                <p className="text-xs text-slate-400">
                  Atomic Lua Script Token Replenishment Engine
                </p>
              </div>

              <span
                className={`text-xs font-mono font-semibold px-2.5 py-1 rounded border ${
                  tokenStatus === 'HEALTHY'
                    ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                    : 'bg-amber-950 text-amber-400 border-amber-800'
                }`}
              >
                {tokenStatus}
              </span>
            </div>

            <div className="py-6 space-y-4">
              <div className="flex items-baseline justify-between font-mono">
                <div>
                  <div className="text-xs text-slate-400">Current Token Reserve</div>
                  <div className="text-4xl font-bold text-slate-100 mt-1">
                    {tokensRemaining.toFixed(0)}
                    <span className="text-base font-normal text-slate-400 ml-2">
                      / {tokenCapacity} tokens
                    </span>
                  </div>
                </div>
                <div className="text-xl font-bold font-mono text-blue-400">
                  {tokenPercent}%
                </div>
              </div>

              {/* Flat Progress Bar */}
              <div className="w-full bg-slate-950 rounded-lg h-4 p-0.5 border border-slate-800 overflow-hidden">
                <div
                  className={`h-full rounded transition-all duration-300 ${
                    tokenPercent > 40 ? 'bg-blue-600' : 'bg-amber-500'
                  }`}
                  style={{ width: `${tokenPercent}%` }}
                />
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
                  <div className="text-xs text-slate-400">Replenish Rate</div>
                  <div className="text-base font-bold font-mono text-slate-200 mt-0.5">
                    +500 tokens/sec
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Fractional elapsed time</div>
                </div>

                <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
                  <div className="text-xs text-slate-400">Burst Capacity</div>
                  <div className="text-base font-bold font-mono text-slate-200 mt-0.5">
                    1,000 tokens
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Instant burst headroom</div>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 text-xs font-mono text-slate-400 flex justify-between">
            <span>Algorithm: Redis Token Bucket Lua</span>
            <span>Headers: X-RateLimit-*</span>
          </div>
        </div>
      </div>
    </div>
  );
}
