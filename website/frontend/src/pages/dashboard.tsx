import { useEffect, useState } from "react";
import axios from "axios";
import Navbar from "../components/navbar";
import WaterChart from "../components/waterchart";
import Card from "../components/card";
import WaterTank from "../components/watertank";
import "../styles/dashboard.css";

interface VolumeData {
  time: string;
  volume: number;
  level: number;
}

interface TelemetryData {
  volume_liters: number;
  level_percent: number;
}

function Dashboard() {
  const [liveData, setLiveData] = useState<TelemetryData | null>(null);
  const [recentHistory, setRecentHistory] = useState<VolumeData[]>([]);
  const [maxVolume, setMaxVolume] = useState(0);
  const [tankCapacity, setTankCapacity] = useState(0);
  const [lastUpdate, setLastUpdate] = useState<string>("");

  // Fetch live data
  const fetchLiveData = async () => {
    try {
      const response = await axios.get("http://localhost:5000/test-connection");
      if (response.data && response.data.telemetry) {
        setLiveData(response.data.telemetry);
        setMaxVolume(response.data.maxVolume);
        setTankCapacity(response.data.tankCapacity);
        setLastUpdate(new Date().toLocaleTimeString());
        
        // Add to recent history
        const newReading: VolumeData = {
          time: new Date().toISOString(),
          volume: response.data.telemetry.volume_liters,
          level: response.data.telemetry.level_percent
        };
        
        setRecentHistory(prev => {
          const updated = [newReading, ...prev];
          // Keep only last 20 readings for live history
          return updated.slice(0, 20);
        });
      }
    } catch (error) {
      console.error("Error fetching live data:", error);
    }
  };

  // Reset max volume
  const resetMaxVolume = async () => {
    try {
      await axios.post("http://localhost:5000/reset-max-volume");
      setMaxVolume(0);
      alert("Maximum volume has been reset");
    } catch (error) {
      console.error("Error resetting max volume:", error);
    }
  };

  useEffect(() => {
    fetchLiveData();

    // Poll for live data every 3 seconds
    const interval = setInterval(fetchLiveData, 3000);
    return () => clearInterval(interval);
  }, []);

  const maxVolumePercent = tankCapacity > 0 ? (maxVolume / tankCapacity) * 100 : 0;

  // Prepare data for live history chart (last 20 readings)
  const liveHistoryData = [...recentHistory].reverse();

  return (
    <div>
      <Navbar />
      <div className="dashboard-container">
        <div className="header">
          <h1>Water Tank Monitoring System</h1>
          <button onClick={resetMaxVolume} className="reset-btn">
            Reset Max Volume
          </button>
        </div>

        {/* Live Monitoring Section */}
        <div className="live-section">
          <h2>Live Monitoring</h2>
          <div className="live-cards">
            <Card
              title="Current Volume"
              value={liveData ? `${liveData.volume_liters.toFixed(1)} L` : "--"}
              subtitle={liveData ? `Level: ${liveData.level_percent.toFixed(1)}%` : "Loading..."}
            />
            <Card
              title="Maximum Volume Recorded"
              value={`${maxVolume.toFixed(1)} L`}
              subtitle={`${maxVolumePercent.toFixed(1)}% of capacity`}
            />
            <Card
              title="Tank Capacity"
              value={`${tankCapacity.toFixed(0)} L`}
            />
            <Card title="Last Updated" value={lastUpdate || "--"} />
          </div>

          {/* Graphical Tank */}
          {liveData && (
            <div className="tank-container">
              <h3>Water Tank Visual</h3>
              <WaterTank level={liveData.level_percent} />
              <div className="tank-info">
                <span>Empty</span>
                <span>{liveData.volume_liters.toFixed(1)} L / {tankCapacity.toFixed(0)} L</span>
                <span>Full</span>
              </div>
            </div>
          )}
        </div>

        {/* Live History Chart (Recent 20 readings) - Single Graph */}
        {liveHistoryData.length > 0 && (
          <div className="chart-section">
            <div className="chart-header">
              <h2>Live History (Last {liveHistoryData.length} Readings)</h2>
              <span className="live-badge">LIVE</span>
            </div>
            <WaterChart data={liveHistoryData} />
          </div>
        )}

        {/* Data Summary */}
        <div className="summary-section">
          <h3>Data Summary</h3>
          <div className="summary-cards">
            <Card title="Total Readings (Live)" value={recentHistory.length.toString()} />
            <Card
              title="Average Volume"
              value={
                recentHistory.length > 0
                  ? `${(recentHistory.reduce((sum, d) => sum + d.volume, 0) / recentHistory.length).toFixed(1)} L`
                  : "--"
              }
            />
            <Card
              title="Peak Volume"
              value={
                recentHistory.length > 0
                  ? `${Math.max(...recentHistory.map((d) => d.volume)).toFixed(1)} L`
                  : "--"
              }
            />
            <Card
              title="Current Status"
              value={liveData ? getStatus(liveData.level_percent) : "--"}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function getStatus(level: number): string {
  if (level >= 80) return "Full 🟢";
  if (level >= 50) return "Good ✅";
  if (level >= 20) return "Low ⚠️";
  return "Critical 🔴";
}

export default Dashboard;