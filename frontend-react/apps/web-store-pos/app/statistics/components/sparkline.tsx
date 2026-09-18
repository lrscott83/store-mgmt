// React.lazy — recharts is NOT imported here, only in chart-core.tsx (STAT-8, CC-6).
import { lazy, Suspense } from 'react';

const SparklineCore = lazy(() =>
  import('./chart-core').then((m) => ({ default: m.SparklineCore })),
);

interface SparklineProps {
  values: number[];
  stroke?: string;
  testId?: string;
}

/** Mini KPI line rendered inside a dashboard card (same bucket granularity as the charts). */
export function KpiSparkline({ values, stroke, testId }: SparklineProps) {
  if (values.length === 0) return null;

  return (
    <Suspense fallback={<div className="h-10 w-full" />}>
      <SparklineCore values={values} stroke={stroke} testId={testId} />
    </Suspense>
  );
}
