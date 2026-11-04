import React, { useRef, useEffect } from 'react';
import { 
  Server, 
  Cpu, 
  Plus, 
  Minus, 
  AlertOctagon, 
  Terminal, 
  Bug
} from 'lucide-react';

export default function HealthResiliencePage({
  activePods = 4,
  maxPods = 10,
  minPods = 2,
  cpuUtilization = 68,
  targetCpu = 70,
  dlqCount = 147,
  logs = [],
  onScaleUp = () => {},
  onScaleDown = () => {},
  onInjectFailure = () => {},
}) {
  const terminalEndRef = useRef(null);

  // Auto-scroll terminal to bottom when new logs arrive
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Safe logs array fallback
  const safeLogs = Array.isArray(logs) ? logs : [];

  return (
    <div className="space-y-6">
      {/* Page Title & Context Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 tracking-tight">
            Health & Resilience
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Kubernetes Horizontal Pod Autoscaler (HPA) and Dead Letter Queue (DLQ) fault recovery.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onInjectFailure}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium text-sm transition-colors active:scale-95 shadow-sm"
            title="Simulate a Neon DB connection failure and witness secondary DLQ retry"
          >
            <Bug className="w-4 h-4" />
            <span>Simulate DB Failure</span>
          </button>
        </div>
      </div>

      {/* Component 1 (Top): Kubernetes Autoscaling (HPA) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-600/10 text-blue-400 border border-blue-500/20">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                Kubernetes Autoscaling (HPA)
              </h3>
              <p className="text-xs text-slate-400">
                Target Deployment: <code className="text-slate-300">primary-worker</code> • Target CPU: 70%
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-slate-400">Manual Mock Scale:</span>
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                onClick={onScaleDown}
                disabled={activePods <= minPods}
                className="p-1.5 rounded hover:bg-slate-800 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Scale Down (-1 Pod)"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="px-2 text-sm font-mono font-bold text-white">
                {activePods}
              </span>
              <button
                onClick={onScaleUp}
                disabled={activePods >= maxPods}
                className="p-1.5 rounded hover:bg-slate-800 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Scale Up (+1 Pod)"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Pods Grid & Utilization Visualizer */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Active vs Inactive Pods Visual Display */}
          <div className="lg:col-span-7 space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-mono uppercase text-slate-400">Worker Pod Allocation</span>
              <span className="text-sm font-mono font-semibold text-slate-200">
                Scaled to {activePods} / {maxPods} Pods (Min: {minPods})
              </span>
            </div>

            {/* Visual Pod Slots (Blue active squares, grey inactive squares) */}
            <div className="grid grid-cols-5 sm:grid-cols-10 gap-2.5 p-4 rounded-xl bg-slate-950/70 border border-slate-800">
              {Array.from({ length: maxPods }).map((_, index) => {
                const isActive = index < activePods;
                return (
                  <div
                    key={index}
                    className={`h-16 rounded-lg flex flex-col items-center justify-center transition-all ${
                      isActive
                        ? 'bg-blue-600 border border-blue-500 text-white'
                        : 'bg-slate-800/60 border border-slate-700/60 text-slate-500'
                    }`}
                  >
                    <span className="text-xs font-mono font-bold">
                      #{index + 1}
                    </span>
                    <span className="text-[10px] font-mono mt-0.5 opacity-80">
                      {isActive ? 'ACTIVE' : 'IDLE'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Current CPU Utilization Meter */}
          <div className="lg:col-span-5 p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
            <div className="flex items-baseline justify-between font-mono">
              <div>
                <div className="text-xs text-slate-400">Current CPU Utilization</div>
                <div className="text-3xl font-bold text-slate-100 mt-0.5">
                  {cpuUtilization}%
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400">Target Threshold</div>
                <div className="text-base font-semibold text-amber-400 mt-0.5">
                  {targetCpu}%
                </div>
              </div>
            </div>

            {/* Horizontal CPU bar with target line */}
            <div className="relative w-full bg-slate-900 rounded-full h-3 border border-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  cpuUtilization > targetCpu ? 'bg-amber-500' : 'bg-blue-600'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, cpuUtilization))}%` }}
              />
              <div
                className="absolute top-0 bottom-0 w-1 bg-amber-400 z-10"
                style={{ left: `${targetCpu}%` }}
                title="70% Autoscaling Trigger Threshold"
              />
            </div>

            <div className="text-[11px] font-mono text-slate-400 flex justify-between pt-1">
              <span>HPA Behavior: +4 pods / 15s</span>
              <span>Downscale Stabilization: 300s</span>
            </div>
          </div>
        </div>
      </div>

      {/* Component 2 (Bottom): DLQ Faults & Logger */}
      <div className="bg-slate-900 border border-red-800/80 rounded-xl p-6 space-y-4">
        {/* Header with Active DLQ Items Count */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-red-900/40 gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-950 text-red-400 border border-red-800">
              <AlertOctagon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-slate-100">
                  DLQ Faults &amp; Secondary Retry Logger
                </h3>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-red-950 text-red-300 border border-red-800">
                  Topic: metrics-dlq
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Fault-tolerant catch block persists failed window envelopes to DLQ before retrying with jitter
              </p>
            </div>
          </div>

          {/* Active DLQ Count Banner */}
          <div className="px-4 py-2 rounded-lg bg-red-950/60 border border-red-700/80 text-right self-start sm:self-auto">
            <div className="text-[11px] font-mono uppercase text-red-300">Pending DLQ Backlog</div>
            <div className="text-2xl font-bold font-mono text-red-400">
              Active DLQ: {dlqCount} Items
            </div>
          </div>
        </div>

        {/* Embedded Terminal Logger */}
        <div>
          <div className="flex items-center justify-between pb-2 text-xs font-mono text-slate-400">
            <div className="flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-slate-400" />
              <span>Pipeline Resilience Audit Log (stdout / stderr)</span>
            </div>
            <span className="text-[11px] text-slate-400">Auto-streaming live</span>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 font-mono text-xs text-slate-300 h-64 overflow-y-auto terminal-scroll space-y-2">
            {safeLogs.length === 0 ? (
              <div className="text-slate-500 py-4 text-center">No audit logs recorded yet.</div>
            ) : (
              safeLogs.map((log, index) => {
                // Failsafe: handle both string and object log formats
                const logMsg = typeof log === 'string' ? log : (log?.message || '');
                const logTime = typeof log === 'string' ? '' : (log?.time || '');
                const logId = log?.id || `log-${index}`;

                const isError = logMsg.includes('ERROR') || logMsg.includes('FAILED');
                const isRetry = logMsg.includes('RETRY') || logMsg.includes('WARN');
                const isSuccess = logMsg.includes('SUCCESS') || logMsg.includes('OK');

                return (
                  <div
                    key={logId}
                    className={`flex items-start gap-2.5 py-1 px-2 rounded ${
                      isError
                        ? 'bg-red-950/30 text-red-300 border-l-2 border-red-500'
                        : isRetry
                        ? 'bg-amber-950/30 text-amber-300 border-l-2 border-amber-500'
                        : isSuccess
                        ? 'bg-emerald-950/30 text-emerald-300 border-l-2 border-emerald-500'
                        : 'text-slate-300'
                    }`}
                  >
                    {logTime ? (
                      <span className="text-slate-400 select-none shrink-0 font-mono text-[11px]">
                        {logTime}
                      </span>
                    ) : null}
                    <span className="leading-relaxed break-all">
                      {logMsg}
                    </span>
                  </div>
                );
              })
            )}
            <div ref={terminalEndRef} />
          </div>
        </div>

        {/* DLQ Specs Footer */}
        <div className="pt-2 border-t border-red-950/40 text-xs font-mono text-slate-400 flex flex-wrap justify-between gap-2">
          <span>Worker: dlq_worker.py (metrics-dlq-group)</span>
          <span>Backoff: Exponential + Random Jitter</span>
          <span>Permanent Table: dead_letter_records (Max Retries: 5)</span>
        </div>
      </div>
    </div>
  );
}
