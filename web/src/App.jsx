import React, { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Wind, Github, ChevronLeft, ChevronRight, Share2, Check } from 'lucide-react';

// --- Configuration ---
// Use environment variable if available, otherwise fallback or empty
const API_URL = import.meta.env.VITE_API_URL || "https://57pfzyzy3f.execute-api.us-east-1.amazonaws.com/data";

const TIMEZONES = [
  { label: 'UTC', value: 'UTC' },
  { label: 'Local Time', value: 'Local' },
  { label: 'US Eastern (ET)', value: 'America/New_York' },
  { label: 'US Central (CT)', value: 'America/Chicago' },
  { label: 'US Mountain (MT)', value: 'America/Denver' },
  { label: 'US Pacific (PT)', value: 'America/Los_Angeles' },
  { label: 'Hawaii (HST)', value: 'Pacific/Honolulu' },
  { label: 'London (GMT/BST)', value: 'Europe/London' },
  { label: 'Central Europe (CET)', value: 'Europe/Paris' },
  { label: 'Sydney (AEST)', value: 'Australia/Sydney' },
  { label: 'Tokyo (JST)', value: 'Asia/Tokyo' },
];

const App = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedStation, setSelectedStation] = useState('all');
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [stations, setStations] = useState([]);
  const [timeZone, setTimeZone] = useState('UTC');
  const [showCopied, setShowCopied] = useState(false);

  // Ref to track if initial load from URL is pending
  const initialLoadRef = useRef(true);

  // Helper to convert m/s to knots
  const toKts = (ms) => {
    const val = parseFloat(ms);
    return isNaN(val) ? 0 : parseFloat((val * 1.94384).toFixed(1));
  };

  // Helper to format date based on selected timezone
  const formatDate = (isoString, tz, options = {}) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const defaultOptions = {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZoneName: 'short'
    };

    // Handle "Local" vs specific IANA timezones
    if (tz === 'Local') {
      // undefined timeZone uses system local
      defaultOptions.timeZone = undefined;
    } else {
      defaultOptions.timeZone = tz;
    }

    return date.toLocaleString(undefined, { ...defaultOptions, ...options });
  };

  // --- Effect: Read URL params on mount ---
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stationParam = params.get('station_id');
    if (stationParam) {
      setSelectedStation(stationParam);
    }
  }, []);

  // Fetch data
  useEffect(() => {
    let ignore = false; // Flag to ignore stale results

    const fetchData = async () => {
      setLoading(true);
      try {
        const url = selectedStation === 'all'
          ? API_URL
          : `${API_URL}?station_id=${selectedStation}`;

        const res = await fetch(url);
        const rawData = await res.json();

        // If this effect is stale (cleanup ran), ignore result
        if (ignore) return;

        // Flatten data for the chart
        const flattened = [];
        const stationSet = new Set();

        rawData.forEach(item => {
          stationSet.add(item.station_id);
          const imageUrl = item.image_url;
          // Extract time from rekognition data if available
          const rekognitionTimeStr = item.rekognition_data?.time;
          
          // Parse rekognition string "MM/DD/YYYY HHMM" to ISO UTC string
          let rekognitionIso = null;
          if (rekognitionTimeStr) {
            try {
              // Expected format: "11/18/2025 1610"
              const [datePart, timePart] = rekognitionTimeStr.split(' ');
              if (datePart && timePart && timePart.length === 4) {
                const [month, day, year] = datePart.split('/');
                const hour = timePart.substring(0, 2);
                const minute = timePart.substring(2, 4);
                // Create UTC date
                const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
                if (!isNaN(date.getTime())) {
                  rekognitionIso = date.toISOString();
                }
              }
            } catch (e) {
              console.warn("Failed to parse image time:", rekognitionTimeStr);
            }
          }

          if (item.meteo_records) {
            item.meteo_records.forEach(record => {
              const ts = new Date(record.meteo_timestamp).getTime();
              
              flattened.push({
                timestamp: record.meteo_timestamp, // ISO string
                chartTimestamp: ts, // Numeric timestamp for XAxis
                wspd: toKts(record.wind_speed),
                gust: toKts(record.gust),
                wdir: parseFloat(record.wind_dir) || 0,
                station_id: item.station_id,
                image_url: imageUrl,
                raw_record: record,
                // Prefer the image timestamp if we successfully parsed it, otherwise fallback to wind timestamp
                displayTimestamp: rekognitionIso || record.meteo_timestamp
              });
            });
          }
        });

        // Sort by time
        flattened.sort((a, b) => a.chartTimestamp - b.chartTimestamp);

        setData(flattened);
        
        // Only update station list if we fetched 'all' or if list is empty
        // This prevents wiping the list when viewing a single station
        if (selectedStation === 'all' || stations.length === 0) {
          // If we fetched a single station, we only know about that one.
          // Ideally we should fetch the list separately, but for now:
          if (selectedStation === 'all') {
              setStations(Array.from(stationSet));
          } else if (stations.length === 0) {
              // If it's the first load and it's a single station, add it so the dropdown isn't empty
              setStations(Array.from(stationSet));
          }
        }
        
        // Handle Initial Selection based on URL or Default
        if (flattened.length > 0) {
          // Check for time param on first load
          const params = new URLSearchParams(window.location.search);
          const timeParam = params.get('time');
          
          if (timeParam && initialLoadRef.current) {
             const targetTime = parseInt(timeParam);
             // Find closest point
             const found = flattened.reduce((prev, curr) => {
               return (Math.abs(curr.chartTimestamp - targetTime) < Math.abs(prev.chartTimestamp - targetTime) ? curr : prev);
             });
             
             if (found) {
               setSelectedPoint(found);
             }
          } else if (!selectedPoint) {
             // Only default to latest if we don't have a point selected (e.g. station change)
             setSelectedPoint(flattened[flattened.length - 1]);
          }
        }
        
        // Mark initial load as complete
        initialLoadRef.current = false;

      } catch (err) {
        if (!ignore) {
            console.error("Failed to fetch data:", err);
        }
      } finally {
        if (!ignore) {
            setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      ignore = true; // Mark this effect execution as stale
    };
  }, [selectedStation]);

  const handleChartClick = (e) => {
    if (e && e.activePayload && e.activePayload[0]) {
      const payload = e.activePayload[0].payload;
      setSelectedPoint(payload);
    }
  };

  // Navigation Handlers
  const handlePrev = () => {
    if (!selectedPoint || data.length === 0) return;
    const currentUrl = selectedPoint.image_url;
    const currentIndex = data.findIndex(d => d.timestamp === selectedPoint.timestamp);

    if (currentIndex === -1) return;

    // 1. Find the last item of the previous group (skip current image group)
    let i = currentIndex - 1;
    // Loop backwards as long as we are in bounds AND the url is the same as current
    while (i >= 0 && data[i] && data[i].image_url === currentUrl) {
      i--;
    }

    if (i >= 0 && data[i]) {
      // 2. We found the last item of the previous group.
      // Now find the FIRST item of that specific previous group to be consistent.
      const prevGroupUrl = data[i].image_url;
      let firstOfPrev = i;
      // Loop backwards as long as previous item exists and has same url
      while (firstOfPrev > 0 && data[firstOfPrev - 1] && data[firstOfPrev - 1].image_url === prevGroupUrl) {
        firstOfPrev--;
      }
      setSelectedPoint(data[firstOfPrev]);
    }
  };

  const handleNext = () => {
    if (!selectedPoint || data.length === 0) return;
    const currentUrl = selectedPoint.image_url;
    const currentIndex = data.findIndex(d => d.timestamp === selectedPoint.timestamp);

    if (currentIndex === -1) return;

    // Find the first item of the next group (skip current image group)
    let nextIndex = currentIndex + 1;
    while(nextIndex < data.length && data[nextIndex] && data[nextIndex].image_url === currentUrl) {
      nextIndex++;
    }

    if (nextIndex < data.length && data[nextIndex]) {
      setSelectedPoint(data[nextIndex]);
    }
  };

  const handleShare = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedStation !== 'all') {
        params.set('station_id', selectedStation);
      }
      if (selectedPoint) {
        params.set('time', selectedPoint.chartTimestamp);
      }

      const shareUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
      await navigator.clipboard.writeText(shareUrl);

      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy link", err);
    }
  };

  // Helper to check if navigation is possible
  const canGoPrev = () => {
    if (!selectedPoint || data.length === 0) return false;
    const currentIndex = data.findIndex(d => d.timestamp === selectedPoint.timestamp);
    if (currentIndex === -1) return false;

    // Can go prev if there is a record before the current group
    // Check if any record before current index has a different URL
    for (let i = currentIndex - 1; i >= 0; i--) {
        if (data[i] && data[i].image_url !== selectedPoint.image_url) return true;
    }
    return false;
  };

  const canGoNext = () => {
    if (!selectedPoint || data.length === 0) return false;
    const currentIndex = data.findIndex(d => d.timestamp === selectedPoint.timestamp);
    if (currentIndex === -1) return false;

    // Can go next if there is a record after the current group
    // Check if any record after current index has a different URL
    for (let i = currentIndex + 1; i < data.length; i++) {
        if (data[i] && data[i].image_url !== selectedPoint.image_url) return true;
    }
    return false;
  };

  // Helper to format X-axis ticks
  const formatXAxis = (tick) => {
    const date = new Date(tick);
    const options = {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute:'2-digit',
      hour12: false
    };

    if (timeZone === 'Local') {
      options.timeZone = undefined;
    } else {
      options.timeZone = timeZone;
    }

    return date.toLocaleString(undefined, options);
  };

  return (
    <div className="min-h-screen p-4 md:p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-gray-100 gap-4">
          <div className="flex items-center gap-2">
            <Wind className="h-8 w-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">NOAA Buoy Cams</h1>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-gray-600 hidden sm:inline">Time Zone:</span>
              <select
                value={timeZone}
                onChange={(e) => setTimeZone(e.target.value)}
                className="block rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border bg-white text-sm max-w-[150px] sm:max-w-none"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
            </div>

            <div className="h-6 w-px bg-gray-300 hidden sm:block"></div>

            <div className="flex items-center gap-2">
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

            <button
              onClick={handleShare}
              className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors border border-gray-200"
              title="Copy link to this view"
            >
              {showCopied ? <Check className="w-5 h-5 text-green-500" /> : <Share2 className="w-5 h-5" />}
              <span className="text-sm font-medium">{showCopied ? 'Copied!' : 'Share'}</span>
            </button>
          </div>
        </header>

        {/* Main Layout: Stacked Vertical */}

        {/* Top Section: Camera Image & Details */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          {selectedPoint ? (
            <div className="flex flex-col gap-4">
              {/* Top: Image Area - Full Width */}
              <div className="w-full bg-black rounded-lg shadow-inner overflow-x-auto">
                {selectedPoint.image_url ? (
                  <div className="h-[300px] inline-block relative">
                    <a
                      href={selectedPoint.image_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block h-full"
                      title="Click to view full size"
                    >
                      <img
                        src={selectedPoint.image_url}
                        alt={`Buoy ${selectedPoint.station_id}`}
                        className="h-[300px] w-auto max-w-none object-contain hover:opacity-90 transition-opacity"
                      />
                    </a>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-gray-400 w-full">
                    No Image Available
                  </div>
                )}
              </div>

              {/* Bottom: Navigation & Stats Bar */}
              <div className="flex flex-col md:flex-row items-center justify-between bg-gray-50 p-4 rounded-lg border border-gray-200 gap-4">
                 {/* Prev Button */}
                 <button
                   onClick={handlePrev}
                   disabled={!canGoPrev()}
                   className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-white text-gray-700 rounded-md border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium shadow-sm"
                 >
                   <ChevronLeft className="w-4 h-4" />
                   <span className="hidden sm:inline">Prev</span>
                 </button>

                 {/* Center: Compact Stats */}
                 <div className="flex-1 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">Station:</span>
                      <a 
                        href={`https://www.ndbc.noaa.gov/station_page.php?station=${selectedPoint.station_id}`}
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="font-bold text-blue-600 hover:underline"
                        title="View station page on NOAA website"
                      >
                        {selectedPoint.station_id}
                      </a>
                    </div>
                    <div className="hidden sm:block w-px h-4 bg-gray-300"></div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">Time:</span>
                      <span className="font-bold text-gray-900">
                        {formatDate(selectedPoint.displayTimestamp, timeZone)}
                      </span>
                    </div>
                    <div className="hidden sm:block w-px h-4 bg-gray-300"></div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">Wind:</span>
                      <span className="font-bold text-blue-600 text-base">{selectedPoint.wspd} kts</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">Gust:</span>
                      <span className="font-bold text-red-500 text-base">{selectedPoint.gust} kts</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">Dir:</span>
                      <span className="font-bold text-gray-900">{selectedPoint.wdir}°</span>
                    </div>
                 </div>

                 {/* Next Button */}
                 <button
                   onClick={handleNext}
                   disabled={!canGoNext()}
                   className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-white text-gray-700 rounded-md border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium shadow-sm"
                 >
                   <span className="hidden sm:inline">Next</span>
                   <ChevronRight className="w-4 h-4" />
                 </button>
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
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          {loading ? (
            <div className="h-[400px] flex items-center justify-center text-gray-500">Loading chart data...</div>
          ) : (
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} onClick={handleChartClick}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis
                    dataKey="chartTimestamp"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={formatXAxis}
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
                    labelFormatter={(label) => formatDate(new Date(label).toISOString(), timeZone)}
                    contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    labelStyle={{ color: '#374151', fontWeight: 'bold', marginBottom: '4px' }}
                  />
                  <Legend verticalAlign="top" height={36}/>

                  {/* Current Selection Indicator */}
                  {selectedPoint && (
                    <ReferenceLine
                      key={selectedPoint.chartTimestamp}
                      x={selectedPoint.chartTimestamp}
                      stroke="#10b981"
                      strokeDasharray="3 3"
                      label={{ position: 'top', value: 'Current', fill: '#10b981', fontSize: 12 }}
                      isFront={true}
                    />
                  )}

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
            Data provided by <a
              href="https://www.ndbc.noaa.gov/buoycams.shtml"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-blue-600 transition-colors"
            >
              NOAA National Data Buoy Center
            </a>.
          </p>
        </footer>
      </div>
    </div>
  );
};

export default App;