import { motion } from "framer-motion";

export interface ConversionDatum {
  label: string;
  created: number;
  accepted: number;
}

export interface ConversionChartProps {
  data: ConversionDatum[];
}

export function ConversionChart({ data }: ConversionChartProps) {
  const maxValue = Math.max(...data.flatMap((item) => [item.created, item.accepted]), 1);
  const chartHeight = 140;

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-2)] p-4">
      <svg viewBox="0 0 600 180" width="100%" className="h-auto">
        {[0, 1, 2, 3].map((index) => {
          const y = 20 + index * 32;
          return <line key={index} x1="36" x2="580" y1={y} y2={y} stroke="var(--line)" strokeDasharray="4 4" />;
        })}
        {data.map((item, index) => {
          const groupX = 62 + index * 96;
          const createdHeight = (item.created / maxValue) * chartHeight;
          const acceptedHeight = (item.accepted / maxValue) * chartHeight;
          return (
            <g key={item.label}>
              <motion.rect
                initial={{ height: 0, y: 160 }}
                animate={{ height: createdHeight, y: 160 - createdHeight }}
                transition={{ duration: 0.28, delay: index * 0.03, ease: "easeOut" }}
                x={groupX}
                y={160 - createdHeight}
                width="18"
                height={createdHeight}
                rx="4"
                fill="var(--bg-4)"
              />
              <motion.rect
                initial={{ height: 0, y: 160 }}
                animate={{ height: acceptedHeight, y: 160 - acceptedHeight }}
                transition={{ duration: 0.28, delay: index * 0.03 + 0.04, ease: "easeOut" }}
                x={groupX + 22}
                y={160 - acceptedHeight}
                width="18"
                height={acceptedHeight}
                rx="4"
                fill="var(--accent)"
              />
              <text x={groupX + 11} y="175" fill="var(--t3)" fontFamily="IBM Plex Mono" fontSize="10">{item.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
