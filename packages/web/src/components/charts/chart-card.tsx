import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import type { Platform, SalesPoint } from "../../api/types";
import { platformLabel } from "../../lib/utils";

const colors = {
  douyin: "#06b6d4",
  pdd: "#f97316",
  taobao: "#22c55e",
  profit: "#8b5cf6"
};

export function SalesTrendChart({ data }: { data: SalesPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
        <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={12} />
        <YAxis tickLine={false} axisLine={false} fontSize={12} />
        <Tooltip />
        <Line
          type="monotone"
          dataKey="douyin"
          name="抖音"
          stroke={colors.douyin}
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="pdd"
          name="拼多多"
          stroke={colors.pdd}
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="taobao"
          name="淘宝"
          stroke={colors.taobao}
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ProfitBarChart({
  data
}: {
  data: Array<{ date: string; revenue: number; cost: number; profit: number }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
        <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={12} />
        <YAxis tickLine={false} axisLine={false} fontSize={12} />
        <Tooltip />
        <Bar
          dataKey="revenue"
          name="销售额"
          fill={colors.douyin}
          radius={[4, 4, 0, 0]}
        />
        <Bar
          dataKey="profit"
          name="利润"
          fill={colors.profit}
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PlatformPieChart({
  data
}: {
  data: Array<{ platform: Platform; value: number }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Tooltip
          formatter={(value, name) => [
            value,
            platformLabel[name as Platform] ?? name
          ]}
        />
        <Pie
          data={data}
          dataKey="value"
          nameKey="platform"
          innerRadius={58}
          outerRadius={94}
          paddingAngle={3}
        >
          {data.map((item) => (
            <Cell key={item.platform} fill={colors[item.platform]} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
