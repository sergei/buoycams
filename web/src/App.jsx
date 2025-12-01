import React, { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Wind, Github, ChevronLeft, ChevronRight, Share2, Check, Cloud } from 'lucide-react';

// --- Configuration ---
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

// --- Components ---

const PanoramaViewer = ({ imageUrl }) => {
  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const startXRef = useRef(0);
  const startOffsetRef = useRef(0);

  const handleStart = (clientX) => {
    setIsDragging(true);
    startXRef.current = clientX;
    startOffsetRef.current = offset;
  };

  const handleMove = (clientX) => {
    if (!isDragging) return;
    const delta = startXRef.current - clientX;
    setOffset(startOffsetRef.current + delta);
  };

  const handleEnd = () => {
    setIsDragging(false);
  };

  return (
    <div
      className="w-full h-[250px] cursor-grab active:cursor-grabbing overflow-hidden rounded-lg relative touch-none bg-gray-900 shadow-inner"
      onMouseDown={(e) => handleStart(e.clientX)}
      onMouseMove={(e) => handleMove(e.clientX)}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
      onTouchStart={(e) => handleStart(e.touches[0].clientX)}
      onTouchMove={(e) => handleMove(e.touches[0].clientX)}
      onTouchEnd={handleEnd}
    >
      {imageUrl ? (
        <div
          className="w-full h-full"
          style={{
            backgroundImage: `url(${imageUrl})`,
            backgroundPosition: `-${offset}px center`,
            backgroundRepeat: 'repeat-x',
            backgroundSize: 'auto 100%'
          }}
        />
      ) : (
        <div className="flex items-center justify-center h-full text-gray-400">
          No Image Available
        </div>
      )}
      
      {/* REMOVED: Overlay label */}
    </div>
  );
};

