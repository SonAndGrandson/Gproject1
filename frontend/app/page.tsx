"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Activity, AlertTriangle, Clock, Pencil, Plus, RefreshCw, Trash2, X, Check } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { createMonitor, deleteMonitor, updateMonitorUrl, getMonitorChecks, getMonitors, type CheckResult, type Monitor } from "./lib/api";

const POLL_INTERVAL_MS = 30_000;

function timeLabel(value: string): string {
  return new Date(value).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function statusFor(monitor: Monitor, checks: CheckResult[]) {
  if (!monitor.is_active) return { label: "Paused", className: "bg-gray-100 text-gray-700" };
  if (!checks.length) return { label: "No checks", className: "bg-amber-100 text-amber-800" };
  return checks[0].is_up
    ? { label: "UP", className: "bg-green-100 text-green-800" }
    : { label: "DOWN", className: "bg-red-100 text-red-800" };
}

export default function Home() {
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [checks, setChecks] = useState<Record<number, CheckResult[]>>({});
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [intervalSeconds, setIntervalSeconds] = useState(60);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const loadedMonitors = await getMonitors();
      const results = await Promise.all(loadedMonitors.map((m) => getMonitorChecks(m.id)));
      const byId: Record<number, CheckResult[]> = {};
      loadedMonitors.forEach((m, index) => { byId[m.id] = results[index]; });
      setMonitors(loadedMonitors);
      setChecks(byId);
      setSelectedId((previous) =>
        previous !== null && loadedMonitors.some((m) => m.id === previous)
          ? previous
          : (loadedMonitors[0]?.id ?? null)
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load API data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => { void refresh(); }, 0);
    const timer = window.setInterval(() => { void refresh(); }, POLL_INTERVAL_MS);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const allChecks = useMemo(() => monitors.flatMap((m) => checks[m.id] ?? []), [monitors, checks]);
  const successRate = allChecks.length
    ? `${(100 * allChecks.filter((c) => c.is_up).length / allChecks.length).toFixed(2)}%`
    : "—";
  const downCount = monitors.filter((m) => m.is_active && (checks[m.id]?.length ?? 0) > 0 && !checks[m.id][0].is_up).length;
  const selectedMonitor = monitors.find((m) => m.id === selectedId);
  const selectedChecks = selectedId === null ? [] : (checks[selectedId] ?? []);
  const chartData = selectedChecks.slice().reverse().map((check) => ({
    time: timeLabel(check.checked_at),
    latency: check.response_time_ms,
    status: check.is_up ? "UP" : "DOWN",
  }));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const created = await createMonitor({ url, interval_seconds: intervalSeconds, is_active: true });
      setUrl("");
      await refresh();
      setSelectedId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create monitor");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(monitor: Monitor) {
    setEditingId(monitor.id);
    setEditUrl(monitor.url);
    setConfirmDeleteId(null);
    setError(null);
  }

  async function handleEdit(event: FormEvent<HTMLFormElement>, monitorId: number) {
    event.preventDefault();
    setBusyId(monitorId);
    setError(null);
    try {
      await updateMonitorUrl(monitorId, editUrl.trim());
      setEditingId(null);
      await refresh();
      setSelectedId(monitorId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update monitor");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(monitorId: number) {
    setBusyId(monitorId);
    setError(null);
    try {
      await deleteMonitor(monitorId);
      setConfirmDeleteId(null);
      setEditingId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete monitor");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="p-5 md:p-8 bg-gray-50 min-h-screen text-gray-900">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-7">
        <div>
          <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Live data from FastAPI & PostgreSQL · refreshes every 30s</p>
        </div>
        <button type="button" disabled={refreshing} onClick={() => void refresh()} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-4 py-2 text-sm hover:bg-gray-100 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {error && (
        <div role="alert" className="mb-6 border border-red-200 bg-red-50 text-red-800 rounded-lg p-4 text-sm">
          Request failed: {error}. Check the frontend/backend logs if the problem continues.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { title: "Total Monitors", value: String(monitors.length), icon: <Activity className="w-6 h-6 text-blue-500" /> },
          { title: "Recent Check Success", value: successRate, icon: <Clock className="w-6 h-6 text-green-500" /> },
          { title: "Monitors DOWN", value: String(downCount), icon: <AlertTriangle className="w-6 h-6 text-red-500" /> },
        ].map((stat) => (
          <div key={stat.title} className="p-6 bg-white rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-gray-500">{stat.title}</h3>
              <p className="text-3xl font-bold mt-2">{loading ? "..." : stat.value}</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg">{stat.icon}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-gray-500">Success rate uses up to the latest 100 checks per monitor. It is not a 90-day time-weighted uptime metric.</p>

      <section className="mt-8 bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Add Monitor</h2>
        <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-3">
          <input aria-label="Website URL" type="url" required placeholder="https://example.org" value={url} onChange={(e) => setUrl(e.target.value)} className="flex-1 border border-gray-300 rounded-lg px-3 py-2" />
          <input aria-label="Check interval in seconds" type="number" min={30} max={3600} required value={intervalSeconds} onChange={(e) => setIntervalSeconds(Number(e.target.value))} className="w-full md:w-40 border border-gray-300 rounded-lg px-3 py-2" />
          <button disabled={saving} type="submit" className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg px-5 py-2 flex items-center justify-center gap-2"><Plus className="w-4 h-4" />{saving ? "Saving..." : "Add Monitor"}</button>
        </form>
      </section>

      <section className="mt-8 bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Monitor Status</h2>
        {loading ? <p className="text-gray-500">Loading monitors...</p> : monitors.length === 0 ? <p className="text-gray-500">No monitors yet. Add your first website above.</p> : (
          <div className="space-y-2">
            {monitors.map((monitor) => {
              const latest = checks[monitor.id]?.[0];
              const badge = statusFor(monitor, checks[monitor.id] ?? []);
              return (
                <div key={monitor.id} className={`rounded-lg border p-4 ${selectedId === monitor.id ? "border-blue-400 bg-blue-50/40" : "border-gray-200"}`}>
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <button type="button" onClick={() => setSelectedId(monitor.id)} className="min-w-0 flex-1 text-left hover:underline focus-visible:outline-blue-500">
                      <p className="font-medium break-all">{monitor.url}</p>
                      <p className="text-xs text-gray-500">ID {monitor.id} · every {monitor.interval_seconds}s</p>
                    </button>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-gray-500">{latest?.response_time_ms == null ? "—" : `${latest.response_time_ms} ms`}</span>
                      <span className={`px-3 py-1 rounded-full font-semibold text-xs ${badge.className}`}>{badge.label}</span>
                      <button type="button" disabled={busyId !== null} onClick={() => startEdit(monitor)} className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 hover:bg-gray-100 disabled:opacity-50" aria-label={`Edit URL for monitor ${monitor.id}`}><Pencil className="w-4 h-4" /> Edit URL</button>
                      <button type="button" disabled={busyId !== null} onClick={() => { setConfirmDeleteId(monitor.id); setEditingId(null); setError(null); }} className="flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-2 text-red-700 hover:bg-red-50 disabled:opacity-50" aria-label={`Delete monitor ${monitor.id}`}><Trash2 className="w-4 h-4" /> Delete</button>
                    </div>
                  </div>
                  {editingId === monitor.id && (
                    <form onSubmit={(event) => void handleEdit(event, monitor.id)} className="mt-3 flex flex-col gap-2 border-t border-gray-200 pt-3">
                      <label className="text-sm font-medium" htmlFor={`edit-url-${monitor.id}`}>New website URL</label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input id={`edit-url-${monitor.id}`} type="url" required maxLength={255} value={editUrl} onChange={(e) => setEditUrl(e.target.value)} className="flex-1 min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-2" />
                        <button disabled={busyId !== null} type="submit" className="flex items-center justify-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"><Check className="w-4 h-4" /> {busyId === monitor.id ? "Saving..." : "Save"}</button>
                        <button type="button" onClick={() => setEditingId(null)} className="flex items-center justify-center gap-1 rounded-lg border border-gray-300 bg-white px-4 py-2 hover:bg-gray-50"><X className="w-4 h-4" /> Cancel</button>
                      </div>
                      <p className="text-xs text-amber-800">Changing the URL clears previous checks for this monitor so old measurements aren&apos;t shown for the new site.</p>
                    </form>
                  )}
                  {confirmDeleteId === monitor.id && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-red-100 pt-3">
                      <p className="text-sm text-red-800">Delete this monitor and all its check history permanently?</p>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setConfirmDeleteId(null)} className="rounded-lg border border-gray-300 bg-white px-4 py-2 hover:bg-gray-50">Cancel</button>
                        <button type="button" disabled={busyId !== null} onClick={() => void handleDelete(monitor.id)} className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50">{busyId === monitor.id ? "Deleting..." : "Yes, delete"}</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-8 p-6 bg-white rounded-xl border border-gray-200 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-2">System Performance (Latency ms)</h2>
        <p className="text-sm text-gray-500 mb-5">{selectedMonitor ? `Selected: ${selectedMonitor.url}` : "Select a monitor to view checks"}</p>
        {chartData.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-gray-500">No checks recorded for this monitor yet.</div>
        ) : (
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="time" stroke="#6B7280" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#6B7280" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} />
                <Line type="monotone" dataKey="latency" stroke="#3b82f6" strokeWidth={3} connectNulls={false} dot={false} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </main>
  );
}
