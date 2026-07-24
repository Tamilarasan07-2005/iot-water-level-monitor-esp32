import axios from "axios";

// Backend base URL.
// Development: http://localhost:5000
// Production:  set VITE_API_URL in your .env file
const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export const api = axios.create({ baseURL: BASE_URL });

// Convenience wrapper used by legacy pages
export const fetchWaterData = async () => {
  const res = await api.get("/query");
  return res.data;
};