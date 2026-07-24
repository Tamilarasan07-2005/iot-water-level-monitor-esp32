import { useState, useEffect } from "react";
import axios from "axios";
import Navbar from "../components/navbar";
import WaterChart from "../components/waterchart";
import Card from "../components/card";
import "../styles/query.css";

interface FileInfo {
  id: string;
  name: string;
  createdTime: string;
  size: string;
}

interface Reading {
  timestamp: string;
  volume: number;
  level: number;
  file?: string;
}

function Query() {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [data, setData] = useState<Reading[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [queryType, setQueryType] = useState<"single" | "range">("range");
  const [summary, setSummary] = useState({
    avgVolume: 0, maxVolume: 0, minVolume: 0, totalReadings: 0,
    avgLevel: 0, maxLevel: 0, minLevel: 0
  });
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 100;

  useEffect(() => { fetchFiles(); }, []);

  useEffect(() => { setCurrentPage(1); }, [data]);

  const fetchFiles = async () => {
    try {
      const response = await axios.get("http://localhost:5000/drive/list-files");
      if (response.data.success) setFiles(response.data.files);
    } catch (error) {
      console.error("Error fetching files:", error);
      alert("Failed to fetch files from Google Drive");
    }
  };

  const querySingleFile = async () => {
    if (!selectedFile) { alert("Please select a file"); return; }
    setLoading(true);
    try {
      const response = await axios.post("http://localhost:5000/drive/query-data", {
        fileId: selectedFile,
        startDate: null,
        endDate: null
      });
      if (response.data.success) {
        setData(response.data.data);
        calculateSummary(response.data.data);
        alert(`Found ${response.data.data.length} readings from the selected file`);
      }
    } catch (error) {
      console.error("Error querying data:", error);
      alert("Failed to query data");
    } finally { setLoading(false); }
  };

  const queryDateRange = async () => {
    if (!startDate || !endDate) { alert("Please select both start and end dates"); return; }
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start > end) { alert("Start date must be before end date"); return; }
    
    setLoading(true);
    try {
      const response = await axios.post("http://localhost:5000/drive/query-range", {
        startDate: startDate,
        endDate: endDate
      });
      if (response.data.success) {
        setData(response.data.data);
        calculateSummary(response.data.data);
        alert(`Found ${response.data.totalReadings} readings from ${response.data.filesProcessed} files between ${new Date(startDate).toLocaleString()} and ${new Date(endDate).toLocaleString()}`);
      }
    } catch (error) {
      console.error("Error querying range:", error);
      alert("Failed to query date range");
    } finally { setLoading(false); }
  };

  const calculateSummary = (readings: Reading[]) => {
    if (readings.length === 0) {
      setSummary({ avgVolume: 0, maxVolume: 0, minVolume: 0, totalReadings: 0, avgLevel: 0, maxLevel: 0, minLevel: 0 });
      return;
    }
    const volumes = readings.map(r => r.volume);
    const levels = readings.map(r => r.level);
    setSummary({
      avgVolume: volumes.reduce((a, b) => a + b, 0) / volumes.length,
      maxVolume: Math.max(...volumes),
      minVolume: Math.min(...volumes),
      totalReadings: readings.length,
      avgLevel: levels.reduce((a, b) => a + b, 0) / levels.length,
      maxLevel: Math.max(...levels),
      minLevel: Math.min(...levels)
    });
  };

  const handleQuery = () => { queryType === "single" ? querySingleFile() : queryDateRange(); };

  const downloadCSV = () => {
    if (data.length === 0) return;
    const headers = ["Timestamp", "Volume (Liters)", "Water Level (%)"];
    const rows = data.map(d => [d.timestamp, d.volume.toFixed(2), d.level.toFixed(1)]);
    const csvContent = [headers, ...rows].map(row => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `water_data_${startDate || "all"}_to_${endDate || "all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatDate = (dateString: string) => new Date(dateString).toLocaleString();

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = data.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(data.length / itemsPerPage);
  const paginate = (pageNumber: number) => setCurrentPage(pageNumber);
  const nextPage = () => setCurrentPage(prev => Math.min(prev + 1, totalPages));
  const prevPage = () => setCurrentPage(prev => Math.max(prev - 1, 1));

  const getPageNumbers = () => {
    const pageNumbers = [];
    const maxPagesToShow = 5;
    if (totalPages <= maxPagesToShow) {
      for (let i = 1; i <= totalPages; i++) pageNumbers.push(i);
    } else if (currentPage <= 3) {
      for (let i = 1; i <= 4; i++) pageNumbers.push(i);
      pageNumbers.push('...');
      pageNumbers.push(totalPages);
    } else if (currentPage >= totalPages - 2) {
      pageNumbers.push(1);
      pageNumbers.push('...');
      for (let i = totalPages - 3; i <= totalPages; i++) pageNumbers.push(i);
    } else {
      pageNumbers.push(1);
      pageNumbers.push('...');
      for (let i = currentPage - 1; i <= currentPage + 1; i++) pageNumbers.push(i);
      pageNumbers.push('...');
      pageNumbers.push(totalPages);
    }
    return pageNumbers;
  };

  return (
    <div>
      <Navbar />
      <div className="query-container">
        <div className="query-header">
          <h1>Query Water Tank Data</h1>
          <p>Retrieve and analyze volume and level data</p>
        </div>

        <div className="query-type-section">
          <div className="query-type-buttons">
            <button className={`type-btn ${queryType === "range" ? "active" : ""}`} onClick={() => setQueryType("range")}>Date Range Query</button>
            <button className={`type-btn ${queryType === "single" ? "active" : ""}`} onClick={() => setQueryType("single")}>Single File Query</button>
          </div>
        </div>

        <div className="query-controls">
          {queryType === "single" && (
            <div className="control-group full-width">
              <label>Select CSV File:</label>
              <select value={selectedFile} onChange={(e) => setSelectedFile(e.target.value)} className="file-select">
                <option value="">-- Select a file --</option>
                {files.map((file) => (<option key={file.id} value={file.id}>{file.name} ({new Date(file.createdTime).toLocaleDateString()})</option>))}
              </select>
            </div>
          )}

          {queryType === "range" && (
            <>
              <div className="control-group">
                <label>Start Date & Time:</label>
                <input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="date-input" />
              </div>
              <div className="control-group">
                <label>End Date & Time:</label>
                <input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="date-input" />
              </div>
            </>
          )}

          <div className="control-group button-group">
            <button onClick={handleQuery} className="query-btn" disabled={loading}>{loading ? "Querying..." : "Query Data"}</button>
          </div>
        </div>

        {startDate && endDate && data.length > 0 && queryType === "range" && (
          <div className="date-range-info">
            <strong>Date Range:</strong> {new Date(startDate).toLocaleString()} - {new Date(endDate).toLocaleString()}<br />
            <strong>Total Readings:</strong> {data.length}
          </div>
        )}

        {data.length > 0 && (
          <div className="summary-section">
            <h2>Data Summary</h2>
            <div className="summary-cards">
              <Card title="Total Readings" value={summary.totalReadings.toString()} />
              <Card title="Average Volume" value={`${summary.avgVolume.toFixed(1)} L`} />
              <Card title="Maximum Volume" value={`${summary.maxVolume.toFixed(1)} L`} />
              <Card title="Minimum Volume" value={`${summary.minVolume.toFixed(1)} L`} />
              <Card title="Average Level" value={`${summary.avgLevel.toFixed(1)}%`} />
              <Card title="Max Level" value={`${summary.maxLevel.toFixed(1)}%`} />
            </div>
          </div>
        )}

        {data.length > 0 ? (
          <div className="chart-section">
            <div className="chart-header">
              <h2>Water Volume & Level Trend</h2>
              <button onClick={downloadCSV} className="download-btn">Download as CSV</button>
            </div>
            <WaterChart data={data.map(d => ({ time: d.timestamp, volume: d.volume, level: d.level }))} />
          </div>
        ) : (!loading && <div className="no-data"><p>No data to display. Please select a date range or file and click Query.</p></div>)}

        {data.length > 0 && (
          <div className="data-table-section">
            <h2>Detailed Data</h2>
            <div className="table-info">Showing {indexOfFirstItem + 1} to {Math.min(indexOfLastItem, data.length)} of {data.length} readings</div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Timestamp</th>
                    <th>Volume (Liters)</th>
                    <th>Water Level (%)</th>
                    {queryType === "range" && <th>Source File</th>}
                  </tr>
                </thead>
                <tbody>
                  {currentItems.map((reading, index) => (
                    <tr key={indexOfFirstItem + index}>
                      <td>{indexOfFirstItem + index + 1}</td>
                      <td>{formatDate(reading.timestamp)}</td>
                      <td className={reading.volume > 10 ? "high-volume" : ""}>{reading.volume.toFixed(2)}</td>
                      <td className={reading.level > 80 ? "high-level" : reading.level < 20 ? "low-level" : ""}>{reading.level.toFixed(1)}%</td>
                      {queryType === "range" && <td>{reading.file}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="pagination">
                <button onClick={prevPage} disabled={currentPage === 1} className="pagination-btn">&laquo; Previous</button>
                <div className="pagination-numbers">
                  {getPageNumbers().map((page, index) => (
                    <button key={index} onClick={() => typeof page === 'number' ? paginate(page) : null} className={`pagination-number ${currentPage === page ? 'active' : ''} ${typeof page !== 'number' ? 'dots' : ''}`} disabled={typeof page !== 'number'}>{page}</button>
                  ))}
                </div>
                <button onClick={nextPage} disabled={currentPage === totalPages} className="pagination-btn">Next &raquo;</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Query;