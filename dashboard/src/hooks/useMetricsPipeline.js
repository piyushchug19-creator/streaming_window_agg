import { useState, useEffect, useRef, useCallback } from 'react';

// Generates initial 20 window samples
const generateInitialWindows = () => {
  const points = [];
  const now = Date.now();
  for (let i = 19; i >= 0; i--) {
    const timestamp = now - i * 60000;
    const date = new Date(timestamp);
    const timeStr = date.toTimeString().split(' ')[0];
    
    // Base variations
    const baseThroughput = 3400 + Math.sin(i * 0.5) * 800 + (Math.random() * 400 - 200);
    const p50 = 8.5 + Math.random() * 2.5;
    const p95 = 22.0 + Math.random() * 6.0;
    const p99 = 48.0 + Math.random() * 18.0;
    const shed = Math.random() > 0.7 ? Math.floor(Math.random() * 120 + 20) : 0;
    const accepted = Math.floor(baseThroughput * 60 - shed);

    points.push({
      id: `win-${2800 + (20 - i)}`,
      timestamp,
      time: timeStr,
      windowStart: Math.floor(timestamp / 60000) * 60,
      windowEnd: Math.floor(timestamp / 60000) * 60 + 60,
      throughput: Math.round(baseThroughput),
      latencyP50: Number(p50.toFixed(1)),
      latencyP95: Number(p95.toFixed(1)),
      latencyP99: Number(p99.toFixed(1)),
      acceptedRequests: accepted,
      shedRequests: shed,
      activeKeys: 48 + Math.floor(Math.random() * 12),
      cpu: Math.round(58 + Math.sin(i * 0.4) * 14 + Math.random() * 6),
    });
  }
  return points;
};

const INITIAL_EVENTS = [
  {
    id: 'evt-1',
    timestamp: '21:14:32',
    level: 'info',
    badge: 'INFO',
    source: 'KafkaConsumer',
    message: 'Consumer group metrics-aggregator-group synchronized with 3 partitions',
  },
  {
    id: 'evt-2',
    timestamp: '21:14:48',
    level: 'success',
    badge: 'SUCCESS',
    source: 'WindowManager',
    message: 'Window #2818 closed: 218,400 metrics aggregated & flushed to PostgreSQL',
  },
  {
    id: 'evt-3',
    timestamp: '21:15:02',
    level: 'warning',
    badge: 'WARN',
    source: 'TokenBucket',
    message: 'Rate Limiter dropped 200 reqs (HTTP 429) - burst exceeded 100 capacity',
  },
  {
    id: 'evt-4',
    timestamp: '21:15:15',
    level: 'success',
    badge: 'SUCCESS',
    source: 'KubeHPA',
    message: 'HPA scaled up to 4 pods (Target CPU: 70%, Current: 74.2%)',
  },
  {
    id: 'evt-5',
    timestamp: '21:15:30',
    level: 'critical',
    badge: 'ALERT',
    source: 'DBWriter',
    message: 'DB write failed (Neon DB pool timeout), batch routed to metrics-dlq',
  },
];

