import React, { useState } from 'react';
import { 
  GitBranch, 
  ArrowRight, 
  CheckCircle2, 
  Server, 
  Cpu, 
  Database, 
  ShieldAlert, 
  Zap, 
  ChevronDown, 
  ChevronUp,
  Layers
} from 'lucide-react';

export default function ArchitectureFlowBar() {
  const [isOpen, setIsOpen] = useState(false);

  const phases = [
    {
      num: '01',
      title: 'FastAPI Ingestion & Load Shedding',
      tech: 'FastAPI + Redis Token Bucket',
      color: 'border-cyan-500/30 text-cyan-400 bg-cyan-950/20',
      desc: 'Atomic Lua checks capacity (100 tokens, 50/s refill). Drops surge requests with HTTP 429.',
    },
    {
      num: '02',
      title: '60s Tumbling Window Aggregator',
      tech: 'Kafka metrics-primary + Redis State',
      color: 'border-purple-500/30 text-purple-400 bg-purple-950/20',
      desc: 'Consumer group metrics-aggregator-group buffers micro-batches into epoch-aligned 60s buckets.',
    },
    {
      num: '03',
      title: 'Storage & DLQ Resilience Fallback',
      tech: 'Neon DB / Postgres + metrics-dlq',
      color: 'border-rose-500/30 text-rose-400 bg-rose-950/20',
      desc: 'Distributed lock flushes window. DB timeout routes to metrics-dlq for exponential backoff retry.',
    },
    {
      num: '04',
      title: 'Kubernetes HPA Autoscaling',
      tech: 'primary-worker-hpa (CPU > 70%)',
      color: 'border-emerald-500/30 text-emerald-400 bg-emerald-950/20',
      desc: 'Horizontal Pod Autoscaler dynamically scales primary workers between 2 and 10 pods.',
    },
  ];

  return (
    <div className="glass-panel rounded-2xl p-4 border border-surface-border">
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between cursor-pointer select-none"
      >
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg bg-white/5 text-slate-300">
            <GitBranch className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-white font-mono">
                PIPELINE TOPOLOGY ARCHITECTURE
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/5 text-slate-400">
                4 PHASES CONFIGURED
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              FastAPI Gateway ➔ Kafka KRaft ➔ Tumbling Window Worker ➔ Neon DB &amp; DLQ ➔ Kube HPA
            </p>
          </div>
        </div>

        <button className="flex items-center gap-1 text-xs font-mono text-cyan-400 hover:text-cyan-300">
          <span>{isOpen ? 'Collapse Diagram' : 'View Pipeline Architecture'}</span>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {isOpen && (
        <div className="mt-4 pt-4 border-t border-surface-border grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 animate-fadeIn">
          {phases.map((p, idx) => (
            <div
              key={p.num}
              className={`p-3.5 rounded-xl border ${p.color} flex flex-col justify-between`}
            >
              <div>
                <div className="flex items-center justify-between text-xs font-mono mb-1">
                  <span className="font-bold opacity-60">PHASE {p.num}</span>
                  <CheckCircle2 className="w-3.5 h-3.5 opacity-80" />
                </div>
                <div className="text-xs font-semibold text-white font-mono">{p.title}</div>
                <div className="text-[10px] text-slate-300 font-mono mt-0.5">{p.tech}</div>
                <p className="text-[11px] text-slate-400 font-mono mt-2 leading-relaxed">
                  {p.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
