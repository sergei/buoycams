import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Wind, Github } from 'lucide-react';

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
        
        // Select the latest point by default if data is available
        if (flattened.length > 0 && !selectedPoint) {
           // Use the last item (latest time)
           setSelectedPoint(flattened[flattened.length - 1]);
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
    <div className="min-h-screen p-4 md:p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-2">
            <Wind className="h-8 w-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">NOAA Buoy Cams</h1>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-gray-600 hidden sm:inline">Station:</span>
            <select
              value={selectedStation}
              onChange={(e) => {
                setSelectedStation(e.target.value);
                setSelectedPoint(null);
              }}
              className="block w-40 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border bg-white"
            >
              <option value="all">All Stations</option>
              {stations.map(id => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
          </div>
        </header>

        {/* Main Layout: Stacked Vertical */}
        
        {/* Top Section: Camera Image & Details */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-xl font-semibold mb-6">Buoy Camera</h2>
          {selectedPoint ? (
            <div className="flex flex-col md:flex-row gap-8">
              {/* Left: Details */}
              <div className="w-full md:w-1/3 space-y-4">
                <div className="bg-blue-50 p-6 rounded-xl space-y-4 h-full">
                   <h3 className="text-lg font-medium text-blue-900 border-b border-blue-100 pb-2">Current Conditions</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Station ID</span>
                      <span className="font-bold text-gray-900">{selectedPoint.station_id}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Time (UTC)</span>
                      <span className="font-bold text-gray-900 text-sm text-right">{selectedPoint.imageDisplayDate}</span>
                    </div>
                    <div className="h-px bg-blue-100 my-2"></div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Wind Speed</span>
                      <span className="font-bold text-blue-600 text-xl">{selectedPoint.wspd} <span className="text-sm text-gray-500 font-normal">kts</span></span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Gusts</span>
                      <span className="font-bold text-red-500 text-xl">{selectedPoint.gust} <span className="text-sm text-gray-500 font-normal">kts</span></span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Direction</span>
                      <span className="font-bold text-gray-900">{selectedPoint.wdir}°</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Image */}
              <div className="w-full md:w-2/3">
                 <div className="bg-black rounded-lg overflow-hidden relative shadow-inner w-full">
                  {selectedPoint.image_url ? (
                    <a
                      href={selectedPoint.image_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full cursor-zoom-in"
                      title="Click to view full size"
                    >
                      <img
                        src={selectedPoint.image_url}
                        alt={`Buoy ${selectedPoint.station_id}`}
                        className="w-full h-auto object-contain max-h-[500px] mx-auto hover:opacity-90 transition-opacity"
                      />
                    </a>
                  ) : (
                    <div className="flex items-center justify-center h-[300px] text-gray-400">
                      No Image Available
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 min-h-[300px] bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
              <Wind className="h-16 w-16 mb-4 opacity-20" />
              <p>Select a data point from the chart below to view image</p>
            </div>
          )}
        </div>

        {/* Bottom Section: Chart */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-xl font-semibold mb-6">Wind History (Last 24h)</h2>
          {loading ? (
            <div className="h-[400px] flex items-center justify-center text-gray-500">Loading chart data...</div>
          ) : (
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} onClick={handleChartClick}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis
                    dataKey="displayDate"
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    tick={{fontSize: 12, fill: '#6b7280'}}
                    tickMargin={10}
                  />
                  <YAxis 
                    label={{ value: 'Wind Speed (kts)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#6b7280' } }} 
                    tick={{fill: '#6b7280'}}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    labelStyle={{ color: '#374151', fontWeight: 'bold', marginBottom: '4px' }}
                  />
                  <Legend verticalAlign="top" height={36}/>
                  <Line
                    type="monotone"
                    dataKey="wspd"
                    stroke="#2563eb"
                    name="Wind Speed"
                    dot={false}
                    strokeWidth={2}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="gust"
                    stroke="#dc2626"
                    name="Gust"
                    dot={false}
                    strokeWidth={1}
                    strokeDasharray="5 5"
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
              <p className="text-sm text-gray-500 mt-4 text-center italic">
                Click on any point in the chart to update the camera view above.
              </p>
            </div>
          )}
        </div>
        
        <footer className="mt-12 text-center text-gray-500 border-t pt-8 pb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <a
              href="https://github.com/sergei/buoycams" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 hover:text-gray-900 transition-colors"
            >
              <Github className="h-5 w-5" />
              <span>Source Code on GitHub</span>
            </a>
          </div>
          <p className="text-sm">
            Data provided by NOAA National Data Buoy Center.
          </p>
        </footer>
      </div>
    </div>
  );
};

export default App;
