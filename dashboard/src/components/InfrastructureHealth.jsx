import React from 'react';
import { 
  Server, 
  Cpu, 
  Layers, 
  Activity, 
  CheckCircle2, 
  AlertCircle, 
  Boxes, 
  HardDrive, 
  ArrowUpRight,
  Sparkles,
  GitCommit,
  Network
} from 'lucide-react';

export default function InfrastructureHealth({
  kafkaLag,
  kafkaPartitions,
  consumerGroupStatus,
  ingestionThroughput,
  currentCpu,
  targetCpu,
  minPods,
  maxPods,
  workerPods,
}) {
  const isScaleTriggered = currentCpu > targetCpu;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
      {/* 1. Kafka Stream Health (xl:col-span-6) */}
      <div className="xl:col-span-6 glass-panel rounded-2xl p-5 border border-surface-border flex flex-col justify-between">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-surface-border">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Network className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-white tracking-tight">
                    Kafka Stream Health
                  </h3>
                  <code className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-950/60 text-blue-300 border border-blue-800/40">
                    metrics-primary
                  </code>
                </div>
                <p className="text-xs text-slate-400 font-mono">
                  KRaft Mode Broker Cluster • Async Non-Blocking Producer
                </p>
              </div>
            </div>

            <span className="flex items-center gap-1.5 text-[11px] font-mono text-emerald-400 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              CLUSTER HEALTHY
            </span>
          </div>

          {/* Kafka Micro-Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-4">
            {/* Topic Lag Micro-Card */}
            <div className="p-3.5 rounded-xl bg-surface/70 border border-surface-border flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                  <span>Topic Lag</span>
                  <span className="text-[10px] px-1 rounded bg-white/5 text-slate-300">Total</span>
                </div>
                <div className="text-2xl font-bold font-mono text-white mt-1">
                  {kafkaLag}
                  <span className="text-xs font-normal text-slate-400 ml-1 font-mono">msgs</span>
                </div>
              </div>
              <div className="text-[10px] font-mono text-emerald-400 flex items-center gap-1 mt-2">
                <CheckCircle2 className="w-3 h-3" />
                <span>Zero message loss backlog</span>
              </div>
            </div>

            {/* Consumer Group Status Micro-Card */}
            <div className="p-3.5 rounded-xl bg-surface/70 border border-surface-border flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                  <span>Consumer Group</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                </div>
                <div className="text-lg font-bold font-mono text-emerald-400 mt-1">
                  {consumerGroupStatus}
                </div>
              </div>
              <div className="text-[10px] font-mono text-slate-400 truncate mt-2">
                grp: metrics-aggregator
              </div>
            </div>

            {/* Ingestion Throughput Micro-Card */}
            <div className="p-3.5 rounded-xl bg-surface/70 border border-surface-border flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                  <span>Ingestion Rate</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-cyan-400" />
                </div>
                <div className="text-2xl font-bold font-mono text-cyan-300 mt-1">
                  {ingestionThroughput.toLocaleString()}
                  <span className="text-xs font-normal text-slate-400 ml-1 font-mono">msg/s</span>
                </div>
              </div>
              <div className="text-[10px] font-mono text-slate-400 mt-2">
                ~{(ingestionThroughput * 0.0011).toFixed(1)} MB/sec bandwidth
              </div>
            </div>
          </div>

          {/* Kafka Partitions Breakdown */}
          <div className="mt-4 pt-4 border-t border-surface-border">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2.5">
              <span>Partition Offsets & Leaders (metrics-primary)</span>
              <span className="text-[10px] text-slate-500">3 Partitions Active</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {kafkaPartitions.map((part) => (
                <div
                  key={part.id}
                  className="p-2.5 rounded-lg bg-surface/40 border border-white/5 flex items-center justify-between text-xs font-mono"
                >
                  <div>
                    <div className="text-slate-200 font-semibold">{part.id}</div>
                    <div className="text-[10px] text-slate-500">{part.leader}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-cyan-400 font-semibold">{part.lag} lag</div>
                    <div className="text-[10px] text-slate-400">{part.messagesPerSec} m/s</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Card Footer */}
        <div className="pt-3 mt-4 border-t border-surface-border flex items-center justify-between text-[11px] font-mono text-slate-400">
          <span>Auto-Offset: <code className="text-slate-300">earliest</code></span>
          <span className="text-slate-500">Commit interval: 1000ms</span>
        </div>
      </div>

      {/* 2. Pipeline & HPA Metrics (xl:col-span-6) */}
      <div className="xl:col-span-6 glass-panel rounded-2xl p-5 border border-surface-border flex flex-col justify-between">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-surface-border">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <Boxes className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-white tracking-tight">
                    Kubernetes HPA & Worker Autoscaling
                  </h3>
                  <code className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/40">
                    primary-worker-hpa
                  </code>
                </div>
                <p className="text-xs text-slate-400 font-mono">
                  Target CPU: 70% • Min: 2 Pods • Max: 10 Pods
                </p>
              </div>
            </div>

            <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full border flex items-center gap-1 ${
              isScaleTriggered
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isScaleTriggered ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'}`}></span>
              {isScaleTriggered ? 'SCALE-UP THRESHOLD MET' : 'DESIRED CAPACITY'}
            </span>
          </div>

          {/* Pods Count Banner & Visualization */}
          <div className="pt-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-purple-950/20 border border-purple-500/20">
              <div>
                <div className="text-xs font-mono text-purple-300">Active Worker Replicas</div>
                <div className="text-2xl font-bold font-mono text-white mt-0.5 flex items-baseline gap-2">
                  <span>Scaled to {workerPods.length}/{maxPods} Pods</span>
                  <span className="text-xs font-normal text-purple-400 font-mono">
                    (Min: {minPods})
                  </span>
                </div>
              </div>

              {/* 10 Pod Slots Visualizer */}
              <div className="flex items-center gap-1.5 bg-surface/80 p-2 rounded-xl border border-white/5">
                {Array.from({ length: maxPods }).map((_, i) => {
                  const isActive = i < workerPods.length;
                  return (
                    <div
                      key={i}
                      className={`w-4 h-7 rounded flex items-center justify-center transition-all ${
                        isActive
                          ? 'bg-purple-500/80 shadow-glow-purple border border-purple-400'
                          : 'bg-slate-800/60 border border-dashed border-slate-700'
                      }`}
                      title={isActive ? `Worker Pod #${i + 1} Active` : `Idle HPA Slot #${i + 1}`}
                    >
                      <span className="text-[9px] font-mono text-white/90">
                        {i + 1}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* CPU Utilization Progress vs Target 70% */}
            <div className="p-3.5 rounded-xl bg-surface/70 border border-surface-border">
              <div className="flex items-center justify-between text-xs font-mono mb-2">
                <span className="text-slate-300 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-purple-400" />
                  <span>Primary Worker Cluster CPU:</span>
                  <span className={`font-bold ${currentCpu > 70 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {currentCpu}%
                  </span>
                </span>
                <span className="text-slate-400">Target Threshold: 70.0%</span>
              </div>

              {/* CPU Bar with 70% threshold marker line */}
              <div className="relative h-3 w-full bg-slate-900 rounded-full overflow-hidden border border-white/10">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    currentCpu > 70 ? 'bg-gradient-to-r from-purple-500 to-amber-500' : 'bg-purple-500'
                  }`}
                  style={{ width: `${Math.min(100, currentCpu)}%` }}
                />
                {/* 70% Marker Line */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10"
                  style={{ left: '70%' }}
                  title="Target 70% Autoscaling Trigger"
                />
              </div>
            </div>

            {/* Micro Worker Pods List */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              {workerPods.slice(0, 4).map((pod, idx) => (
                <div
                  key={pod.id}
                  className="p-2 rounded-lg bg-surface/50 border border-white/5 text-[11px] font-mono"
                >
                  <div className="flex items-center justify-between text-slate-300 pb-1 border-b border-white/5">
                    <span className="font-semibold text-purple-300 truncate">pod-{idx + 1}</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  </div>
                  <div className="mt-1 space-y-0.5 text-[10px] text-slate-400">
                    <div className="flex justify-between">
                      <span>CPU:</span>
                      <span className="text-white font-semibold">{pod.cpu}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>RAM:</span>
                      <span className="text-slate-300">{pod.memoryMb}MB</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Card Footer */}
        <div className="pt-3 mt-4 border-t border-surface-border flex items-center justify-between text-[11px] font-mono text-slate-400">
          <span>Scale Policy: <code className="text-slate-300">+4 Pods / 15s</code></span>
          <span className="text-slate-500">Stabilization: 300s scale-down</span>
        </div>
      </div>
    </div>
  );
}
