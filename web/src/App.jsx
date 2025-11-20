import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Wind } from 'lucide-react';

// --- Configuration ---
// Use environment variable if available, otherwise fallback or empty
const API_URL = import.meta.env.VITE_API_URL || "https://57pfzyzy3f.execute-api.us-east-1.amazonaws.com/data";

const App = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedStation, setSelectedStation] = useState('all');
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [stations, setStations] = useState([]);

  // Helper to convert m/s to knots
  const toKts = (ms) => {
    const val = parseFloat(ms);
    return isNaN(val) ? 0 : parseFloat((val * 1.94384).toFixed(1));
  };

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const url = selectedStation === 'all'
          ? API_URL
          : `${API_URL}?station_id=${selectedStation}`;

        const res = await fetch(url);
        const rawData = await res.json();

        // Flatten data for the chart
        // Each item has { station_id, meteo_records: [...], image_url, rekognition_data: { time: "..." } }
        const flattened = [];
        const stationSet = new Set();

        rawData.forEach(item => {
          stationSet.add(item.station_id);
          const imageUrl = item.image_url;
          // Extract time from rekognition data if available
          const rekognitionTime = item.rekognition_data?.time;

          if (item.meteo_records) {
            item.meteo_records.forEach(record => {
              flattened.push({
                timestamp: record.meteo_timestamp, // ISO string for sorting
                displayDate: new Date(record.meteo_timestamp).toLocaleString(), // For chart axis
                // For image display: use extracted time if available, else fallback to meteo time
                imageDisplayDate: rekognitionTime ? `${rekognitionTime} UTC` : new Date(record.meteo_timestamp).toLocaleString(),
                wspd: toKts(record.wind_speed),
                gust: toKts(record.gust),
                wdir: parseFloat(record.wind_dir) || 0,
                station_id: item.station_id,
                image_url: imageUrl,
                raw_record: record
              });
            });
          }
        });

        // Sort by time
        flattened.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        setData(flattened);
        if (selectedStation === 'all') {
          setStations(Array.from(stationSet));
        }
      } catch (err) {
        console.error("Failed to fetch data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedStation]);

  const handleChartClick = (e) => {
    if (e && e.activePayload && e.activePayload[0]) {
      const payload = e.activePayload[0].payload;
      setSelectedPoint(payload);
    }
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wind className="h-8 w-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">NOAA Buoy Cams</h1>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-gray-600">Station:</span>
            <select
              value={selectedStation}
              onChange={(e) => {
                setSelectedStation(e.target.value);
                setSelectedPoint(null);
              }}
              className="block w-40 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
            >
              <option value="all">All Stations</option>
              {stations.map(id => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Chart Section */}
          <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h2 className="text-xl font-semibold mb-6">Wind Conditions (Last 24h)</h2>
            {loading ? (
              <div className="h-[400px] flex items-center justify-center">Loading...</div>
            ) : (
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data} onClick={handleChartClick}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="displayDate"
                      angle={-45}
                      textAnchor="end"
                      height={70}
                      tick={{fontSize: 12}}
                    />
                    <YAxis label={{ value: 'kts', angle: -90, position: 'insideLeft' }} />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="wspd"
                      stroke="#2563eb"
                      name="Wind Speed"
                      dot={false}
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="gust"
                      stroke="#dc2626"
                      name="Gust"
                      dot={false}
                      strokeWidth={1}
                      strokeDasharray="5 5"
                    />
                  </LineChart>
                </ResponsiveContainer>
                <p className="text-sm text-gray-500 mt-2 text-center">
                  Click on any point to view the camera image from that time.
                </p>
              </div>
            )}
          </div>

          {/* Image Section */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h2 className="text-xl font-semibold mb-6">Buoy Camera</h2>
            {selectedPoint ? (
              <div className="space-y-4">
                <div className="aspect-video bg-black rounded-lg overflow-hidden relative">
                  {selectedPoint.image_url ? (
                    <a
                      href={selectedPoint.image_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full h-full cursor-zoom-in"
                      title="Click to view full size"
                    >
                      <img
                        src={selectedPoint.image_url}
                        alt={`Buoy ${selectedPoint.station_id}`}
                        className="w-full h-full object-contain hover:opacity-90 transition-opacity"
                      />
                    </a>
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-400">
                      No Image Available
                    </div>
                  )}
                </div>
                <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Station ID:</span>
                    <span className="font-medium">{selectedPoint.station_id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Time:</span>
                    {/* Use the imageDisplayDate populated from rekognition data */}
                    <span className="font-medium text-sm">{selectedPoint.imageDisplayDate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Wind Speed:</span>
                    <span className="font-medium">{selectedPoint.wspd} kts</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Gust:</span>
                    <span className="font-medium">{selectedPoint.gust} kts</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Direction:</span>
                    <span className="font-medium">{selectedPoint.wdir}°</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 min-h-[300px]">
                <Wind className="h-16 w-16 mb-4 opacity-20" />
                <p>Select a data point to view image</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
