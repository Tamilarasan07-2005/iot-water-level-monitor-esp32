import { useEffect, useState } from "react";
import axios from "axios";
import Navbar from "../components/navbar";
import PredictionChart from "../components/predictionchart";
import PredictionCard from "../components/predictioncard";
import "../styles/predict.css";

interface MonthlyData {
  month: string;
  rainfall: number;
  predicted_consumption: number;
}

interface PredictionSummary {
  totalRainfall: string;
  averageRainfall: string;
  maxRainfall: string;
  minRainfall: string;
  rainyMonths: number;
  dryMonths: number;
  totalMonths: number;
  totalConsumption: string;
  averageConsumption: string;
  maxConsumption: string;
  minConsumption: string;
}

function Predict() {
  const [predictionData, setPredictionData] = useState<MonthlyData[]>([]);
  const [predictionSummary, setPredictionSummary] = useState<PredictionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewType, setViewType] = useState<"consumption" | "rainfall">("consumption");

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const fetchPredictionData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get("http://localhost:5000/drive/get-prediction-file");
      
      if (response.data && response.data.success) {
        const cleanedData = response.data.data.map((item: any) => {
          let monthName = item.month;
          const monthNum = parseInt(item.month);
          if (!isNaN(monthNum) && monthNum >= 1 && monthNum <= 12) {
            monthName = monthNames[monthNum - 1];
          }
          return {
            month: monthName,
            rainfall: item.rainfall || 0,
            predicted_consumption: item.predicted_consumption || 0
          };
        }).filter((item: MonthlyData) => {
          return item.month && item.month.length > 0;
        });
        
        setPredictionData(cleanedData);
      } else {
        setError(response.data?.error || "Failed to load prediction data");
      }
    } catch (error: any) {
      if (error.code === 'ERR_NETWORK') {
        setError("Cannot connect to backend server. Please make sure the backend is running on port 5000.");
      } else if (error.response) {
        setError(`Server error: ${error.response.status} - ${error.response.data?.error || 'Unknown error'}`);
      } else {
        setError(error.message || "Failed to connect to server");
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchPredictionSummary = async () => {
    try {
      const response = await axios.get("http://localhost:5000/drive/prediction-summary");
      if (response.data && response.data.success) {
        setPredictionSummary(response.data.summary);
      }
    } catch (error) {
      console.error("Error fetching prediction summary:", error);
    }
  };

  useEffect(() => {
    fetchPredictionData();
    fetchPredictionSummary();
  }, []);

  const getMaxConsumption = () => {
    if (predictionData.length === 0) return 10000;
    return Math.max(...predictionData.map(d => d.predicted_consumption));
  };

  const getMaxRainfall = () => {
    if (predictionData.length === 0) return 500;
    return Math.max(...predictionData.map(d => d.rainfall));
  };

  if (loading) {
    return (
      <div>
        <Navbar />
        <div className="loading-container">
          <div className="loader"></div>
          <p>Loading prediction data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <Navbar />
        <div className="error-container">
          <div className="error-icon">⚠️</div>
          <h2>Error Loading Prediction Data</h2>
          <p>{error}</p>
          <button onClick={fetchPredictionData} className="retry-btn">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (predictionData.length === 0) {
    return (
      <div>
        <Navbar />
        <div className="error-container">
          <div className="error-icon">📊</div>
          <h2>No Data Available</h2>
          <p>No prediction data found. Please check if water_consumption_2026.csv exists in Google Drive.</p>
          <button onClick={fetchPredictionData} className="retry-btn">
            Refresh
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Navbar />
      <div className="predict-container">
        <div className="predict-header">
          <h1>Water Consumption & Rainfall Prediction 2026</h1>
          <p>Monthly forecasts for water management</p>
        </div>

        <div className="view-toggle">
          <button
            className={`toggle-btn ${viewType === "consumption" ? "active" : ""}`}
            onClick={() => setViewType("consumption")}
          >
            💧 Water Consumption
          </button>
          <button
            className={`toggle-btn ${viewType === "rainfall" ? "active" : ""}`}
            onClick={() => setViewType("rainfall")}
          >
            🌧️ Rainfall Analysis
          </button>
        </div>

        {predictionSummary && (
          <div className="summary-section">
            <h2>Annual Summary</h2>
            <div className="summary-cards">
              {viewType === "consumption" ? (
                <>
                  <PredictionCard
                    title="Total Annual Consumption"
                    value={`${parseFloat(predictionSummary.totalConsumption).toLocaleString()} L`}
                    icon="💧"
                  />
                  <PredictionCard
                    title="Monthly Average"
                    value={`${parseFloat(predictionSummary.averageConsumption).toLocaleString()} L`}
                    icon="📊"
                  />
                  <PredictionCard
                    title="Peak Consumption"
                    value={`${parseFloat(predictionSummary.maxConsumption).toLocaleString()} L`}
                    icon="📈"
                    trend="up"
                  />
                  <PredictionCard
                    title="Lowest Consumption"
                    value={`${parseFloat(predictionSummary.minConsumption).toLocaleString()} L`}
                    icon="📉"
                    trend="down"
                  />
                </>
              ) : (
                <>
                  <PredictionCard
                    title="Total Annual Rainfall"
                    value={`${parseFloat(predictionSummary.totalRainfall).toFixed(1)} mm`}
                    icon="🌧️"
                  />
                  <PredictionCard
                    title="Monthly Average"
                    value={`${parseFloat(predictionSummary.averageRainfall).toFixed(1)} mm`}
                    icon="📊"
                  />
                  <PredictionCard
                    title="Maximum Rainfall"
                    value={`${parseFloat(predictionSummary.maxRainfall).toFixed(1)} mm`}
                    icon="⬆️"
                    trend="up"
                  />
                  <PredictionCard
                    title="Minimum Rainfall"
                    value={`${parseFloat(predictionSummary.minRainfall).toFixed(1)} mm`}
                    icon="⬇️"
                    trend="down"
                  />
                </>
              )}
            </div>
          </div>
        )}

        <div className="chart-section">
          <h2>{viewType === "consumption" ? "Monthly Consumption Forecast" : "Monthly Rainfall Data"}</h2>
          <PredictionChart data={predictionData} type={viewType} />
        </div>

        <div className="monthly-breakdown">
          <h2>{viewType === "consumption" ? "Monthly Consumption Details" : "Monthly Rainfall Details"}</h2>
          <div className="monthly-grid">
            {predictionData.map((item, index) => (
              <div key={index} className="monthly-card">
                <div className="month-name">{item.month}</div>
                {viewType === "consumption" ? (
                  <>
                    <div className="month-consumption">💧 {Math.round(item.predicted_consumption).toLocaleString()} L</div>
                    <div className="month-rainfall-small">🌧️ Rainfall: {item.rainfall.toFixed(1)} mm</div>
                    <div className="consumption-bar">
                      <div 
                        className="consumption-fill"
                        style={{ width: `${(item.predicted_consumption / getMaxConsumption()) * 100}%` }}
                      ></div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="month-rainfall">🌧️ {item.rainfall.toFixed(1)} mm</div>
                    <div className="consumption-bar">
                      <div 
                        className="rainfall-fill"
                        style={{ width: `${(item.rainfall / getMaxRainfall()) * 100}%` }}
                      ></div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="data-table-section">
          <h2>Complete Monthly Data</h2>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Rainfall (mm)</th>
                  <th>Predicted Consumption (L)</th>
                </tr>
              </thead>
              <tbody>
                {predictionData.map((item, index) => (
                  <tr key={index}>
                    <td>{item.month}</td>
                    <td className={item.rainfall > 100 ? "high-rainfall" : ""}>
                      {item.rainfall.toFixed(2)}
                    </td>
                    <td className={item.predicted_consumption > 5000 ? "high-consumption" : ""}>
                      {Math.round(item.predicted_consumption).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Predict;