const App = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedStation, setSelectedStation] = useState('all');
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [stations, setStations] = useState([]);
  const [timeZone, setTimeZone] = useState('UTC');
  const [showCopied, setShowCopied] = useState(false);

  const initialLoadRef = useRef(true);

  const toKts = (ms) => {
    const val = parseFloat(ms);
    return isNaN(val) ? 0 : parseFloat((val * 1.94384).toFixed(1));
  };

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

    if (tz === 'Local') {
      defaultOptions.timeZone = undefined;
    } else {
      defaultOptions.timeZone = tz;
    }

    return date.toLocaleString(undefined, { ...defaultOptions, ...options });
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stationParam = params.get('station_id');
    if (stationParam) {
      setSelectedStation(stationParam);
    }
  }, []);

  useEffect(() => {
    let ignore = false;

    const fetchData = async () => {
      setLoading(true);
      try {
        const url = selectedStation === 'all'
          ? API_URL
          : `${API_URL}?station_id=${selectedStation}`;

        const res = await fetch(url);
        const rawData = await res.json();

        if (ignore) return;

        const flattened = [];
        const stationSet = new Set();

        rawData.forEach(item => {
          stationSet.add(item.station_id);
          const imageUrl = item.image_url;
          const rekognitionTimeStr = item.rekognition_data?.time;

          let rekognitionIso = null;
          if (rekognitionTimeStr) {
            try {
              const [datePart, timePart] = rekognitionTimeStr.split(' ');
              if (datePart && timePart && timePart.length === 4) {
                const [month, day, year] = datePart.split('/');
                const hour = timePart.substring(0, 2);
                const minute = timePart.substring(2, 4);
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
              const meteoIso = record.meteo_timestamp.endsWith('Z')
                ? record.meteo_timestamp
                : record.meteo_timestamp + 'Z';

              const ts = new Date(meteoIso).getTime();

              flattened.push({
                timestamp: meteoIso,
                chartTimestamp: ts,
                wspd: toKts(record.wind_speed),
                gust: toKts(record.gust),
                wdir: parseFloat(record.wind_dir) || 0,
                station_id: item.station_id,
                image_url: imageUrl,
                raw_record: record,
                displayTimestamp: rekognitionIso || meteoIso
              });
            });
          }
        });

        flattened.sort((a, b) => a.chartTimestamp - b.chartTimestamp);

        setData(flattened);

        if (selectedStation === 'all' || stations.length === 0) {
          if (selectedStation === 'all') {
              setStations(Array.from(stationSet).sort());
          } else if (stations.length === 0) {
              setStations(Array.from(stationSet).sort());
          }
        }

        if (flattened.length > 0) {
          const params = new URLSearchParams(window.location.search);
          const timeParam = params.get('time');

          if (timeParam && initialLoadRef.current) {
             const targetTime = parseInt(timeParam);
             const found = flattened.reduce((prev, curr) => {
               return (Math.abs(curr.chartTimestamp - targetTime) < Math.abs(prev.chartTimestamp - targetTime) ? curr : prev);
             });

             if (found) {
               setSelectedPoint(found);
             }
          } else if (!selectedPoint) {
             setSelectedPoint(flattened[flattened.length - 1]);
          }
        }

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
      ignore = true;
    };
  }, [selectedStation]);

  const handleChartClick = (e) => {
    if (e && e.activePayload && e.activePayload[0]) {
      const payload = e.activePayload[0].payload;
      setSelectedPoint(payload);
    }
  };

  const handlePrev = () => {
    if (!selectedPoint || data.length === 0) return;
    const currentIndex = data.indexOf(selectedPoint);
    if (currentIndex > 0) {
      setSelectedPoint(data[currentIndex - 1]);
    }
  };

  const handleNext = () => {
    if (!selectedPoint || data.length === 0) return;
    const currentIndex = data.indexOf(selectedPoint);
    if (currentIndex < data.length - 1 && currentIndex !== -1) {
      setSelectedPoint(data[currentIndex + 1]);
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

  const canGoPrev = () => {
    if (!selectedPoint || data.length === 0) return false;
    const currentIndex = data.indexOf(selectedPoint);
    return currentIndex > 0;
  };

  const canGoNext = () => {
    if (!selectedPoint || data.length === 0) return false;
    const currentIndex = data.indexOf(selectedPoint);
    return currentIndex !== -1 && currentIndex < data.length - 1;
  };

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

  const isAllStations = selectedStation === 'all';

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload;
      return (
        <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-lg text-sm">
          <p className="font-bold text-gray-700 mb-1">
            {formatDate(new Date(label).toISOString(), timeZone)}
          </p>
          <p className="text-gray-600 mb-2">
            Station: <span className="font-medium text-gray-900">{dataPoint.station_id}</span>
          </p>
          {payload.map((entry, index) => (
            <div key={index} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-gray-600">{entry.name}:</span>
              <span className="font-medium text-gray-900">{entry.value} kts</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen p-2 md:p-4 bg-gray-50">
      <div className="max-w-7xl mx-auto space-y-2">
        <header className="flex flex-col md:flex-row md:items-center justify-between bg-white p-2 rounded-xl shadow-sm border border-gray-100 gap-2">
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

        <div className="bg-white p-2 rounded-xl shadow-sm border border-gray-100">
          {selectedPoint ? (
            <div className="flex flex-col gap-2">
              <PanoramaViewer imageUrl={selectedPoint.image_url} />

              <div className="flex flex-col md:flex-row items-center justify-between bg-gray-50 p-2 rounded-lg border border-gray-200 gap-2">
                 <button
                   onClick={handlePrev}
                   disabled={!canGoPrev()}
                   className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-white text-gray-700 rounded-md border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium shadow-sm"
                 >
                   <ChevronLeft className="w-4 h-4" />
                   <span className="hidden sm:inline">Prev</span>
                 </button>

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
            <div className="h-full flex flex-col items-center justify-center text-gray-400 min-h-[250px] bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
              <Wind className="h-16 w-16 mb-4 opacity-20" />
              <p>Select a data point from the chart below to view image</p>
            </div>
          )}
        </div>

        <div className="bg-white p-2 rounded-xl shadow-sm border border-gray-100">
          {loading ? (
            <div className="h-[250px] flex items-center justify-center text-gray-500">Loading chart data...</div>
          ) : (
            <div className="h-[250px]">
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
                  <Tooltip content={<CustomTooltip />} />
                  <Legend verticalAlign="top" height={36}/>

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
                    dot={isAllStations ? { r: 2, fill: "#2563eb" } : false}
                    strokeWidth={isAllStations ? 0 : 2}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="gust"
                    stroke="#dc2626"
                    name="Gust"
                    dot={isAllStations ? { r: 2, fill: "#dc2626" } : false}
                    strokeWidth={isAllStations ? 0 : 1}
                    strokeDasharray="5 5"
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
              <p className="text-sm text-gray-500 mt-2 text-center italic">
                Click on any point in the chart to update the camera view above.
              </p>
            </div>
          )}
        </div>

        <footer className="mt-4 text-center text-gray-500 border-t pt-4 pb-4">
          <div className="flex flex-wrap items-center justify-center gap-4 mb-2">
            <a
              href="https://github.com/sergei/buoycams"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 hover:text-gray-900 transition-colors"
            >
              <Github className="h-5 w-5" />
              <span>Source Code on GitHub</span>
            </a>

            <div className="hidden sm:block w-px h-4 bg-gray-300"></div>

            <a
              href="https://cloudappreciationsociety.org/cloud-library/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 hover:text-gray-900 transition-colors"
            >
              <Cloud className="h-5 w-5" />
              <span>Cloud Appreciation Society</span>
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
