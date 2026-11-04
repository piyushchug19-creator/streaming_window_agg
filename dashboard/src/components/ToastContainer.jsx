import React from 'react';
import { 
  AlertCircle, 
  CheckCircle, 
  AlertTriangle, 
  Info, 
  X,
  Bell
} from 'lucide-react';

export default function ToastContainer({ toasts, removeToast }) {
  if (!toasts || toasts.length === 0) return null;

  const getToastStyles = (type) => {
    switch (type) {
      case 'critical':
        return {
          icon: <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />,
          border: 'border-rose-500/40',
          bg: 'bg-[#140b0f]/90',
          titleColor: 'text-rose-300',
          indicator: 'bg-rose-500',
        };
      case 'warning':
        return {
          icon: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />,
          border: 'border-amber-500/40',
          bg: 'bg-[#161208]/90',
          titleColor: 'text-amber-300',
          indicator: 'bg-amber-500',
        };
      case 'success':
        return {
          icon: <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />,
          border: 'border-emerald-500/40',
          bg: 'bg-[#081510]/90',
          titleColor: 'text-emerald-300',
          indicator: 'bg-emerald-500',
        };
      default:
        return {
          icon: <Info className="w-4 h-4 text-cyan-400 shrink-0" />,
          border: 'border-cyan-500/40',
          bg: 'bg-[#081318]/90',
          titleColor: 'text-cyan-300',
          indicator: 'bg-cyan-500',
        };
    }
  };

  return (
    <div className="fixed top-20 right-4 sm:right-6 z-50 flex flex-col space-y-2.5 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => {
        const styles = getToastStyles(toast.type);
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto transform transition-all duration-300 ease-out backdrop-blur-xl p-3.5 rounded-xl border ${styles.border} ${styles.bg} shadow-2xl flex items-start gap-3`}
          >
            {styles.icon}

            <div className="flex-1 min-w-0 font-mono">
              <div className="flex items-center justify-between">
                <span className={`text-xs font-semibold ${styles.titleColor}`}>
                  {toast.title}
                </span>
                <span className="text-[10px] text-slate-500">{toast.time || 'now'}</span>
              </div>
              <p className="text-[11px] text-slate-300 mt-1 leading-snug">
                {toast.message}
              </p>
            </div>

            <button
              onClick={() => removeToast(toast.id)}
              className="text-slate-400 hover:text-white transition-colors p-0.5 rounded"
              title="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
