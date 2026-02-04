import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import FileUpload from './components/FileUpload';
import MapView from './components/MapView';
import StatsView from './components/StatsView';
import ChatInterface from './components/ChatInterface';
import { parseTimelineData, calculateStats, extractCity } from './services/dataProcessor';
import { ProcessedEvent, DashboardStats } from './types';
import { 
  initDB, 
  getEnrichmentMap, 
  saveEnrichedPlaces, 
  exportEnrichments, 
  importEnrichments,
  getEnrichedCount,
  EnrichedPlace 
} from './services/enrichmentStore';
import { setGeminiApiKey } from './services/geminiService';
import { Map as MapIcon, BarChart2, MessageSquare, Loader2, Calendar, X, Settings, Key, RefreshCw, Search, CheckCircle2, Download, Upload, Database } from 'lucide-react';

export default function App() {
  const [data, setData] = useState<{ events: ProcessedEvent[]; stats: DashboardStats } | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'analysis'>('dashboard');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichmentProgress, setEnrichmentProgress] = useState(0);
  const [autoEnrichTrigger, setAutoEnrichTrigger] = useState(false);
  
  // Filtering State
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [placeFilter, setPlaceFilter] = useState<{name: string, id?: string} | null>(null);
  const [searchAllTime, setSearchAllTime] = useState(false);
  const [searchInputValue, setSearchInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);

  // Settings State - Pre-filled for testing
  const [showSettings, setShowSettings] = useState(false);
  const [googleMapsApiKey, setGoogleMapsApiKey] = useState('AIzaSyDkZ7kRvLTDsZ9x3re68BHQklIb0w2K-5g');
  const [geminiApiKey, setGeminiApiKeyState] = useState('AIzaSyC3SL9eMYBO1KvcORuJGc0AFKmyxN7_uoo');
  const [tempApiKey, setTempApiKey] = useState(''); // Temp state for input to avoid triggering load while typing
  const [mapsLoaded, setMapsLoaded] = useState(false);
  
  // Sync Gemini API key with service
  const handleGeminiApiKeyChange = (key: string) => {
    setGeminiApiKeyState(key);
    setGeminiApiKey(key);
  };
  
  // Initialize Gemini API key on mount
  useEffect(() => {
    if (geminiApiKey) {
      setGeminiApiKey(geminiApiKey);
    }
  }, []);
  
  // Enrichment State
  const [enrichmentMode, setEnrichmentMode] = useState<'view' | 'all'>('view');
  const [totalPlacesToEnrich, setTotalPlacesToEnrich] = useState(0);
  const [enrichedPlacesCount, setEnrichedPlacesCount] = useState(0);
  const [storedEnrichmentsCount, setStoredEnrichmentsCount] = useState(0);
  
  // Track invalid/expired Place IDs to avoid retrying them
  const failedEnrichmentIds = useRef<Set<string>>(new Set());
  
  // Autocomplete Class Ref (New Places API)
  const autocompleteClassRef = useRef<any>(null);
  
  // Initialize IndexedDB on mount
  useEffect(() => {
    initDB().then(() => {
      getEnrichedCount().then(count => setStoredEnrichmentsCount(count));
    }).catch(console.error);
  }, []);

  // Sync temp key when settings open
  useEffect(() => {
    if (showSettings) {
        setTempApiKey(googleMapsApiKey);
    }
  }, [showSettings, googleMapsApiKey]);

  // Load Google Maps Script Global (only once)
  useEffect(() => {
    // Skip if no API key, script already exists, or already loaded
    if (!googleMapsApiKey) return;
    
    // Check if script already exists in DOM
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      // Script exists, just wait for it to be ready
      const checkReady = setInterval(() => {
        if (window.google?.maps?.importLibrary) {
          setMapsLoaded(true);
          clearInterval(checkReady);
        }
      }, 100);
      return () => clearInterval(checkReady);
    }
    
    if (mapsLoaded) return;

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey}&libraries=places,marker&v=beta`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      // Wait for importLibrary to be available
      const checkReady = setInterval(() => {
        if (window.google?.maps?.importLibrary) {
          setMapsLoaded(true);
          clearInterval(checkReady);
        }
      }, 100);
    };
    script.onerror = () => {
        console.error("Failed to load Google Maps script");
    };
    document.head.appendChild(script);
  }, [googleMapsApiKey, mapsLoaded]);

  // Initialize Autocomplete Services (New Places API only)
  useEffect(() => {
      if (mapsLoaded && window.google?.maps?.importLibrary) {
          const initService = async () => {
             try {
                // New AutocompleteSuggestion API
                const { AutocompleteSuggestion } = await window.google.maps.importLibrary("places");
                autocompleteClassRef.current = AutocompleteSuggestion;
                console.log("Autocomplete service initialized successfully");
             } catch (e) {
                 console.error("Failed to init Autocomplete Services", e);
             }
          };
          initService();
      }
  }, [mapsLoaded]);

  // Initial Data Load - applies stored enrichments automatically
  const handleFileLoaded = async (jsonData: any) => {
    if (!googleMapsApiKey) {
        alert("Please enter a Google Maps API Key first.");
        return;
    }

    setIsProcessing(true);
    failedEnrichmentIds.current.clear();
    
    try {
      const result = parseTimelineData(jsonData);
      if (result) {
        // Apply stored enrichments from IndexedDB
        const enrichmentMap = await getEnrichmentMap();
        let enrichedCount = 0;
        
        if (enrichmentMap.size > 0) {
          console.log(`Applying ${enrichmentMap.size} stored enrichments...`);
          for (let i = 0; i < result.events.length; i++) {
            const event = result.events[i];
            if (event.placeId && enrichmentMap.has(event.placeId)) {
              const enrichment = enrichmentMap.get(event.placeId)!;
              result.events[i] = {
                ...event,
                title: enrichment.name,
                subtitle: enrichment.address || event.subtitle,
                city: enrichment.city || event.city,
                placeTypes: enrichment.types || event.placeTypes
              };
              enrichedCount++;
            }
          }
          // Recalculate stats with enriched data
          result.stats = calculateStats(result.events);
          console.log(`Applied enrichments to ${enrichedCount} events`);
        }
        
        setData(result);
        setStoredEnrichmentsCount(enrichmentMap.size);
        
        const maxDate = result.stats.dateRange.end;
        const minDate = result.stats.dateRange.start;
        
        const defaultEnd = new Date(maxDate);
        const defaultStart = new Date(maxDate);
        defaultStart.setDate(defaultStart.getDate() - 7);
        
        const finalStart = defaultStart < minDate ? minDate : defaultStart;

        setStartDate(finalStart.toISOString().split('T')[0]);
        setEndDate(defaultEnd.toISOString().split('T')[0]);
        
        // Count how many places still need enrichment
        const unknownPlaces = new Set<string>();
        result.events.forEach(e => {
          if (e.type === 'VISIT' && e.placeId && (e.title === 'Visited Place' || e.title === 'Unknown Location')) {
            unknownPlaces.add(e.placeId);
          }
        });
        setTotalPlacesToEnrich(unknownPlaces.size);
        
        // Only auto-enrich if there are places to enrich
        if (unknownPlaces.size > 0) {
          setAutoEnrichTrigger(true);
        }
      } else {
        alert('Could not find any location history in this file. Please ensure it is a valid Timeline export.');
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred while reading the file.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Data Enrichment Logic - supports both 'view' (filtered) and 'all' (entire dataset) modes
  const enrichData = useCallback(async (mode: 'view' | 'all' = 'view') => {
    if (!data || !window.google?.maps || !googleMapsApiKey || isEnriching) return;

    setEnrichmentMode(mode);
    setIsEnriching(true);
    setEnrichmentProgress(0);

    try {
        const { Place } = await window.google.maps.importLibrary("places");
        
        const unknownPlaces = new Map<string, ProcessedEvent[]>();
        
        // Determine date filter based on mode
        let startFilter = new Date(0); 
        let endFilter = new Date(8640000000000000); 
        
        if (mode === 'view') {
          if (startDate) startFilter = new Date(startDate);
          if (endDate) {
              endFilter = new Date(endDate);
              endFilter.setHours(23, 59, 59, 999);
          }
        }
        // For 'all' mode, no date filtering - process everything
        
        data.events.forEach(e => {
            if (mode === 'view' && (e.startTime < startFilter || e.startTime > endFilter)) return;

            if (e.type === 'VISIT' && e.placeId && (e.title === 'Visited Place' || e.title === 'Unknown Location')) {
                if (failedEnrichmentIds.current.has(e.placeId)) return;
                const existing = unknownPlaces.get(e.placeId) || [];
                existing.push(e);
                unknownPlaces.set(e.placeId, existing);
            }
        });

        const uniqueIds = Array.from(unknownPlaces.keys());
        const totalToProcess = uniqueIds.length;
        
        // For 'all' mode, process in larger batches; for 'view' mode, limit to 50
        const batchSize = mode === 'all' ? 100 : 50;
        
        if (totalToProcess === 0) {
            console.log(`No places to enrich in ${mode} mode.`);
            setIsEnriching(false);
            return;
        }

        console.log(`Enriching ${totalToProcess} places in ${mode} mode...`);
        setTotalPlacesToEnrich(totalToProcess);

        let processed = 0;
        let batchEnrichments: EnrichedPlace[] = [];
        const newEvents = [...data.events];
        let hasUpdates = false;

        for (const placeId of uniqueIds) {
            try {
                const place = new Place({ id: placeId });
                await place.fetchFields({ 
                  fields: [
                    'displayName', 
                    'formattedAddress',
                    'rating',
                    'userRatingCount',
                    'types',
                    'regularOpeningHours',
                    'nationalPhoneNumber',
                    'websiteURI',
                    'priceLevel'
                  ] 
                });
                
                const realName = place.displayName;
                const address = place.formattedAddress;
                
                if (realName) {
                    const city = extractCity(address);
                    const types = place.types || undefined;
                    
                    // Update all events with this placeId
                    for (let i = 0; i < newEvents.length; i++) {
                        if (newEvents[i].placeId === placeId) {
                            newEvents[i] = {
                                ...newEvents[i],
                                title: realName,
                                subtitle: address || newEvents[i].subtitle,
                                city: city || newEvents[i].city,
                                placeTypes: types
                            };
                            hasUpdates = true;
                        }
                    }
                    
                    // Queue for IndexedDB persistence with extended fields
                    batchEnrichments.push({
                      placeId,
                      name: realName,
                      address: address || undefined,
                      city: city || undefined,
                      enrichedAt: Date.now(),
                      rating: place.rating || undefined,
                      userRatingCount: place.userRatingCount || undefined,
                      types: place.types || undefined,
                      openingHours: place.regularOpeningHours?.weekdayDescriptions || undefined,
                      phoneNumber: place.nationalPhoneNumber || undefined,
                      websiteUri: place.websiteURI || undefined,
                      priceLevel: place.priceLevel || undefined
                    });
                }
            } catch (err: any) {
                 const msg = err?.message || '';
                 if (msg.includes('NOT_FOUND') || msg.includes('no longer valid')) {
                     failedEnrichmentIds.current.add(placeId);
                 } else {
                     console.warn(`Failed to enrich place ${placeId}`, err);
                 }
            }
            
            processed++;
            setEnrichedPlacesCount(processed);
            setEnrichmentProgress(Math.round((processed / totalToProcess) * 100));
            
            // Save to IndexedDB in batches of 20
            if (batchEnrichments.length >= 20) {
              await saveEnrichedPlaces(batchEnrichments);
              setStoredEnrichmentsCount(prev => prev + batchEnrichments.length);
              batchEnrichments = [];
            }
            
            // For 'view' mode, stop after batchSize
            if (mode === 'view' && processed >= batchSize) {
              break;
            }
            
            // Small delay to avoid rate limiting (every 10 requests)
            if (processed % 10 === 0) {
              await new Promise(r => setTimeout(r, 100));
            }
        }
        
        // Save remaining enrichments
        if (batchEnrichments.length > 0) {
          await saveEnrichedPlaces(batchEnrichments);
          setStoredEnrichmentsCount(prev => prev + batchEnrichments.length);
        }

        if (hasUpdates) {
            const newStats = calculateStats(newEvents);
            setData({ events: newEvents, stats: newStats });
        }
        
        // Update remaining count
        const remaining = totalToProcess - processed;
        setTotalPlacesToEnrich(remaining);
        console.log(`Enrichment complete. ${processed} places processed, ${remaining} remaining.`);

    } catch (err) {
        console.error("Enrichment error:", err);
    } finally {
        setIsEnriching(false);
    }
  }, [data, googleMapsApiKey, isEnriching, startDate, endDate]);

  // Auto-run Enrichment on data load (view mode only)
  useEffect(() => {
    if (autoEnrichTrigger && data && mapsLoaded && !isEnriching) {
        enrichData('view');
        setAutoEnrichTrigger(false);
    }
  }, [autoEnrichTrigger, data, mapsLoaded, isEnriching, enrichData]);
  
  // Export enrichments to JSON file
  const handleExportEnrichments = async () => {
    try {
      const json = await exportEnrichments();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chronomap-enrichments-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export enrichments');
    }
  };
  
  // Import enrichments from JSON file
  const handleImportEnrichments = async (file: File) => {
    try {
      const text = await file.text();
      const count = await importEnrichments(text);
      setStoredEnrichmentsCount(prev => prev + count);
      alert(`Successfully imported ${count} enrichments. Reload data to apply.`);
    } catch (err) {
      console.error('Import failed:', err);
      alert('Failed to import enrichments. Invalid file format.');
    }
  };

  // Derive filtered data
  const filteredEvents = useMemo(() => {
    if (!data) return [];
    
    let result = data.events;

    // 1. Priority: Place Filter
    if (placeFilter) {
        const lowerTerm = placeFilter.name.toLowerCase();
        result = result.filter(e => {
            // Match by ID if available in both
            if (placeFilter.id && e.placeId && e.placeId === placeFilter.id) return true;
            
            // Text match (Fuzzy)
            const title = e.title?.toLowerCase() || '';
            const addr = e.subtitle?.toLowerCase() || '';
            return title.includes(lowerTerm) || addr.includes(lowerTerm);
        });
    }

    // 2. Date Filter (skip if All-Time is checked)
    if (!searchAllTime) {
        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            result = result.filter(e => e.startTime >= start && e.startTime <= end);
        }
    }

    return result;
  }, [data, startDate, endDate, placeFilter, searchAllTime]);

  const filteredStats = useMemo(() => {
    if (!data) return null;
    return calculateStats(filteredEvents);
  }, [data, filteredEvents]);

  const resetFilters = () => {
    if (data) {
        setStartDate(data.stats.dateRange.start.toISOString().split('T')[0]);
        setEndDate(data.stats.dateRange.end.toISOString().split('T')[0]);
        setPlaceFilter(null);
        setSearchAllTime(false);
        setSearchInputValue('');
        setSuggestions([]);
    }
  };

  const handleDateUpdate = (start: string, end: string) => {
      setStartDate(start);
      setEndDate(end);
  };
  
  const handlePlaceFilterUpdate = (query: string, allTime: boolean) => {
      setPlaceFilter({ name: query });
      setSearchInputValue(query);
      setSearchAllTime(allTime);
  };

  const handleSearchInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setSearchInputValue(val);

      if (!val.trim()) {
          setPlaceFilter(null);
          setSuggestions([]);
          return;
      } 
      
      // Update local filter immediately
      setPlaceFilter({ name: val });
          
      // Fetch suggestions if API available
      if (autocompleteClassRef.current && val.length > 2) {
          try {
             // Use new Places API: AutocompleteSuggestion.fetchAutocompleteSuggestions
             const request = { input: val };
             const { suggestions } = await autocompleteClassRef.current.fetchAutocompleteSuggestions(request);
             // Filter only for actual place predictions
             const places = suggestions.filter((s: any) => !!s.placePrediction);
             setSuggestions(places || []);
          } catch (err) {
              // Fail silently or clear suggestions
              setSuggestions([]);
          }
      } else {
          setSuggestions([]);
      }
  };

  const selectSuggestion = (placeName: string, placeId?: string) => {
      setSearchInputValue(placeName);
      setPlaceFilter({ name: placeName, id: placeId });
      setSuggestions([]);
  };

  if (!data || !filteredStats) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative">
        {isProcessing && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center animate-fade-in">
            <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
            <p className="text-white text-xl font-medium">Processing your timeline...</p>
            <p className="text-slate-400 text-sm mt-2">This may take a moment for large files</p>
          </div>
        )}
        
        <div className="text-center mb-8 animate-fade-in-up">
            <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-pink-400 mb-4 tracking-tight">ChronoMap AI</h1>
            <p className="text-slate-400 text-lg">Visualize, Search, and Chat with your Location History</p>
        </div>
        
        <div className="w-full max-w-2xl animate-fade-in-up delay-100 space-y-4">
            {/* Step 1: Google Maps API Key */}
            <div className={`p-6 rounded-xl border transition-all ${googleMapsApiKey.length > 5 ? 'bg-slate-800/80 border-indigo-500/50 shadow-lg shadow-indigo-500/10' : 'bg-slate-800/50 border-slate-700'}`}>
                <div className="flex items-center justify-between mb-4">
                    <label className="block text-sm font-medium text-slate-300 flex items-center gap-2">
                        <Key className="w-4 h-4 text-indigo-400" />
                        1. Google Maps API Key <span className="text-pink-500">*</span>
                    </label>
                    {googleMapsApiKey.length > 5 && (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 animate-fade-in" />
                    )}
                </div>
                <input 
                    type="password" 
                    value={googleMapsApiKey}
                    onChange={(e) => setGoogleMapsApiKey(e.target.value)}
                    placeholder="Paste your API key here (AIza...)"
                    className="w-full bg-slate-950 border border-slate-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-600"
                />
                <p className="text-xs text-slate-500 mt-2">
                    Required for maps and place enrichment. Enable "Maps Javascript API" and "Places API".
                </p>
            </div>

            {/* Step 2: Gemini API Key (Optional) */}
            <div className={`p-6 rounded-xl border transition-all ${geminiApiKey.length > 5 ? 'bg-slate-800/80 border-purple-500/50 shadow-lg shadow-purple-500/10' : 'bg-slate-800/50 border-slate-700'}`}>
                <div className="flex items-center justify-between mb-4">
                    <label className="block text-sm font-medium text-slate-300 flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-purple-400" />
                        2. Gemini AI API Key <span className="text-slate-500">(for Chat)</span>
                    </label>
                    {geminiApiKey.length > 5 && (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 animate-fade-in" />
                    )}
                </div>
                <input 
                    type="password" 
                    value={geminiApiKey}
                    onChange={(e) => handleGeminiApiKeyChange(e.target.value)}
                    placeholder="Paste your Gemini API key here (AIza...)"
                    className="w-full bg-slate-950 border border-slate-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-purple-500 outline-none transition-all placeholder:text-slate-600"
                />
                <p className="text-xs text-slate-500 mt-2">
                    Optional. Get from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">Google AI Studio</a>. Required for AI chat features.
                </p>
            </div>

            {/* Step 3: File Upload */}
            <div className={`transition-all duration-500 ${!googleMapsApiKey ? 'opacity-50 grayscale' : 'opacity-100'}`}>
                <p className="text-sm font-medium text-slate-300 mb-2 ml-1">3. Upload Timeline Data</p>
                <FileUpload onFileLoaded={handleFileLoaded} disabled={!googleMapsApiKey} />
            </div>
        </div>

        <div className="mt-12 text-slate-500 text-sm max-w-md text-center">
          <p>Privacy Note: Your data is processed entirely in your browser and is never uploaded to any server.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col font-sans">
      <header className="h-auto md:h-20 border-b border-slate-800 flex flex-col md:flex-row items-center justify-between px-4 md:px-6 py-3 md:py-0 bg-slate-900/80 backdrop-blur sticky top-0 z-50 gap-4">
        
        {/* Left: Logo & Upload */}
        <div className="flex items-center gap-4 w-full md:w-auto">
           <div className="flex items-center gap-3">
             <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
               <MapIcon className="text-white w-5 h-5" />
             </div>
             <h1 className="font-bold text-xl text-slate-100 tracking-tight hidden lg:block">ChronoMap AI</h1>
           </div>
           
           <div className="flex gap-2">
              <button onClick={() => setData(null)} className="md:hidden text-xs font-medium text-slate-500 hover:text-red-400 transition-colors px-3 py-1.5 hover:bg-slate-800 rounded-lg">
                  New
              </button>
               {googleMapsApiKey && (
                  <button 
                      onClick={() => enrichData('all')}
                      disabled={isEnriching}
                      className="md:hidden text-xs font-medium text-indigo-500 hover:text-indigo-400 transition-colors px-3 py-1.5 hover:bg-slate-800 rounded-lg disabled:opacity-50"
                  >
                      {isEnriching ? `${enrichmentProgress}%` : <Database className="w-4 h-4" />}
                  </button>
               )}
           </div>
        </div>
        
        {/* Center: Filters */}
        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto overflow-x-auto md:overflow-visible py-2">
            
            {/* Search Bar */}
            <div className="relative z-50 flex items-center gap-2 bg-slate-800/50 p-1.5 rounded-lg border border-slate-700/50 min-w-[280px] h-10">
                <Search className="w-4 h-4 text-slate-400 ml-2" />
                
                <input 
                    type="text" 
                    value={searchInputValue}
                    onChange={handleSearchInputChange}
                    placeholder="Search places..." 
                    className="bg-transparent text-xs text-white focus:outline-none w-full placeholder:text-slate-500"
                />

                {placeFilter && (
                    <button 
                        onClick={() => {
                            setPlaceFilter(null);
                            setSearchInputValue('');
                            setSuggestions([]);
                        }} 
                        className="text-slate-500 hover:text-white"
                    >
                        <X className="w-3 h-3" />
                    </button>
                )}

                {/* Suggestions Dropdown */}
                {suggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden max-h-60 overflow-y-auto">
                        {suggestions.map((s, idx) => {
                            // Extract data from new AutocompleteSuggestion format
                            const pred = s.placePrediction;
                            if (!pred) return null;
                            const mainText = pred.mainText?.text;
                            const secText = pred.secondaryText?.text;
                            const pId = pred.placeId;
                            
                            return (
                                <button
                                    key={pId || idx}
                                    onClick={() => selectSuggestion(mainText, pId)}
                                    className="w-full text-left px-4 py-2 text-xs hover:bg-slate-700 text-slate-200 border-b border-slate-700/50 last:border-0 flex flex-col"
                                >
                                    <span className="font-medium">{mainText}</span>
                                    <span className="text-[10px] text-slate-500">{secText}</span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* All-Time Checkbox */}
            <label className="flex items-center gap-2 text-xs font-medium whitespace-nowrap px-2 cursor-pointer text-white hover:text-indigo-300 transition-colors">
                <input 
                    type="checkbox" 
                    checked={searchAllTime}
                    onChange={(e) => setSearchAllTime(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-800 text-indigo-500 focus:ring-offset-0 focus:ring-1 focus:ring-indigo-500"
                />
                All-Time
            </label>

            {/* Date Picker */}
            <div className={`flex items-center gap-2 bg-slate-800/50 p-1.5 rounded-lg border border-slate-700/50 transition-opacity ${searchAllTime ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
                <Calendar className="w-4 h-4 text-slate-400 ml-2" />
                <input 
                    type="date" 
                    value={startDate} 
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-transparent text-xs text-white focus:outline-none w-24 md:w-auto"
                />
                <span className="text-slate-500">-</span>
                <input 
                    type="date" 
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-transparent text-xs text-white focus:outline-none w-24 md:w-auto"
                />
            </div>
            
            <button onClick={resetFilters} title="Reset All" className="p-2 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-colors">
                <X className="w-4 h-4" />
            </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-4 w-full md:w-auto justify-between">
            <div className="flex bg-slate-800/80 p-1 rounded-lg border border-slate-700/50 w-full md:w-auto">
                <button 
                    onClick={() => setActiveTab('dashboard')}
                    className={`flex-1 md:flex-none px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2 ${activeTab === 'dashboard' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}`}
                >
                    <BarChart2 className="w-4 h-4" />
                    Overview
                </button>
                <button 
                    onClick={() => setActiveTab('analysis')}
                    className={`flex-1 md:flex-none px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2 ${activeTab === 'analysis' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}`}
                >
                    <MessageSquare className="w-4 h-4" />
                    Chat
                </button>
            </div>
            
            <button 
                onClick={() => setShowSettings(true)}
                className="hidden md:block p-2 text-slate-400 hover:text-white transition-colors hover:bg-slate-800 rounded-lg"
                title="Settings"
            >
                <Settings className="w-5 h-5" />
            </button>
            
            {googleMapsApiKey && (
                 <div className="hidden md:flex items-center gap-2">
                    <button 
                        onClick={() => enrichData('view')}
                        disabled={isEnriching}
                        className="flex items-center gap-2 text-xs font-medium text-emerald-500 hover:text-emerald-400 transition-colors px-3 py-1.5 hover:bg-slate-800 rounded-lg disabled:opacity-50"
                        title="Enrich places in current date range"
                    >
                        <RefreshCw className={`w-4 h-4 ${isEnriching && enrichmentMode === 'view' ? 'animate-spin' : ''}`} />
                        {isEnriching && enrichmentMode === 'view' ? `${enrichmentProgress}%` : 'Enrich View'}
                    </button>
                    <button 
                        onClick={() => enrichData('all')}
                        disabled={isEnriching}
                        className="flex items-center gap-2 text-xs font-medium text-indigo-500 hover:text-indigo-400 transition-colors px-3 py-1.5 hover:bg-slate-800 rounded-lg disabled:opacity-50"
                        title="Enrich ALL places in dataset (may take a while)"
                    >
                        <Database className={`w-4 h-4 ${isEnriching && enrichmentMode === 'all' ? 'animate-spin' : ''}`} />
                        {isEnriching && enrichmentMode === 'all' ? `${enrichedPlacesCount}/${totalPlacesToEnrich}` : 'Enrich All'}
                    </button>
                    {storedEnrichmentsCount > 0 && (
                      <span className="text-xs text-slate-500" title="Stored enrichments">
                        ({storedEnrichmentsCount} cached)
                      </span>
                    )}
                 </div>
            )}

            <button onClick={() => setData(null)} className="hidden md:block text-xs font-medium text-slate-500 hover:text-red-400 transition-colors px-3 py-1.5 hover:bg-slate-800 rounded-lg whitespace-nowrap">
                New Upload
            </button>
        </div>
      </header>

      {/* Settings Modal */}
      {showSettings && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4">
                <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto">
                    <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                        <Key className="w-5 h-5 text-indigo-400" /> Settings
                    </h3>
                    
                    {/* Google Maps API Key Section */}
                    <div className="mb-4">
                        <label className="text-sm font-medium text-slate-300 mb-2 block">Google Maps API Key</label>
                        <input 
                            type="password" 
                            value={googleMapsApiKey}
                            onChange={(e) => setGoogleMapsApiKey(e.target.value)}
                            placeholder="AIzaSy..."
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                        <p className="text-xs text-slate-500 mt-1">For maps and place enrichment</p>
                    </div>
                    
                    {/* Gemini API Key Section */}
                    <div className="mb-6">
                        <label className="text-sm font-medium text-slate-300 mb-2 block">Gemini AI API Key</label>
                        <input 
                            type="password" 
                            value={geminiApiKey}
                            onChange={(e) => handleGeminiApiKeyChange(e.target.value)}
                            placeholder="AIzaSy..."
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-purple-500 outline-none"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            For AI chat. Get from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">Google AI Studio</a>
                        </p>
                    </div>
                    
                    {/* Data Management Section */}
                    <div className="border-t border-slate-700 pt-4 mb-4">
                        <h4 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
                            <Database className="w-4 h-4 text-indigo-400" />
                            Enrichment Data ({storedEnrichmentsCount} places cached)
                        </h4>
                        <p className="text-xs text-slate-500 mb-3">
                            Enriched place names are stored locally. Export to backup or share across devices.
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={handleExportEnrichments}
                                disabled={storedEnrichmentsCount === 0}
                                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors disabled:opacity-50"
                            >
                                <Download className="w-4 h-4" />
                                Export
                            </button>
                            <label className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors cursor-pointer">
                                <Upload className="w-4 h-4" />
                                Import
                                <input 
                                    type="file" 
                                    accept=".json"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleImportEnrichments(file);
                                        e.target.value = '';
                                    }}
                                />
                            </label>
                        </div>
                    </div>
                    
                    <div className="flex justify-end gap-3 pt-2">
                        <button 
                            onClick={() => setShowSettings(false)}
                            className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
      )}

      <main className="flex-1 p-4 md:p-6 overflow-hidden flex flex-col max-w-[1920px] mx-auto w-full">
         {activeTab === 'dashboard' ? (
             <div className="flex flex-col gap-6 h-full animate-fade-in">
                 <StatsView stats={filteredStats} />
             </div>
         ) : (
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-140px)] animate-fade-in">
                 <div className="lg:col-span-2 h-full flex flex-col gap-4">
                     <div className="flex-1 rounded-xl overflow-hidden border border-slate-700 shadow-2xl relative bg-slate-900">
                         <div className="absolute top-4 right-4 z-[400] bg-slate-900/80 backdrop-blur px-3 py-1 rounded-full border border-slate-700 text-xs text-slate-300">
                             {googleMapsApiKey ? 'Google Maps (Rich)' : 'OpenStreetMap (Standard)'} ({filteredEvents.length} events)
                         </div>
                         <MapView events={filteredEvents} googleMapsApiKey={googleMapsApiKey} />
                     </div>
                 </div>
                 <div className="h-full">
                    <ChatInterface 
                        stats={filteredStats} 
                        events={filteredEvents}
                        allEvents={data.events}
                        onDateChange={handleDateUpdate} 
                        onPlaceFilter={handlePlaceFilterUpdate}
                    />
                 </div>
             </div>
         )}
      </main>
    </div>
  );
}