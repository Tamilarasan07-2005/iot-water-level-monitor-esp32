import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
  Legend
);

interface VolumeData {
  time: string;
  volume: number;
  level: number;
}

function WaterChart({ data }: { data: VolumeData[] }) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div style={{ height: "400px", width: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p>No volume data available</p>
      </div>
    );
  }

  const chartData = {
    labels: data.map((_, index) => index + 1), // Use index numbers instead of timestamps
    datasets: [
      {
        label: "Water Volume (Liters)",
        data: data.map((d) => d.volume),
        borderColor: "#0077ff",
        backgroundColor: "rgba(0, 119, 255, 0.1)",
        tension: 0.4,
        fill: true,
        pointRadius: 3,
        pointHoverRadius: 6,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top" as const,
      },
      title: {
        display: true,
        text: "Water Volume Trend",
      },
      tooltip: {
        callbacks: {
          label: function (context: any) {
            return `Volume: ${context.parsed.y.toFixed(1)} L`;
          },
        },
      },
    },
    scales: {
      y: {
        title: {
          display: true,
          text: "Volume (Liters)",
        },
        beginAtZero: true,
        grid: {
          display: false, // Remove horizontal grid lines
        },
        ticks: {
          display: true,
        },
      },
      x: {
        title: {
          display: false, // Hide x-axis title
        },
        ticks: {
          display: false, // Hide x-axis labels (timestamps)
        },
        grid: {
          display: false, // Remove vertical grid lines
        },
      },
    },
  };

  return (
    <div style={{ height: "400px", width: "100%" }}>
      <Line data={chartData} options={options} />
    </div>
  );
}

export default WaterChart;