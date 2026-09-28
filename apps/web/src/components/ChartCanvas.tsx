import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import type { ChartArea, ScriptableContext } from "chart.js";
import { useEffect, useRef } from "react";

// Explicit registration keeps the (lazy-loaded) chart bundle tree-shaken.
Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
);

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export interface ChartCanvasProps {
  type: "line" | "bar";
  labels: string[];
  values: number[];
  /** Series name announced in tooltips. */
  label: string;
}

/**
 * One dataset, one canvas. The canvas is aria-hidden: every chart is paired
 * with an accessible <table> alternative by ChartWithTable.
 */
export default function ChartCanvas({ type, labels, values, label }: ChartCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const accent = cssVar("--accent") || "#4f46e5";
    const grid = cssVar("--chart-grid") || "#eceff3";
    const text = cssVar("--text-muted") || "#5b6472";

    // Soft vertical gradient under line charts. Chart.js types chartArea as
    // always set, but it is undefined during the first scriptable pass
    // (before layout), hence the widening cast.
    const lineFill = (context: ScriptableContext<"line">) => {
      const { ctx } = context.chart;
      const chartArea = context.chart.chartArea as ChartArea | undefined;
      if (chartArea === undefined) return `${accent}33`;
      const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
      gradient.addColorStop(0, `${accent}59`);
      gradient.addColorStop(1, `${accent}05`);
      return gradient;
    };

    const chart = new Chart(canvas, {
      type,
      data: {
        labels,
        datasets: [
          {
            label,
            data: values,
            backgroundColor: type === "bar" ? accent : lineFill,
            borderColor: accent,
            borderWidth: type === "line" ? 2 : 0,
            borderRadius: type === "bar" ? 4 : 0,
            pointRadius: labels.length > 60 ? 0 : 2,
            fill: type === "line",
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { tooltip: { intersect: false, mode: "index" } },
        scales: {
          x: { ticks: { color: text, maxTicksLimit: 12 }, grid: { display: false } },
          y: {
            beginAtZero: true,
            ticks: { color: text, precision: 0 },
            grid: { color: grid },
          },
        },
      },
    });
    return () => {
      chart.destroy();
    };
  }, [type, labels, values, label]);

  return <canvas ref={canvasRef} aria-hidden="true" />;
}
