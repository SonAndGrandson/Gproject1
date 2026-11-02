// Ορισμός των τύπων (TypeScript Interfaces)
export interface StatCard {
  title: string;
  value: string;
  trend: 'up' | 'down' | 'neutral';
}

export interface ChartPoint {
  time: string;
  latency: number; // σε ms
  uptime: number;  // ποσοστό %
}

// Τα εικονικά δεδομένα
export const kpiStats: StatCard[] = [
  { title: "Total Monitors", value: "24", trend: "up" },
  { title: "Average Uptime", value: "99.98%", trend: "up" },
  { title: "Active Alerts", value: "2", trend: "down" },
];

export const performanceData: ChartPoint[] = [
  { time: "00:00", latency: 120, uptime: 100 },
  { time: "04:00", latency: 110, uptime: 100 },
  { time: "08:00", latency: 150, uptime: 99.9 },
  { time: "12:00", latency: 180, uptime: 99.8 },
  { time: "16:00", latency: 130, uptime: 100 },
  { time: "20:00", latency: 115, uptime: 100 },
];