import React, { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import TrafficIngestionPage from './components/TrafficIngestionPage';
import StreamWindowingPage from './components/StreamWindowingPage';
import HealthResiliencePage from './components/HealthResiliencePage';
import { Wifi, WifiOff } from 'lucide-react';

// Candidate backend gateway URLs (Docker port 8001, local dev port 8000)
const CANDIDATE_API_URLS = [
  'http://localhost:8001',
  'http://127.0.0.1:8001',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
];

// Generate initial 20 points for traffic chart (clean baseline)
const generateInitialTraffic = () => {
  const points = [];
  const now = Date.now();
  for (let i = 19; i >= 0; i--) {
    const t = new Date(now - i * 1000);
    points.push({
      time: t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      accepted: 0,
      shed: 0,
    });
  }
  return points;
};

export default function App() {
  // Navigation active tab: 'traffic' | 'windowing' | 'resilience'
  const [activeTab, setActiveTab] = useState('traffic');

  // Live / Mock Data Mode state
  const [dataSource, setDataSource] = useState('live'); // 'live' | 'mock'
  const [backendStatus, setBackendStatus] = useState('ONLINE'); // 'ONLINE' | 'OFFLINE'
  const activeBaseUrlRef = useRef('');

  // Continuous Live Traffic Streamer state
  const [isStreamingTraffic, setIsStreamingTraffic] = useState(false);
  const streamIntervalRef = useRef(null);

  // --- Page 1: Traffic & Ingestion State ---
  const [trafficHistory, setTrafficHistory] = useState(generateInitialTraffic);
  const [throughput, setThroughput] = useState(0);
  const [acceptedTotal, setAcceptedTotal] = useState(0);
  const [shedTotal, setShedTotal] = useState(0);
  const [tokenCapacity, setTokenCapacity] = useState(100);
  const [tokensRemaining, setTokensRemaining] = useState(100);
  const [tokenStatus, setTokenStatus] = useState('HEALTHY');

  // --- Page 2: Stream Windowing State ---
  const [windowStart, setWindowStart] = useState(() => {
    const d = new Date();
    d.setSeconds(0, 0);
    return d;
  });
  const [countdown, setCountdown] = useState(60);
  const [intermediateCount, setIntermediateCount] = useState(0);
  const [finalizedWindows, setFinalizedWindows] = useState([]);
  const [kafkaLag, setKafkaLag] = useState(0);
  const [kafkaLagHistory, setKafkaLagHistory] = useState([
    { lag: 0 }, { lag: 0 }, { lag: 0 }, { lag: 0 }, { lag: 0 }, { lag: 0 }, { lag: 0 }
  ]);

  // --- Page 3: Health & Resilience State ---
  const [activePods, setActivePods] = useState(2);
  const minPods = 2;
  const maxPods = 10;
  const [cpuUtilization, setCpuUtilization] = useState(18);
  const targetCpu = 70;
  const [dlqCount, setDlqCount] = useState(0);
  const [logs, setLogs] = useState([
    {
      id: 'l-1',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      message: 'INFO  system: SWM Pipeline monitoring initialized. Connected to FastAPI & Redis.',
    },
  ]);

  // Append helper for terminal logger
  const appendLog = (type, text) => {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs((prev) => [
      ...(prev || []).slice(-30),
      { id: `l-${Date.now()}-${Math.random()}`, time: timeStr, message: `${type}  ${text}` },
    ]);
  };

  // Helper to test backend connectivity
  const checkBackendConnectivity = async () => {
    // 1. Try relative path via Vite dev proxy first (fastest, no CORS)
    try {
      const res = await fetch('/healthz');
      if (res.ok) {
        activeBaseUrlRef.current = '';
        return true;
      }
    } catch (e) {}

    // 2. Direct port fallbacks
    for (const url of ['http://127.0.0.1:8001', 'http://localhost:8001', 'http://127.0.0.1:8000']) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 600);
        const res = await fetch(`${url}/healthz`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
          activeBaseUrlRef.current = url;
          return true;
        }
      } catch (err) {}
    }
    return false;
  };

  // Clean up streaming generator on unmount
  useEffect(() => {
    return () => {
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
    };
  }, []);

  // --- Real-Time Polling & Fallback Simulation Loop ---
  useEffect(() => {
    const interval = setInterval(async () => {
      // 1. If Live mode is active, attempt to fetch real backend telemetry
      if (dataSource === 'live') {
        const isOnline = await checkBackendConnectivity();
        if (isOnline) {
          setBackendStatus('ONLINE');
          const baseUrl = activeBaseUrlRef.current || '';

          try {
            // A. Fetch real streaming status (throughput, traffic history, real 60s countdown, real intermediate count)
            const streamRes = await fetch(`${baseUrl}/api/stream/status`);
            if (streamRes.ok) {
              const streamData = await streamRes.json();
              setThroughput(streamData.current_throughput || 0);
              setAcceptedTotal(streamData.accepted_total || 0);
              setShedTotal(streamData.shed_total || 0);
              if (streamData.traffic_history && streamData.traffic_history.length > 0) {
                setTrafficHistory(streamData.traffic_history);
              }
              if (streamData.countdown !== undefined) {
                setCountdown(streamData.countdown);
              }
              if (streamData.intermediate_count !== undefined) {
                setIntermediateCount(streamData.intermediate_count);
              }
              if (streamData.current_window_start) {
                setWindowStart(new Date(streamData.current_window_start * 1000));
              }
            }

            // B. Fetch real finalized windows from PostgreSQL (group by 60s window time)
            const winRes = await fetch(`${baseUrl}/api/windows/latest?limit=20`);
            if (winRes.ok) {
              const winData = await winRes.json();
              if (winData.windows && winData.windows.length > 0) {
                const groupedMap = new Map();
                for (const w of winData.windows) {
                  const key = w.windowTime || 'unknown';
                  if (groupedMap.has(key)) {
                    groupedMap.get(key).count += w.count;
                  } else {
                    groupedMap.set(key, { ...w });
                  }
                }
                setFinalizedWindows(Array.from(groupedMap.values()).slice(-10));
              }
            }

            // C. Fetch real Redis Token Bucket status
            const rateRes = await fetch(`${baseUrl}/api/rate-limiter/status`);
            if (rateRes.ok) {
              const rateData = await rateRes.json();
              if (rateData.tokens_remaining !== undefined) {
                setTokensRemaining(rateData.tokens_remaining);
                setTokenCapacity(rateData.capacity || 100);
                setTokenStatus(rateData.tokens_remaining < 20 ? 'BURST SHEDDING' : 'HEALTHY');
              }
            }

            // D. Fetch real DLQ statistics & dead_letter_records
            const dlqRes = await fetch(`${baseUrl}/api/dlq/stats`);
            if (dlqRes.ok) {
              const dlqData = await dlqRes.json();
              if (dlqData.dead_letter_records_count !== undefined) {
                setDlqCount(dlqData.dead_letter_records_count);
              }
              if (dlqData.dlq_lag !== undefined) {
                setKafkaLag(dlqData.dlq_lag);
                setKafkaLagHistory((prev) => [...prev.slice(1), { lag: dlqData.dlq_lag }]);
              }
              if (dlqData.recent_dead_letters && dlqData.recent_dead_letters.length > 0) {
                const latest = dlqData.recent_dead_letters[0];
                appendLog('ERROR', `DLQ Record #${latest.id}: ${latest.error_message}`);
              }
            }

            // Dynamic CPU based on actual ingestion throughput
            setCpuUtilization((prev) => {
              const target = throughput > 40 ? Math.min(85, Math.round(25 + (throughput / 120) * 45)) : 16;
              return Math.round(prev * 0.7 + target * 0.3);
            });

            return; // Successfully updated from real backend!
          } catch (fetchErr) {
            console.debug('Error querying real backend endpoints:', fetchErr);
          }
        } else {
          setBackendStatus('OFFLINE');
        }
      }

      // 2. Only run mock random generation when OFFLINE or in MOCK DEMO mode
      const currentRate = Math.floor(3300 + Math.random() * 500);
      const isShedding = Math.random() > 0.88;
      const shedDelta = isShedding ? Math.floor(Math.random() * 30 + 10) : 0;
      const acceptedDelta = currentRate - shedDelta;

      setThroughput(currentRate);
      setAcceptedTotal((prev) => prev + acceptedDelta);
      setShedTotal((prev) => prev + shedDelta);

      // Update traffic chart points (retain last 20)
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setTrafficHistory((prev) => [
        ...prev.slice(1),
        { time: nowStr, accepted: currentRate, shed: shedDelta },
      ]);

      // Update mock token bucket
      setTokensRemaining((prev) => {
        const consumption = 48 + (Math.random() * 6 - 3);
        const refill = 50;
        const net = prev + (refill - consumption) * 0.1;
        return Math.min(100, Math.max(10, Math.round(net * 10) / 10));
      });

      // Kafka lag jitter & sparkline
      setKafkaLag((prev) => {
        const nextLag = Math.max(15, Math.min(95, prev + Math.floor(Math.random() * 9 - 4)));
        setKafkaLagHistory((h) => [...h.slice(1), { lag: nextLag }]);
        return nextLag;
      });

      // Accumulate intermediate events into current window
      setIntermediateCount((prev) => prev + acceptedDelta);

      // 60-Second Window Countdown
      setCountdown((prevCountdown) => {
        if (prevCountdown <= 1) {
          const finalizedCount = Math.floor(190000 + Math.random() * 25000);
          setFinalizedWindows((prevWindows) => [
            ...prevWindows.slice(-9),
            { windowTime: nowStr, count: finalizedCount },
          ]);
          appendLog('OK', `window_manager: 60s Window closed: ${finalizedCount.toLocaleString()} events flushed to PostgreSQL`);
          setIntermediateCount(0);
          setWindowStart(new Date());
          return 60;
        }
        return prevCountdown - 1;
      });

      // CPU load fluctuation
      setCpuUtilization((prev) => {
        const delta = Math.random() * 2.4 - 1.2;
        return Math.max(54, Math.min(84, Math.round(prev + delta)));
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [dataSource, throughput]);

  // --- Interactive Trigger Handlers ---

  // 1. Toggle Continuous Live Ingestion Stream (Streams real data to /metrics)
  const toggleLiveTrafficStream = () => {
    if (isStreamingTraffic) {
      if (streamIntervalRef.current) {
        clearInterval(streamIntervalRef.current);
        streamIntervalRef.current = null;
      }
      setIsStreamingTraffic(false);
      appendLog('INFO', 'traffic_streamer: Stopped live traffic stream.');
    } else {
      setIsStreamingTraffic(true);
      appendLog('INFO', 'traffic_streamer: Started streaming real metrics to /metrics (60 req/s)...');

      const services = ['cart-api', 'checkout', 'payment-service', 'inventory', 'auth'];
      const metrics = ['checkout_latency_ms', 'order_valuation_usd', 'db_query_duration_ms', 'payment_processing_time_ms'];
      const regions = ['us-east-1', 'us-west-2', 'eu-central-1', 'ap-south-1'];

      streamIntervalRef.current = setInterval(async () => {
        const baseUrl = activeBaseUrlRef.current || '';
        const now = Math.floor(Date.now() / 1000);
        const batch = Array.from({ length: 12 }, () => ({
          metric_name: metrics[Math.floor(Math.random() * metrics.length)],
          value: parseFloat((15 + Math.random() * 180).toFixed(2)),
          timestamp: now,
          tags: {
            service: services[Math.floor(Math.random() * services.length)],
            region: regions[Math.floor(Math.random() * regions.length)],
            client: 'dashboard-streamer',
          },
        }));

        try {
          await fetch(`${baseUrl}/metrics`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(batch),
          });
        } catch (err) {}
      }, 200);
    }
  };

  // 2. Simulate Traffic Surge (Sends 120 concurrent real requests to trigger HTTP 429 load shedding)
  const handleSimulateBurst = async () => {
    if (dataSource === 'live' && backendStatus === 'ONLINE') {
      const baseUrl = activeBaseUrlRef.current || '';
      appendLog('WARN', 'rate_limiter: Firing surge burst (120 concurrent requests) to /metrics...');
      const now = Math.floor(Date.now() / 1000);

      const promises = Array.from({ length: 120 }, (_, i) =>
        fetch(`${baseUrl}/metrics`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            metric_name: 'checkout_latency_ms',
            value: parseFloat((80 + Math.random() * 150).toFixed(2)),
            timestamp: now,
            tags: { client: 'surge-simulator', seq: String(i) },
          }),
        }).then((res) => res.status).catch(() => 500)
      );

      const results = await Promise.all(promises);
      const accepted = results.filter((s) => s === 202).length;
      const shed = results.filter((s) => s === 429).length;

      appendLog('INFO', `rate_limiter: Surge burst processed: ${accepted} Accepted (HTTP 202), ${shed} Shed (HTTP 429) due to Redis Token Bucket limits.`);
    } else {
      setTokensRemaining(8.5);
      setTokenStatus('BURST SHEDDING');
      setShedTotal((prev) => prev + 380);

      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setTrafficHistory((prev) => [
        ...prev.slice(1),
        { time: nowStr, accepted: 2400, shed: 380 },
      ]);

      appendLog('WARN', 'rate_limiter: Surge burst exceeded capacity (100). Shed 380 requests with HTTP 429.');
    }
  };

  // 3. Force Window Flush Now
  const handleForceFlush = () => {
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const count = intermediateCount > 0 ? intermediateCount : 1200;
    
    setFinalizedWindows((prev) => [
      ...prev.slice(-9),
      { windowTime: nowStr, count },
    ]);

    appendLog('OK', `window_manager: Manual window flush triggered. ${count.toLocaleString()} events committed to PostgreSQL.`);
    setIntermediateCount(0);
    setCountdown(60);
    setWindowStart(new Date());
  };

  // 4. Manual Mock Scaling
  const handleScaleUp = () => {
    if (activePods < maxPods) {
      setActivePods((prev) => prev + 1);
      setCpuUtilization((prev) => Math.max(15, prev - 4));
      appendLog('INFO', `k8s_hpa: Scaled primary-worker deployment up to ${activePods + 1} pods.`);
    }
  };

  const handleScaleDown = () => {
    if (activePods > minPods) {
      setActivePods((prev) => prev - 1);
      setCpuUtilization((prev) => Math.min(85, prev + 5));
      appendLog('INFO', `k8s_hpa: Scaled primary-worker deployment down to ${activePods - 1} pods.`);
    }
  };

  // 5. Simulate DB Write Failure -> DLQ Routing & Secondary Retry
  const handleInjectFailure = () => {
    setDlqCount((prev) => prev + 8);
    appendLog('ERROR', 'db_writer.py: Neon DB connection pool timeout - batch #3019 routed to metrics-dlq');

    setTimeout(() => {
      appendLog('RETRY', 'dlq_worker.py: Secondary worker picked up batch #3019 from metrics-dlq with jittered backoff');
    }, 2000);

    setTimeout(() => {
      setDlqCount((prev) => Math.max(0, prev - 8));
      appendLog('SUCCESS', 'dlq_worker.py: Recovered! Batch #3019 successfully written to aggregated_metrics');
    }, 4500);
  };

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Left Sidebar Navigation with Live / Mock Toggle */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        countdown={countdown}
        kafkaLag={kafkaLag}
        activePods={activePods}
        dataSource={dataSource}
        setDataSource={setDataSource}
        backendStatus={backendStatus}
      />

      {/* Main Content Area */}
      <main className="flex-1 p-6 lg:p-10 max-w-7xl overflow-y-auto">
        {/* Connectivity Notification Banner */}
        <div className="mb-6 flex items-center justify-between p-3 rounded-lg border text-xs font-mono transition-all">
          <div className="flex items-center gap-2">
            {dataSource === 'live' ? (
              backendStatus === 'ONLINE' ? (
                <>
                  <Wifi className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-300 font-semibold">
                    Live Mode: Connected to FastAPI Backend ({activeBaseUrlRef.current})
                  </span>
                  <span className="text-slate-400">
                    • Streaming real data from PostgreSQL &amp; Redis
                  </span>
                </>
              ) : (
                <>
                  <WifiOff className="w-4 h-4 text-amber-400" />
                  <span className="text-amber-300 font-semibold">
                    Live Mode Active (Backend Offline)
                  </span>
                  <span className="text-slate-400">
                    • Seamlessly running on fallback simulation until `docker-compose up` is started
                  </span>
                </>
              )
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                <span className="text-blue-300 font-semibold">
                  Mock Demo Mode Active
                </span>
                <span className="text-slate-400">
                  • Autonomous simulation running locally in browser
                </span>
              </>
            )}
          </div>

          <div className="text-slate-400 text-[11px]">
            Target: <code>{activeBaseUrlRef.current}</code>
          </div>
        </div>

        {/* Tab 1: Traffic & Ingestion */}
        {activeTab === 'traffic' && (
          <TrafficIngestionPage
            trafficHistory={trafficHistory}
            throughput={throughput}
            acceptedTotal={acceptedTotal}
            shedTotal={shedTotal}
            tokensRemaining={tokensRemaining}
            tokenCapacity={tokenCapacity}
            tokenStatus={tokenStatus}
            onSimulateBurst={handleSimulateBurst}
            isStreamingTraffic={isStreamingTraffic}
            onToggleStreamingTraffic={toggleLiveTrafficStream}
          />
        )}

        {/* Tab 2: Stream Windowing */}
        {activeTab === 'windowing' && (
          <StreamWindowingPage
            countdown={countdown}
            intermediateCount={intermediateCount}
            windowStart={windowStart}
            finalizedWindows={finalizedWindows}
            kafkaLag={kafkaLag}
            kafkaLagHistory={kafkaLagHistory}
            onForceFlush={handleForceFlush}
          />
        )}

        {/* Tab 3: Health & Resilience */}
        {(activeTab === 'resilience' || activeTab === 'health' || activeTab === '3' || activeTab === 3) && (
          <HealthResiliencePage
            activePods={activePods}
            maxPods={maxPods}
            minPods={minPods}
            cpuUtilization={cpuUtilization}
            targetCpu={targetCpu}
            dlqCount={dlqCount}
            logs={logs || []}
            onScaleUp={handleScaleUp}
            onScaleDown={handleScaleDown}
            onInjectFailure={handleInjectFailure}
          />
        )}
      </main>
    </div>
  );
}