export function useMetricsPipeline() {
  const [isRunning, setIsRunning] = useState(true);
  const [simulationSpeed, setSimulationSpeed] = useState(1); // 1x, 2x, 5x
  
  // Real-time window metrics
  const [windows, setWindows] = useState(generateInitialWindows);
  const [windowProgress, setWindowProgress] = useState(38); // 0 to 60 seconds progress in current tumbling window
  
  // Traffic & Rate Limiting (Token Bucket)
  const [tokenCapacity] = useState(100.0);
  const [tokensRemaining, setTokensRemaining] = useState(82.4);
  const [refillRate] = useState(50.0); // tokens/sec
  const [acceptedTotal, setAcceptedTotal] = useState(482150);
  const [shedTotal, setShedTotal] = useState(14820);
  const [recentAcceptedRate, setRecentAcceptedRate] = useState(3850);
  const [recentShedRate, setRecentShedRate] = useState(42);

  // Kafka Stream Health
  const [kafkaLag, setKafkaLag] = useState(142);
  const [kafkaPartitions, setKafkaPartitions] = useState([
    { id: 'partition-0', lag: 45, leader: 'broker-1', messagesPerSec: 1280 },
    { id: 'partition-1', lag: 52, leader: 'broker-2', messagesPerSec: 1310 },
    { id: 'partition-2', lag: 45, leader: 'broker-3', messagesPerSec: 1260 },
  ]);
  const [consumerGroupStatus, setConsumerGroupStatus] = useState('STABLE'); // STABLE, REBALANCING
  const [ingestionThroughput, setIngestionThroughput] = useState(3850); // msg/sec

  // Kubernetes HPA & Worker Pods
  const [currentCpu, setCurrentCpu] = useState(68.5);
  const [targetCpu] = useState(70.0);
  const [minPods] = useState(2);
  const [maxPods] = useState(10);
  const [workerPods, setWorkerPods] = useState([
    { id: 'primary-worker-7b9f8d-9kx2z', status: 'Running', cpu: 67, memoryMb: 312, age: '4h 12m', restarts: 0 },
    { id: 'primary-worker-7b9f8d-pl48w', status: 'Running', cpu: 71, memoryMb: 298, age: '4h 12m', restarts: 0 },
    { id: 'primary-worker-7b9f8d-mq71v', status: 'Running', cpu: 69, memoryMb: 320, age: '1h 45m', restarts: 0 },
    { id: 'primary-worker-7b9f8d-cx99b', status: 'Running', cpu: 67, memoryMb: 305, age: '28m', restarts: 0 },
  ]);

  // DLQ Resilience & Storage
  const [dlqLag, setDlqLag] = useState(0);
  const [deadLetterRecordsCount, setDeadLetterRecordsCount] = useState(18);
  const [retryStatus, setRetryStatus] = useState('IDLE'); // IDLE, RETRYING, EXPONENTIAL_BACKOFF
  const [retryAttempts, setRetryAttempts] = useState(0);
  const [dlqActiveErrors, setDlqActiveErrors] = useState([]);

  // Notifications & Logging feed
  const [eventFeed, setEventFeed] = useState(INITIAL_EVENTS);
  const [activeToasts, setActiveToasts] = useState([
    {
      id: 'toast-initial',
      title: 'Pipeline Ingestion Normal',
      message: 'Processing ~3,850 msg/sec with 0 DLQ lag across 4 pods.',
      type: 'info',
      time: 'Just now'
    }
  ]);

  // Metric display mode for Hero Chart: 'throughput' | 'latency' | 'all'
  const [activeMetricMode, setActiveMetricMode] = useState('all');

  // Trigger burst load
  const triggerTrafficSpike = useCallback(() => {
    setTokensRemaining(0);
    setRecentShedRate((prev) => prev + 350);
    setShedTotal((prev) => prev + 350);
    setCurrentCpu((prev) => Math.min(94, prev + 22));

    const timestamp = new Date().toTimeString().split(' ')[0];
    const newEvent = {
      id: `evt-${Date.now()}`,
      timestamp,
      level: 'warning',
      badge: 'RATE_LIMIT',
      source: 'TokenBucket',
      message: `🟡 Rate Limiter dropped 350 reqs (HTTP 429) - token bucket exhausted`,
    };

    setEventFeed((prev) => [newEvent, ...prev.slice(0, 40)]);
    addToast({
      title: 'Load Shedding Active (HTTP 429)',
      message: 'Surge burst exceeded 100 token capacity. 350 requests shed safely.',
      type: 'warning',
    });
  }, []);

  // Trigger Database Outage simulation
  const triggerDatabaseOutage = useCallback(() => {
    setDlqLag((prev) => prev + 8);
    setRetryStatus('EXPONENTIAL_BACKOFF');
    setRetryAttempts(1);
    
    const timestamp = new Date().toTimeString().split(' ')[0];
    const newEvent = {
      id: `evt-${Date.now()}`,
      timestamp,
      level: 'critical',
      badge: 'DLQ_DISPATCH',
      source: 'DBWriter',
      message: `🔴 DB write failed: Neon DB connection timeout; 8 batch envelopes routed to metrics-dlq`,
    };

    setEventFeed((prev) => [newEvent, ...prev.slice(0, 40)]);
    addToast({
      title: 'Database Flush Exception',
      message: 'Neon DB pool timeout: Batches redirected to metrics-dlq for jittered backoff.',
      type: 'critical',
    });

    // Automatically simulate recovery after 6 seconds
    setTimeout(() => {
      setDlqLag(0);
      setRetryStatus('IDLE');
      setRetryAttempts(0);
      setDeadLetterRecordsCount((prev) => prev + 1);

      const recTime = new Date().toTimeString().split(' ')[0];
      const recEvent = {
        id: `evt-${Date.now()}`,
        timestamp: recTime,
        level: 'success',
        badge: 'DLQ_RECOVERED',
        source: 'DLQWorker',
        message: `🟢 DLQ worker recovered: 7 batches successfully upserted to PostgreSQL; 1 unrecoverable stored in dead_letter_records`,
      };
      setEventFeed((prev) => [recEvent, ...prev.slice(0, 40)]);
      addToast({
        title: 'DLQ Retry Completed',
        message: 'Secondary worker drained metrics-dlq with exponential backoff & jitter.',
        type: 'success',
      });
    }, 6000);
  }, []);

  // Helper to add toast
  const addToast = (toast) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    const newToast = { ...toast, id, time: 'Just now' };
    setActiveToasts((prev) => [newToast, ...prev.slice(0, 3)]);

    setTimeout(() => {
      setActiveToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  };

  const removeToast = (id) => {
    setActiveToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Main real-time simulation loop
  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      // 1. Update window timer progress (60s tumbling window)
      setWindowProgress((prev) => {
        const next = prev + 1;
        if (next >= 60) {
          // Window closed! Trigger window flush event
          const now = Date.now();
          const timeStr = new Date(now).toTimeString().split(' ')[0];
          const newThroughput = Math.round(3500 + Math.random() * 800);
          const p50 = Number((8.2 + Math.random() * 3).toFixed(1));
          const p95 = Number((21.5 + Math.random() * 8).toFixed(1));
          const p99 = Number((49.0 + Math.random() * 20).toFixed(1));
          const newShed = Math.random() > 0.85 ? Math.floor(Math.random() * 90) : 0;
          const newAccepted = newThroughput * 60 - newShed;

          const newWindow = {
            id: `win-${Math.floor(now / 1000)}`,
            timestamp: now,
            time: timeStr,
            windowStart: Math.floor(now / 60000) * 60,
            windowEnd: Math.floor(now / 60000) * 60 + 60,
            throughput: newThroughput,
            latencyP50: p50,
            latencyP95: p95,
            latencyP99: p99,
            acceptedRequests: newAccepted,
            shedRequests: newShed,
            activeKeys: 50 + Math.floor(Math.random() * 10),
            cpu: Math.round(currentCpu),
          };

          setWindows((prevWindows) => [...prevWindows.slice(1), newWindow]);

          // Log window flush event
          const flushEvent = {
            id: `evt-${Date.now()}`,
            timestamp: timeStr,
            level: 'success',
            badge: 'WINDOW_FLUSH',
            source: 'WindowManager',
            message: `🟢 Window #win-${Math.floor(now / 60000) % 10000} closed: ${newAccepted.toLocaleString()} metrics upserted to PostgreSQL`,
          };
          setEventFeed((prev) => [flushEvent, ...prev.slice(0, 40)]);

          return 0; // Reset progress for the next tumbling window
        }
        return next;
      });

      // 2. Token Bucket replenishments & subtle jitter
      setTokensRemaining((prev) => {
        // Refill at 50/sec divided by tick, minus consumption jitter
        const consumption = 48 + (Math.random() * 6 - 3);
        const refill = 50;
        const net = prev + (refill - consumption) * 0.2;
        return Math.max(8.0, Math.min(100.0, Number(net.toFixed(1))));
      });

      // 3. Ingestion throughput & Partition lag fluctuations
      setIngestionThroughput((prev) => {
        const delta = Math.floor(Math.random() * 120 - 60);
        return Math.max(3100, Math.min(4600, prev + delta));
      });

      setKafkaPartitions((prevPartitions) => {
        return prevPartitions.map((p, idx) => {
          const lagNoise = Math.floor(Math.random() * 9 - 4);
          const newLag = Math.max(12, Math.min(120, p.lag + lagNoise));
          return {
            ...p,
            lag: newLag,
            messagesPerSec: Math.round(ingestionThroughput / 3 + (Math.random() * 40 - 20)),
          };
        });
      });

      setKafkaLag((prev) => {
        const total = 35 + Math.floor(Math.random() * 30);
        return total;
      });

      // 4. Update Accepted vs Shed counters
      setAcceptedTotal((prev) => prev + Math.floor(3800 / 5));
      if (Math.random() > 0.88) {
        setShedTotal((prev) => prev + Math.floor(Math.random() * 15 + 2));
      }

      // 5. HPA & CPU fluctuations
      setCurrentCpu((prev) => {
        const delta = (Math.random() * 3.4 - 1.6);
        const next = Math.max(52.0, Math.min(88.0, Number((prev + delta).toFixed(1))));
        
        // Dynamic HPA scaling logic if CPU > 74%
        if (next > 74 && workerPods.length < 5) {
          const newPod = {
            id: `primary-worker-7b9f8d-${Math.random().toString(36).substring(2, 7)}`,
            status: 'Running',
            cpu: 65,
            memoryMb: 280,
            age: '1m',
            restarts: 0,
          };
          setWorkerPods((prevPods) => [...prevPods, newPod]);
          const time = new Date().toTimeString().split(' ')[0];
          const scaleEvt = {
            id: `evt-${Date.now()}`,
            timestamp: time,
            level: 'info',
            badge: 'HPA_SCALE',
            source: 'KubeHPA',
            message: `🟢 HPA scaled worker pods from 4 to 5 (CPU at ${next}%)`,
          };
          setEventFeed((p) => [scaleEvt, ...p.slice(0, 40)]);
          addToast({
            title: 'HPA Scale-Out Triggered',
            message: `Target 70% exceeded (${next}%). Spawned 5th worker pod.`,
            type: 'info',
          });
        }
        return next;
      });

    }, 1000 / simulationSpeed);

    return () => clearInterval(interval);
  }, [isRunning, simulationSpeed, currentCpu, workerPods.length, ingestionThroughput]);

  return {
    isRunning,
    setIsRunning,
    simulationSpeed,
    setSimulationSpeed,
    windows,
    windowProgress,
    tokenCapacity,
    tokensRemaining,
    refillRate,
    acceptedTotal,
    shedTotal,
    recentAcceptedRate,
    recentShedRate,
    kafkaLag,
    kafkaPartitions,
    consumerGroupStatus,
    ingestionThroughput,
    currentCpu,
    targetCpu,
    minPods,
    maxPods,
    workerPods,
    dlqLag,
    deadLetterRecordsCount,
    retryStatus,
    retryAttempts,
    eventFeed,
    activeToasts,
    activeMetricMode,
    setActiveMetricMode,
    triggerTrafficSpike,
    triggerDatabaseOutage,
    addToast,
    removeToast,
  };
}
