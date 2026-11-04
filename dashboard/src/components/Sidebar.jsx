import React from 'react';
import { Activity, Clock, ShieldAlert, Wifi, WifiOff } from 'lucide-react';

export default function Sidebar({
  activeTab,
  setActiveTab,
  countdown,
  kafkaLag,
  activePods,
  dataSource = 'live',
  setDataSource = () => {},
  backendStatus = 'OFFLINE',
}) {
  const navItems = [
    {
      id: 'traffic',
      number: '1',
      title: '1. Traffic & Ingestion',
      subtitle: 'API Rate Limiting & Shedding',
      icon: Activity,
    },
    {
      id: 'windowing',
      number: '2',
      title: '2. Stream Windowing',
      subtitle: '60s Redis State & Kafka',
      icon: Clock,
      badge: `${countdown}s`,
    },
    {
      id: 'resilience',
      number: '3',
      title: '3. Health & Resilience',
      subtitle: 'HPA Autoscaling & DLQ',
      icon: ShieldAlert,
      badge: `${activePods} Pods`,
    },
  ];

  return (
    <aside className="w-64 lg:w-72 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 min-h-screen">
      {/* Brand Header */}
      <div className="p-6 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
            SW
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-100 tracking-tight">
              Metrics Aggregator
            </h1>
            <p className="text-xs text-slate-400 font-mono">
              Pipeline Observability
            </p>
          </div>
        </div>

        {/* Live / Mock Data Source Toggle */}
        <div className="mt-4 p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400">Data Feed:</span>
            <span
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                dataSource === 'live' && backendStatus === 'ONLINE'
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                  : dataSource === 'live' && backendStatus === 'OFFLINE'
                  ? 'bg-amber-950 text-amber-400 border border-amber-800'
                  : 'bg-blue-950 text-blue-400 border border-blue-800'
              }`}
            >
              {dataSource === 'live' ? (
                backendStatus === 'ONLINE' ? (
                  <>
                    <Wifi className="w-3 h-3 text-emerald-400" />
                    LIVE ONLINE
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3 h-3 text-amber-400" />
                    FALLBACK MOCK
                  </>
                )
              ) : (
                'MOCK DEMO'
              )}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1 bg-slate-900 p-0.5 rounded border border-slate-800 text-xs font-mono">
            <button
              onClick={() => setDataSource('live')}
              className={`py-1 rounded text-center transition-all ${
                dataSource === 'live'
                  ? 'bg-blue-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Poll real FastAPI gateway and PostgreSQL endpoints"
            >
              Live Backend
            </button>
            <button
              onClick={() => setDataSource('mock')}
              className={`py-1 rounded text-center transition-all ${
                dataSource === 'mock'
                  ? 'bg-blue-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Autonomous offline mock simulation"
            >
              Mock Demo
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 p-4 space-y-2">
        <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 font-mono">
          Pipeline Views
        </div>

        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-start space-x-3 px-3.5 py-3 rounded-lg text-left transition-colors ${
                isActive
                  ? 'bg-blue-600/15 border-l-4 border-blue-500 text-white font-medium'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon
                className={`w-5 h-5 shrink-0 mt-0.5 ${
                  isActive ? 'text-blue-400' : 'text-slate-400'
                }`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className={`text-sm ${isActive ? 'text-slate-100 font-semibold' : 'text-slate-300'}`}>
                    {item.title}
                  </span>
                  {item.badge && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      {item.badge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 truncate mt-0.5">
                  {item.subtitle}
                </p>
              </div>
            </button>
          );
        })}
      </nav>

      {/* Sidebar Footer Metadata */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/40 text-xs font-mono text-slate-400 space-y-1.5">
        <div className="flex justify-between">
          <span>Active Window:</span>
          <span className="text-blue-400 font-semibold">{countdown}s to flush</span>
        </div>
        <div className="flex justify-between">
          <span>Kafka Primary Lag:</span>
          <span className="text-slate-300">{kafkaLag} msgs</span>
        </div>
        <div className="flex justify-between">
          <span>Cluster Replicas:</span>
          <span className="text-slate-300">{activePods} / 10 Pods</span>
        </div>
      </div>
    </aside>
  );
}
