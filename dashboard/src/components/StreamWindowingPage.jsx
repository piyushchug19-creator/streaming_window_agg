import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  AreaChart,
  Area,
} from 'recharts';
import { Clock, Database, Layers, CheckCircle, RefreshCw } from 'lucide-react';

export default function StreamWindowingPage({
  countdown,
  intermediateCount,
  windowStart,
  finalizedWindows,
  kafkaLag,
  kafkaLagHistory,
  onForceFlush,
}) {
  const windowProgressPercent = Math.round(((60 - countdown) / 60) * 100);

  return (
    <div className="space-y-6">
      {/* Page Title & Context Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 tracking-tight">
            Stream Windowing & Processing
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Kafka consumption, 60-second tumbling window state in Redis, and idempotent PostgreSQL commits.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onForceFlush}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-colors active:scale-95 shadow-sm"
            title="Immediately close the current window and flush to PostgreSQL"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Flush Window Now</span>
          </button>
        </div>
      </div>

      {/* Component 1 (Top): Active Redis Telemetry */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-2">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-600/10 text-blue-400 border border-blue-500/20">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                Active Redis Telemetry (Open 60s Tumbling Window)
              </h3>
              <p className="text-xs text-slate-400">
                In-memory micro-batch accumulator synced to Redis hash keys before window expiration
              </p>
            </div>
          </div>

          <span className="text-xs font-mono px-2.5 py-1 rounded bg-blue-950 text-blue-400 border border-blue-800 self-start sm:self-auto">
            Window Size: 60 Seconds
          </span>
        </div>

        {/* 3 Metric Pillars */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div>
            <div className="text-xs font-mono uppercase text-slate-400">Countdown to DB Flush</div>
            <div className="text-3xl font-bold font-mono text-blue-400 mt-1">
              {countdown}s left
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Auto-flushes when timer reaches 0
            </div>
          </div>

          <div>
            <div className="text-xs font-mono uppercase text-slate-400">Intermediate Event Count</div>
            <div className="text-3xl font-bold font-mono text-emerald-400 mt-1">
              {intermediateCount.toLocaleString()}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Rapidly accumulating in Redis memory
            </div>
          </div>

          <div>
            <div className="text-xs font-mono uppercase text-slate-400">Window Start Time</div>
            <div className="text-3xl font-bold font-mono text-slate-200 mt-1">
              {windowStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Aligned to epoch-boundary 60s
            </div>
          </div>
        </div>

        {/* Countdown Progress Bar */}
        <div className="pt-2">
          <div className="flex justify-between text-xs font-mono text-slate-400 mb-1.5">
            <span>Window Progress: {60 - countdown}s of 60s elapsed</span>
            <span className="font-semibold text-slate-200">{windowProgressPercent}%</span>
          </div>
          <div className="w-full bg-slate-950 rounded-lg h-3.5 p-0.5 border border-slate-800 overflow-hidden">
            <div
              className="bg-blue-600 h-full rounded transition-all duration-300"
              style={{ width: `${windowProgressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Bottom Grid: 2 Clean Components */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Component 2 (Bottom Left): Finalized DB Writes (PostgreSQL) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  Finalized DB Writes (PostgreSQL)
                </h3>
                <p className="text-xs text-slate-400">
                  Committed window records upserted to table: <code className="text-slate-300">aggregated_metrics</code>
                </p>
              </div>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800">
                Idempotent Upsert
              </span>
            </div>

            <div className="h-64 w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={finalizedWindows} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="windowTime"
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#64748b"
                    fontSize={11}
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
                    formatter={(val) => [`${val.toLocaleString()} events`, 'Flushed Count']}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#3b82f6"
                    strokeWidth={2.5}
                    dot={{ fill: '#3b82f6', r: 4 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 text-xs font-mono text-slate-400 flex justify-between">
            <span>Conflict Rule: (metric_name, window_start, tags)</span>
            <span className="text-emerald-400">DB Flush Active</span>
          </div>
        </div>

        {/* Component 3 (Bottom Right): Kafka Stream Health */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  Kafka Stream Health
                </h3>
                <p className="text-xs text-slate-400">
                  Topic: <code className="text-blue-400">metrics-primary</code> • KRaft Mode
                </p>
              </div>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                STABLE
              </span>
            </div>

            <div className="py-4 space-y-4">
              {/* Lag Stat & Sparkline */}
              <div className="grid grid-cols-2 gap-4 items-center">
                <div>
                  <div className="text-xs font-mono uppercase text-slate-400">Pending Messages</div>
                  <div className="text-3xl font-bold font-mono text-slate-100 mt-1">
                    {kafkaLag} <span className="text-sm font-normal text-slate-400">msgs</span>
                  </div>
                  <div className="text-xs text-emerald-400 mt-0.5">
                    Zero consumer lag bottleneck
                  </div>
                </div>

                {/* Sparkline */}
                <div className="h-16 w-full">
                  <div className="text-[10px] font-mono text-slate-400 text-right mb-1">Lag Sparkline</div>
                  <ResponsiveContainer width="100%" height="80%">
                    <AreaChart data={kafkaLagHistory}>
                      <Area
                        type="monotone"
                        dataKey="lag"
                        stroke="#38bdf8"
                        strokeWidth={1.5}
                        fill="#38bdf8"
                        fillOpacity={0.2}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Clean Kafka Metadata List */}
              <div className="space-y-2 pt-2 border-t border-slate-800 text-xs font-mono">
                <div className="flex justify-between py-1.5 px-3 rounded bg-slate-950/60 border border-slate-800/80">
                  <span className="text-slate-400">Consumer Group:</span>
                  <span className="text-slate-200">metrics-aggregator-group</span>
                </div>
                <div className="flex justify-between py-1.5 px-3 rounded bg-slate-950/60 border border-slate-800/80">
                  <span className="text-slate-400">Active Partitions:</span>
                  <span className="text-slate-200">3 (Partition 0, 1, 2)</span>
                </div>
                <div className="flex justify-between py-1.5 px-3 rounded bg-slate-950/60 border border-slate-800/80">
                  <span className="text-slate-400">Auto Offset Reset:</span>
                  <span className="text-slate-200">earliest</span>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 text-xs font-mono text-slate-400 flex justify-between">
            <span>Commit Sync: 1000ms</span>
            <span>Brokers: 3 Nodes</span>
          </div>
        </div>
      </div>
    </div>
  );
}
