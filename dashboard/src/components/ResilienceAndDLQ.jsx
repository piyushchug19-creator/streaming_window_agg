import React, { useState } from 'react';
import { 
  AlertOctagon, 
  Database, 
  RotateCw, 
  ShieldAlert, 
  Flame, 
  Terminal, 
  CheckCircle, 
  AlertTriangle, 
  Info, 
  Clock, 
  Trash2,
  Filter,
  RefreshCw,
  ExternalLink
} from 'lucide-react';

export default function ResilienceAndDLQ({
  dlqLag,
  deadLetterRecordsCount,
  retryStatus,
  retryAttempts,
  eventFeed,
  triggerDatabaseOutage,
}) {
  const [filterLevel, setFilterLevel] = useState('all');

  const filteredEvents = eventFeed.filter((evt) => {
    if (filterLevel === 'all') return true;
    return evt.level === filterLevel;
  });

  const getLevelBadge = (level) => {
    switch (level) {
      case 'critical':
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse"></span>
            ALERT
          </span>
        );
      case 'warning':
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
            WARN
          </span>
        );
      case 'success':
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            SUCCESS
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
            INFO
          </span>
        );
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
      {/* 1. DLQ Alerts & Monitoring (Distinct Attention Panel with subtle red accents) */}
      <div className="xl:col-span-5 glass-panel-alert rounded-2xl p-5 border border-rose-500/30 flex flex-col justify-between">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-rose-500/20">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30 shadow-glow-rose">
                <AlertOctagon className="w-5 h-5 animate-pulse-subtle" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-white tracking-tight">
                    Resilience & DLQ Fallback
                  </h3>
                  <code className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-800/40">
                    metrics-dlq
                  </code>
                </div>
                <p className="text-xs text-rose-200/70 font-mono">
                  Fault-tolerant storage safeguard for Neon DB / PostgreSQL
                </p>
              </div>
            </div>

            <button
              onClick={triggerDatabaseOutage}
              className="flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 transition-all active:scale-95 shadow-sm"
              title="Simulate Neon DB connection outage to observe DLQ routing & jittered backoff replay"
            >
              <RotateCw className="w-3.5 h-3.5 text-rose-400" />
              <span>Simulate DB Outage</span>
            </button>
          </div>

          {/* DLQ Key Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-4">
            {/* metrics-dlq Lag Card */}
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-rose-500/20 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                  <span>DLQ Topic Lag</span>
                  <span className={`w-2 h-2 rounded-full ${dlqLag > 0 ? 'bg-rose-400 animate-ping' : 'bg-emerald-400'}`}></span>
                </div>
                <div className="text-3xl font-bold font-mono text-white mt-1">
                  {dlqLag}
                  <span className="text-xs font-normal text-slate-400 ml-1 font-mono">messages</span>
                </div>
              </div>
              <div className="text-[11px] font-mono mt-3">
                {dlqLag > 0 ? (
                  <span className="text-rose-400 flex items-center gap-1 font-semibold">
                    <AlertTriangle className="w-3 h-3" />
                    Batches queued for retry
                  </span>
                ) : (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    Zero DLQ Backlog
                  </span>
                )}
              </div>
            </div>

            {/* dead_letter_records Table Count */}
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-rose-500/20 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                  <span>dead_letter_records</span>
                  <Database className="w-3.5 h-3.5 text-rose-400" />
                </div>
                <div className="text-3xl font-bold font-mono text-rose-300 mt-1">
                  {deadLetterRecordsCount}
                  <span className="text-xs font-normal text-slate-400 ml-1 font-mono">records</span>
                </div>
              </div>
              <div className="text-[11px] font-mono text-slate-400 mt-3 truncate">
                Table: dead_letter_records (Postgres)
              </div>
            </div>
          </div>

          {/* Retry Status Indicator Card */}
          <div className="mt-3.5 p-3.5 rounded-xl bg-slate-950/60 border border-rose-500/20">
            <div className="flex items-center justify-between text-xs font-mono mb-2">
              <span className="text-slate-300 flex items-center gap-1.5 font-semibold">
                <RefreshCw className={`w-3.5 h-3.5 ${retryStatus !== 'IDLE' ? 'animate-spin text-rose-400' : 'text-slate-400'}`} />
                <span>Retry Status Indicator:</span>
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                retryStatus !== 'IDLE'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              }`}>
                {retryStatus === 'IDLE' ? 'NOMINAL / IDLE' : 'EXPONENTIAL BACKOFF + JITTER'}
              </span>
            </div>

            <div className="space-y-1.5 text-[11px] font-mono text-slate-400">
              <div className="flex justify-between">
                <span>Secondary Worker:</span>
                <span className="text-slate-200">dlq_worker.py (Group: metrics-dlq-group)</span>
              </div>
              <div className="flex justify-between">
                <span>Backoff Policy:</span>
                <span className="text-slate-200">base: 1.0s • factor: 2.0^n + rand(0,1)</span>
              </div>
              <div className="flex justify-between">
                <span>Max Retries Threshold:</span>
                <span className="text-slate-200">5 attempts before dead_letter_records</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card Footer */}
        <div className="pt-3 mt-4 border-t border-rose-500/20 flex items-center justify-between text-[11px] font-mono text-rose-200/60">
          <span>Storage Engine: Neon DB Serverless Postgres</span>
          <span>Failover: 100% Non-Blocking</span>
        </div>
      </div>

      {/* 2. Automated Notifications & Streaming Engineering Event Feed (xl:col-span-7) */}
      <div className="xl:col-span-7 glass-panel rounded-2xl p-5 border border-surface-border flex flex-col justify-between">
        <div>
          {/* Header & Filter Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-surface-border gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <Terminal className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white tracking-tight">
                  Automated Pipeline Notifications & Audit Feed
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  Live streaming telemetry events and operational state changes
                </p>
              </div>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1 bg-surface p-1 rounded-xl border border-surface-border text-xs font-mono">
              {[
                { id: 'all', label: 'ALL' },
                { id: 'critical', label: 'ALERT' },
                { id: 'warning', label: 'WARN' },
                { id: 'success', label: 'OK' },
              ].map((pill) => (
                <button
                  key={pill.id}
                  onClick={() => setFilterLevel(pill.id)}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    filterLevel === pill.id
                      ? 'bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>

          {/* Scrolling Log Stream */}
          <div className="mt-4 h-[250px] overflow-y-auto space-y-2 pr-1">
            {filteredEvents.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs font-mono text-slate-500">
                No events matching "{filterLevel}" filter.
              </div>
            ) : (
              filteredEvents.map((evt) => (
                <div
                  key={evt.id}
                  className="p-2.5 rounded-xl bg-surface/60 hover:bg-surface/90 border border-white/5 transition-all flex items-start gap-3 text-xs font-mono"
                >
                  <span className="text-[11px] text-slate-500 pt-0.5 shrink-0">
                    {evt.timestamp}
                  </span>

                  <div className="shrink-0">
                    {getLevelBadge(evt.level)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-cyan-400 font-semibold px-1 rounded bg-cyan-950/40 border border-cyan-800/30">
                        {evt.source}
                      </span>
                      <p className="text-slate-200 text-xs truncate">
                        {evt.message}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Card Footer */}
        <div className="pt-3 mt-4 border-t border-surface-border flex items-center justify-between text-[11px] font-mono text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Streaming live audit log • Retaining latest 40 items
          </span>
          <span className="text-slate-500">Auto-scrolling</span>
        </div>
      </div>
    </div>
  );
}
