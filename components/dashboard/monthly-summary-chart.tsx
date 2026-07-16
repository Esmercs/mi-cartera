'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { formatMXN } from '@/lib/utils/currency'

export interface MonthRow {
  mes: string
  pagos: number
  diversion: number
  proyectos: number
}

export default function MonthlySummaryChart({ data }: { data: MonthRow[] }) {
  return (
    <div style={{ width: '100%', height: 220 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
          <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
            axisLine={false} tickLine={false} width={38}
          />
          <Tooltip
            formatter={(value: number | string, name: string) => [formatMXN(Number(value)), name]}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #f3f4f6' }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
          <Bar dataKey="pagos" name="Pagos" stackId="a" fill="#60a5fa" />
          <Bar dataKey="diversion" name="Diversión" stackId="a" fill="#fb923c" />
          <Bar dataKey="proyectos" name="Proyectos" stackId="a" fill="#a78bfa" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
