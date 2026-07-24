import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface PredictionData {
  month: string;
  rainfall: number;
  predicted_consumption: number;
}

function PredictionChart({ data, type = "rainfall" }: { data: PredictionData[], type?: string }) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div style={{ height: "400px", width: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p>No prediction data available</p>
      </div>
    );
  }

  const chartData = {
    labels: data.map(d => d.month),
    datasets: [
      {
        label: type === "rainfall" ? "Rainfall (mm)" : "Water Consumption (L)",
        data: type === "rainfall" 
          ? data.map(d => d.rainfall) 
          : data.map(d => d.predicted_consumption),
        backgroundColor: type === "rainfall" ? "rgba(54, 162, 235, 0.7)" : "rgba(75, 192, 192, 0.7)",
        borderColor: type === "rainfall" ? "rgba(54, 162, 235, 1)" : "rgba(75, 192, 192, 1)",
        borderWidth: 1,
        borderRadius: 8,
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
        text: type === "rainfall" ? "Rainfall Prediction 2026" : "Water Consumption Prediction 2026",
      },
      tooltip: {
        callbacks: {
          label: function (context: any) {
            let value = context.parsed.y;
            if (type === "rainfall") {
              return `Rainfall: ${value.toFixed(1)} mm`;
            }
            return `Consumption: ${Math.round(value).toLocaleString()} L`;
          },
        },
      },
    },
    scales: {
      y: {
        title: {
          display: true,
          text: type === "rainfall" ? "Rainfall (mm)" : "Water Consumption (L)",
        },
        beginAtZero: true,
        grid: { display: false },
      },
      x: {
        title: {
          display: true,
          text: "Month",
        },
        ticks: {
          maxRotation: 45,
          minRotation: 45,
        },
        grid: { display: false },
      },
    },
  };

  return (
    <div style={{ height: "400px", width: "100%" }}>
      <Bar data={chartData} options={options} />
    </div>
  );
}

export default PredictionChart;