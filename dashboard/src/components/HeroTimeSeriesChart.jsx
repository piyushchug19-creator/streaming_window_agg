import React, { useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { 
  TrendingUp, 
  Clock, 
  Sparkles, 
  Gauge, 
  Layers, 
  Maximize2,
  CheckCircle2,
  Cpu
} from 'lucide-react';

// Custom rich glassmorphism tooltip
const CustomChartTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="glass-panel p-3.5 rounded-xl border border-white/10 shadow-2xl text-xs font-mono min-w-[240px]">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
          <span className="font-semibold text-slate-200 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            Window: {label}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
            60s SLICE
          </span>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Throughput:</span>
            <span className="text-cyan-300 font-semibold">{data.throughput?.toLocaleString()} msg/s</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-slate-400">Window Upserts:</span>
            <span className="text-emerald-300 font-semibold">{data.acceptedRequests?.toLocaleString()}</span>
          </div>

          <div className="h-px bg-white/5 my-1" />

          <div className="grid grid-cols-3 gap-2 pt-1 text-center">
            <div className="p-1 rounded bg-white/5">
              <div className="text-[10px] text-slate-400">p50</div>
              <div className="text-emerald-400 font-semibold">{data.latencyP50}ms</div>
            </div>
            <div className="p-1 rounded bg-white/5">
              <div className="text-[10px] text-slate-400">p95</div>
              <div className="text-amber-400 font-semibold">{data.latencyP95}ms</div>
            </div>
            <div className="p-1 rounded bg-white/5">
              <div className="text-[10px] text-slate-400">p99</div>
              <div className="text-rose-400 font-semibold">{data.latencyP99}ms</div>
            </div>
          </div>

          <div className="pt-2 text-[10px] text-slate-500 flex justify-between border-t border-white/5">
            <span>Epoch: {data.windowStart}</span>
            <span>Tag Hashes: {data.activeKeys}</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export default function HeroTimeSeriesChart({
  windows,
  windowProgress,
  activeMetricMode,
  setActiveMetricMode,
}) {
  const latestWindow = windows[windows.length - 1] || {};
  const previousWindow = windows[windows.length - 2] || latestWindow;

  const throughputDelta = latestWindow.throughput && previousWindow.throughput
    ? ((latestWindow.throughput - previousWindow.throughput) / previousWindow.throughput * 100).toFixed(1)
    : 0;

  return (
    <section className="glass-panel rounded-2xl p-5 relative overflow-hidden border border-surface-border">
      {/* Decorative top edge lighting glow */}
      <div className="absolute top-0 left-1/4 right-1/4 h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />

      {/* Header and Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold tracking-tight text-white">
                  Real-Time Tumbling Window Telemetry
                </h2>
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping-slow"></span>
                  STREAMING (60s EPOCH)
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Micro-batch buffering & Redis state aggregation • Auto-persisting to PostgreSQL
              </p>
            </div>
          </div>
        </div>

        {/* View Mode Selectors */}
        <div className="flex items-center flex-wrap gap-2">
          <div className="flex items-center bg-surface/90 rounded-xl p-1 border border-surface-border text-xs font-mono">
            {[
              { id: 'all', label: 'Composite View' },
              { id: 'throughput', label: 'Throughput (msg/s)' },
              { id: 'latency', label: 'Latency Percentiles' },
              { id: 'volume', label: 'Window Batch Volume' },
            ].map((mode) => (
              <button
                key={mode.id}
                onClick={() => setActiveMetricMode(mode.id)}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activeMetricMode === mode.id
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Live Micro-Stats Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="p-3 rounded-xl bg-surface/60 border border-surface-border">
          <div className="text-[11px] font-mono text-slate-400">Current Ingestion Rate</div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-bold font-mono text-cyan-300">
              {latestWindow.throughput ? latestWindow.throughput.toLocaleString() : '3,850'}
            </span>
            <span className="text-xs text-slate-500 font-mono">msg/sec</span>
            <span className={`text-[10px] font-mono ml-auto ${Number(throughputDelta) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {Number(throughputDelta) >= 0 ? `+${throughputDelta}%` : `${throughputDelta}%`}
            </span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-surface/60 border border-surface-border">
          <div className="text-[11px] font-mono text-slate-400">Latency Profile (p50 / p95 / p99)</div>
          <div className="flex items-baseline gap-2 mt-1 font-mono">
            <span className="text-sm font-semibold text-emerald-400">{latestWindow.latencyP50 || 8.5}ms</span>
            <span className="text-slate-600">/</span>
            <span className="text-sm font-semibold text-amber-400">{latestWindow.latencyP95 || 22.4}ms</span>
            <span className="text-slate-600">/</span>
            <span className="text-sm font-semibold text-rose-400">{latestWindow.latencyP99 || 48.2}ms</span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-surface/60 border border-surface-border">
          <div className="text-[11px] font-mono text-slate-400">Tumbling Window State</div>
          <div className="flex items-baseline gap-2 mt-1 font-mono">
            <span className="text-base font-semibold text-purple-300">
              {windowProgress}s / 60s
            </span>
            <span className="text-[11px] text-slate-500">
              ({Math.round(((60 - windowProgress) / 60) * 100)}% remaining)
            </span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-surface/60 border border-surface-border">
          <div className="text-[11px] font-mono text-slate-400">Watermark Delay / TTL</div>
          <div className="flex items-baseline gap-2 mt-1 font-mono">
            <span className="text-base font-semibold text-slate-200">2.0s</span>
            <span className="text-xs text-slate-500">watermark</span>
            <span className="text-[10px] ml-auto text-cyan-400 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/40">
              TTL: 7200s
            </span>
          </div>
        </div>
      </div>

      {/* Large Recharts Area Hero Chart */}
      <div className="h-[340px] w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={windows}
            margin={{ top: 10, right: 12, left: -10, bottom: 0 }}
          >
            <defs>
              {/* Cyan Gradient for Ingestion Throughput */}
              <linearGradient id="cyanGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.45} />
                <stop offset="50%" stopColor="#06b6d4" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.0} />
              </linearGradient>

              {/* Purple Gradient for p95/p99 Latency */}
              <linearGradient id="purpleGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.4} />
                <stop offset="50%" stopColor="#8b5cf6" stopOpacity={0.1} />
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.0} />
              </linearGradient>

              {/* Emerald Gradient for Batch Volumes */}
              <linearGradient id="emeraldGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                <stop offset="50%" stopColor="#10b981" stopOpacity={0.1} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.0} />
              </linearGradient>

              {/* Rose Gradient for Shed Load */}
              <linearGradient id="roseGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.0} />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255, 255, 255, 0.05)"
              vertical={false}
            />

            <XAxis
              dataKey="time"
              stroke="#64748b"
              fontSize={11}
              fontFamily="JetBrains Mono, monospace"
              tickLine={false}
              axisLine={{ stroke: 'rgba(255, 255, 255, 0.08)' }}
            />

            {/* Left Y-Axis for Throughput / Volume */}
            <YAxis
              yAxisId="left"
              stroke="#64748b"
              fontSize={11}
              fontFamily="JetBrains Mono, monospace"
              tickLine={false}
              axisLine={{ stroke: 'rgba(255, 255, 255, 0.08)' }}
              tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v)}
            />

            {/* Right Y-Axis for Latency ms */}
            {(activeMetricMode === 'all' || activeMetricMode === 'latency') && (
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#8b5cf6"
                fontSize={11}
                fontFamily="JetBrains Mono, monospace"
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}ms`}
              />
            )}

            <Tooltip content={<CustomChartTooltip />} />

            {/* Area Series based on Active Mode */}
            {(activeMetricMode === 'all' || activeMetricMode === 'throughput') && (
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="throughput"
                name="Throughput (msg/s)"
                stroke="#06b6d4"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#cyanGradient)"
                isAnimationActive={false}
              />
            )}

            {(activeMetricMode === 'all' || activeMetricMode === 'latency') && (
              <Area
                yAxisId="right"
                type="monotone"
                dataKey="latencyP95"
                name="p95 Latency (ms)"
                stroke="#8b5cf6"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#purpleGradient)"
                isAnimationActive={false}
              />
            )}

            {activeMetricMode === 'latency' && (
              <Area
                yAxisId="right"
                type="monotone"
                dataKey="latencyP99"
                name="p99 Latency (ms)"
                stroke="#f43f5e"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                fillOpacity={0.2}
                fill="url(#roseGradient)"
                isAnimationActive={false}
              />
            )}

            {activeMetricMode === 'volume' && (
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="acceptedRequests"
                name="Accepted Records"
                stroke="#10b981"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#emeraldGradient)"
                isAnimationActive={false}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Chart Footer Info Legend */}
      <div className="flex flex-wrap items-center justify-between gap-4 mt-3 pt-3 border-t border-surface-border text-xs font-mono">
        <div className="flex items-center gap-5 text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-3 h-1 rounded-full bg-cyan-400"></span>
            <span>Throughput (Ingested msg/sec)</span>
          </div>
          {(activeMetricMode === 'all' || activeMetricMode === 'latency') && (
            <div className="flex items-center gap-2">
              <span className="w-3 h-1 rounded-full bg-purple-400"></span>
              <span>p95 Tail Latency (Target &lt; 35ms)</span>
            </div>
          )}
          {activeMetricMode === 'latency' && (
            <div className="flex items-center gap-2">
              <span className="w-3 h-1 rounded-full bg-rose-400"></span>
              <span>p99 Latency Spike Limit</span>
            </div>
          )}
        </div>

        <div className="text-slate-500 text-[11px] flex items-center gap-2">
          <span>Upsert Strategy:</span>
          <code className="text-cyan-400 bg-surface px-1.5 py-0.5 rounded border border-white/5">
            ON CONFLICT (metric_name, window_start, tags) DO UPDATE
          </code>
        </div>
      </div>
    </section>
  );
}
