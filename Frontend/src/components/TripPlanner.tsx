/**
 * TripPlanner Component - Copec EV Assistant
 * Plan trips with real GPS search and optimal charging stops
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Icon } from './Icon';

interface Location {
    lat: number;
    lng: number;
    name: string;
    address?: string;
}

interface ChargingStop {
    stationId: string;
    stationName: string;
    address: string;
    location: { lat: number; lng: number };
    chargeToPercent: number;
    estimatedChargeTime: number;
    reason: string;
    hasFast: boolean;
    amenities: string[];
}

interface TripRoute {
    totalDistance: number;
    totalTime: number;
    drivingTime: number;
    chargingTime: number;
    needsCharging: boolean;
}

interface TripPlan {
    origin: Location;
    destination: Location;
    route: TripRoute;
    chargingStops: ChargingStop[];
    aiRecommendation?: string;
}

interface TripPlannerProps {
    onClose: () => void;
    userLocation?: { lat: number; lng: number } | null;
    onShowRoute?: (trip: TripPlan) => void;
}

// Common Chilean destinations for instant results
const CHILEAN_CITIES: Location[] = [
    { lat: -33.0153, lng: -71.5503, name: 'Viña del Mar', address: 'Viña del Mar, Valparaíso, Chile' },
    { lat: -33.0458, lng: -71.6197, name: 'Valparaíso', address: 'Valparaíso, Región de Valparaíso, Chile' },
    { lat: -34.1708, lng: -70.7444, name: 'Rancagua', address: 'Rancagua, Región de O\'Higgins, Chile' },
    { lat: -33.5927, lng: -71.6214, name: 'San Antonio', address: 'San Antonio, Región de Valparaíso, Chile' },
    { lat: -32.9181, lng: -71.5094, name: 'Concón', address: 'Concón, Región de Valparaíso, Chile' },
    { lat: -33.4022, lng: -70.5665, name: 'Las Condes', address: 'Las Condes, Santiago, Chile' },
    { lat: -33.4103, lng: -70.5663, name: 'Providencia', address: 'Providencia, Santiago, Chile' },
    { lat: -33.4167, lng: -70.6000, name: 'Ñuñoa', address: 'Ñuñoa, Santiago, Chile' },
    { lat: -33.4500, lng: -70.6667, name: 'Santiago Centro', address: 'Santiago, Región Metropolitana, Chile' },
    { lat: -33.0245, lng: -71.5518, name: 'Reñaca', address: 'Reñaca, Viña del Mar, Chile' },
    { lat: -36.8201, lng: -73.0440, name: 'Concepción', address: 'Concepción, Región del Biobío, Chile' },
    { lat: -39.8142, lng: -73.2459, name: 'Valdivia', address: 'Valdivia, Región de Los Ríos, Chile' },
    { lat: -41.4693, lng: -72.9424, name: 'Puerto Montt', address: 'Puerto Montt, Región de Los Lagos, Chile' },
    { lat: -29.9027, lng: -71.2519, name: 'La Serena', address: 'La Serena, Región de Coquimbo, Chile' },
    { lat: -23.6509, lng: -70.3975, name: 'Antofagasta', address: 'Antofagasta, Región de Antofagasta, Chile' },
];

// Search with local fallback + API
const searchAddress = async (query: string): Promise<Location[]> => {
    if (query.length < 2) return [];

    const queryLower = query.toLowerCase();

    // First, filter local cities that match
    const localResults = CHILEAN_CITIES.filter(city =>
        city.name.toLowerCase().includes(queryLower) ||
        city.address?.toLowerCase().includes(queryLower)
    );

    // If we have local results, return them immediately
    if (localResults.length > 0) {
        return localResults.slice(0, 5);
    }

    // Otherwise try Nominatim API
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}, Chile&countrycodes=cl&limit=5`,
            {
                headers: {
                    'Accept-Language': 'es',
                    'User-Agent': 'CopecEVAssistant/1.0'
                }
            }
        );

        if (!response.ok) return localResults;

        const data = await response.json();
        const apiResults = data.map((item: any) => ({
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
            name: item.display_name.split(',')[0],
            address: item.display_name
        }));

        return apiResults.length > 0 ? apiResults : localResults;
    } catch (error) {
        console.error('Address search error:', error);
        return localResults;
    }
};

// Popular EV models in Chile with real range specs
const VEHICLE_MODELS = [
    { id: 'tesla_model_3', name: 'Tesla Model 3 Long Range', range: 547 },
    { id: 'tesla_model_y', name: 'Tesla Model Y', range: 455 },
    { id: 'byd_atto3', name: 'BYD Atto 3', range: 420 },
    { id: 'byd_dolphin', name: 'BYD Dolphin', range: 340 },
    { id: 'byd_seal', name: 'BYD Seal', range: 570 },
    { id: 'nissan_leaf', name: 'Nissan Leaf e+', range: 363 },
    { id: 'vw_id4', name: 'Volkswagen ID.4', range: 402 },
    { id: 'hyundai_kona', name: 'Hyundai Kona Electric', range: 380 },
    { id: 'kia_ev6', name: 'Kia EV6', range: 528 },
    { id: 'custom', name: 'Otro vehículo', range: 350 }
];

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function TripPlanner({ onClose, userLocation, onShowRoute }: TripPlannerProps) {
    // Location state
    const [origin, setOrigin] = useState<Location | null>(
        userLocation ? { ...userLocation, name: 'Mi ubicación actual', address: 'Ubicación GPS actual' } : null
    );
    const [destination, setDestination] = useState<Location | null>(null);

    // Search state
    const [originSearch, setOriginSearch] = useState('');
    const [destSearch, setDestSearch] = useState('');
    const [originResults, setOriginResults] = useState<Location[]>([]);
    const [destResults, setDestResults] = useState<Location[]>([]);
    const [showOriginResults, setShowOriginResults] = useState(false);
    const [showDestResults, setShowDestResults] = useState(false);
    const [searching, setSearching] = useState(false);

    // Vehicle state
    const [batteryLevel, setBatteryLevel] = useState(50);
    const [selectedVehicle, setSelectedVehicle] = useState(VEHICLE_MODELS[0]);
    const [customRange, setCustomRange] = useState(350);

    // Preferences
    const [preferFast, setPreferFast] = useState(true);
    const [preferAmenities, setPreferAmenities] = useState(true);

    // Trip state
    const [loading, setLoading] = useState(false);
    const [tripPlan, setTripPlan] = useState<TripPlan | null>(null);

    // Refs
    const originRef = useRef<HTMLDivElement>(null);
    const destRef = useRef<HTMLDivElement>(null);

    // Debounced search for origin
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (originSearch.length >= 3) {
                setSearching(true);
                const results = await searchAddress(originSearch);
                setOriginResults(results);
                setShowOriginResults(results.length > 0);
                setSearching(false);
            } else {
                setOriginResults([]);
                setShowOriginResults(false);
            }
        }, 200);
        return () => clearTimeout(timer);
    }, [originSearch]);

    // Debounced search for destination
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (destSearch.length >= 3) {
                setSearching(true);
                const results = await searchAddress(destSearch);
                setDestResults(results);
                setShowDestResults(results.length > 0);
                setSearching(false);
            } else {
                setDestResults([]);
                setShowDestResults(false);
            }
        }, 200);
        return () => clearTimeout(timer);
    }, [destSearch]);

    // Click outside to close dropdowns
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (originRef.current && !originRef.current.contains(e.target as Node)) {
                setShowOriginResults(false);
            }
            if (destRef.current && !destRef.current.contains(e.target as Node)) {
                setShowDestResults(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Calculate current range
    const vehicleRange = selectedVehicle.id === 'custom' ? customRange : selectedVehicle.range;
    const currentRange = Math.round((batteryLevel / 100) * vehicleRange);

    const handlePlanTrip = useCallback(async () => {
        if (!origin || !destination) {
            alert('Por favor selecciona origen y destino');
            return;
        }

        setLoading(true);
        try {
            const response = await fetch(`${API_BASE}/api/trips/plan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    origin,
                    destination,
                    currentBattery: batteryLevel,
                    vehicleRange,
                    preferences: { preferFast, preferAmenities }
                })
            });

            if (response.ok) {
                const data = await response.json();
                setTripPlan(data.trip);
                if (onShowRoute) onShowRoute(data.trip);
            } else {
                // Calculate mock distance (haversine approximation)
                const R = 6371;
                const dLat = (destination.lat - origin.lat) * Math.PI / 180;
                const dLng = (destination.lng - origin.lng) * Math.PI / 180;
                const a = Math.sin(dLat / 2) ** 2 + Math.cos(origin.lat * Math.PI / 180) * Math.cos(destination.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
                const distance = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));

                const needsCharging = currentRange < distance * 1.15;

                const mockTrip: TripPlan = {
                    origin,
                    destination,
                    route: {
                        totalDistance: distance,
                        totalTime: Math.round(distance * 1.2), // 50 km/h average
                        drivingTime: Math.round(distance * 1.2),
                        chargingTime: needsCharging ? (preferFast ? 25 : 60) : 0,
                        needsCharging
                    },
                    chargingStops: needsCharging ? [{
                        stationId: 'COPEC_RUTA',
                        stationName: 'Copec en Ruta',
                        address: 'Punto óptimo en tu ruta',
                        location: {
                            lat: (origin.lat + destination.lat) / 2,
                            lng: (origin.lng + destination.lng) / 2
                        },
                        chargeToPercent: 80,
                        estimatedChargeTime: preferFast ? 25 : 60,
                        reason: 'Parada de carga recomendada',
                        hasFast: preferFast,
                        amenities: preferAmenities ? ['Pronto Copec', 'Street Burger', 'WiFi', 'Baños'] : ['Baños']
                    }] : [],
                    aiRecommendation: needsCharging
                        ? `Con tu ${selectedVehicle.name} al ${batteryLevel}% (${currentRange} km de autonomía), necesitarás cargar antes de llegar a ${destination.name}. ${preferFast ? 'Una carga rápida de 25 min te dejará al 80%.' : 'Una carga lenta tomará aprox. 1 hora pero es más económica.'}`
                        : `¡Excelente! Con ${currentRange} km de autonomía actual puedes llegar a ${destination.name} (${distance} km) sin necesidad de cargar. Te sobrará aproximadamente ${currentRange - distance} km de autonomía.`
                };
                setTripPlan(mockTrip);
            }
        } catch (error) {
            console.error('Error planning trip:', error);
        } finally {
            setLoading(false);
        }
    }, [origin, destination, batteryLevel, vehicleRange, preferFast, preferAmenities, currentRange, selectedVehicle.name, onShowRoute]);

    const selectOriginResult = (result: Location) => {
        setOrigin(result);
        setOriginSearch('');
        setShowOriginResults(false);
    };

    const selectDestResult = (result: Location) => {
        setDestination(result);
        setDestSearch('');
        setShowDestResults(false);
    };

    const useCurrentLocation = () => {
        if (userLocation) {
            setOrigin({ ...userLocation, name: 'Mi ubicación actual', address: 'Ubicación GPS actual' });
            setOriginSearch('');
        } else if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    setOrigin({
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude,
                        name: 'Mi ubicación actual',
                        address: 'Ubicación GPS actual'
                    });
                    setOriginSearch('');
                },
                () => alert('No se pudo obtener tu ubicación')
            );
        }
    };

    return (
        <div className="trip-planner-overlay" onClick={onClose}>
            <div className="trip-planner" onClick={(e) => e.stopPropagation()}>
                <div className="trip-header">
                    <h2><Icon name="route" size={20} /> Planificar Viaje</h2>
                    <button className="close-btn" onClick={onClose}>
                        <Icon name="close" size={16} />
                    </button>
                </div>

                <div className="trip-form">
                    {/* Origin with GPS Search */}
                    <div className="location-input" ref={originRef}>
                        <label><Icon name="mapPin" size={14} /> ¿Desde dónde sales?</label>

                        <button className="use-location-btn" onClick={useCurrentLocation}>
                            <Icon name="compass" size={14} /> Usar mi ubicación actual
                        </button>

                        <div className="search-wrapper">
                            <input
                                type="text"
                                placeholder="Busca una dirección, ciudad o lugar..."
                                value={originSearch}
                                onChange={(e) => setOriginSearch(e.target.value)}
                                onFocus={() => originResults.length > 0 && setShowOriginResults(true)}
                            />
                            {searching && <Icon name="spark" size={16} className="spin search-icon" />}
                        </div>

                        {showOriginResults && (
                            <div className="search-results">
                                {originResults.map((r, i) => (
                                    <button key={i} className="search-result" onClick={() => selectOriginResult(r)}>
                                        <Icon name="mapPin" size={14} />
                                        <div>
                                            <strong>{r.name}</strong>
                                            <small>{r.address?.substring(0, 60)}...</small>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}

                        {origin && (
                            <div className="selected-location">
                                <Icon name="target" size={14} />
                                <span>{origin.name}</span>
                                <button onClick={() => setOrigin(null)}><Icon name="close" size={12} /></button>
                            </div>
                        )}
                    </div>

                    {/* Destination with GPS Search */}
                    <div className="location-input" ref={destRef}>
                        <label><Icon name="mapPin" size={14} /> ¿A dónde vas?</label>

                        <div className="search-wrapper">
                            <input
                                type="text"
                                placeholder="Busca una dirección, ciudad o lugar..."
                                value={destSearch}
                                onChange={(e) => setDestSearch(e.target.value)}
                                onFocus={() => destResults.length > 0 && setShowDestResults(true)}
                            />
                            {searching && <Icon name="spark" size={16} className="spin search-icon" />}
                        </div>

                        {showDestResults && (
                            <div className="search-results">
                                {destResults.map((r, i) => (
                                    <button key={i} className="search-result" onClick={() => selectDestResult(r)}>
                                        <Icon name="mapPin" size={14} />
                                        <div>
                                            <strong>{r.name}</strong>
                                            <small>{r.address?.substring(0, 60)}...</small>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}

                        {destination && (
                            <div className="selected-location destination">
                                <Icon name="mapPin" size={14} />
                                <span>{destination.name}</span>
                                <button onClick={() => setDestination(null)}><Icon name="close" size={12} /></button>
                            </div>
                        )}
                    </div>

                    {/* Vehicle Selection */}
                    <div className="vehicle-section">
                        <label><Icon name="car" size={14} /> Tu vehículo eléctrico</label>

                        <select
                            value={selectedVehicle.id}
                            onChange={(e) => {
                                const v = VEHICLE_MODELS.find(m => m.id === e.target.value);
                                if (v) setSelectedVehicle(v);
                            }}
                        >
                            {VEHICLE_MODELS.map(v => (
                                <option key={v.id} value={v.id}>
                                    {v.name} ({v.range} km)
                                </option>
                            ))}
                        </select>

                        {selectedVehicle.id === 'custom' && (
                            <div className="custom-range">
                                <label>Autonomía máxima de tu vehículo:</label>
                                <div className="range-input">
                                    <input
                                        type="number"
                                        min="100"
                                        max="800"
                                        value={customRange}
                                        onChange={(e) => setCustomRange(Number(e.target.value))}
                                    />
                                    <span>km</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Battery Level */}
                    <div className="battery-section">
                        <label><Icon name="battery" size={14} /> ¿Cuánta batería tienes ahora?</label>

                        <div className="battery-slider">
                            <input
                                type="range"
                                min="5"
                                max="100"
                                value={batteryLevel}
                                onChange={(e) => setBatteryLevel(Number(e.target.value))}
                            />
                            <span className="battery-value">{batteryLevel}%</span>
                        </div>

                        <div className="range-info">
                            <Icon name="bolt" size={14} />
                            <span>
                                Con <strong>{batteryLevel}%</strong> de batería puedes recorrer aproximadamente <strong>{currentRange} km</strong>
                            </span>
                        </div>

                        <p className="range-explanation">
                            <strong>Tip:</strong> La <em>autonomía</em> es la distancia máxima que tu vehículo puede recorrer con la batería llena.
                            Con tu {selectedVehicle.name} al 100% podrías hacer {vehicleRange} km.
                        </p>
                    </div>

                    {/* Preferences */}
                    <div className="preferences-section">
                        <label><Icon name="gauge" size={14} /> Preferencias</label>

                        <div className="preference-options">
                            <label className={`pref-option ${preferFast ? 'active' : ''}`}>
                                <input
                                    type="checkbox"
                                    checked={preferFast}
                                    onChange={(e) => setPreferFast(e.target.checked)}
                                />
                                <Icon name="bolt" size={14} />
                                <span>Carga rápida</span>
                                <small>~25 min, más caro</small>
                            </label>

                            <label className={`pref-option ${preferAmenities ? 'active' : ''}`}>
                                <input
                                    type="checkbox"
                                    checked={preferAmenities}
                                    onChange={(e) => setPreferAmenities(e.target.checked)}
                                />
                                <Icon name="coffee" size={14} />
                                <span>Con servicios</span>
                                <small>Pronto, café, WiFi</small>
                            </label>
                        </div>
                    </div>

                    <button
                        className="plan-btn"
                        onClick={handlePlanTrip}
                        disabled={loading || !origin || !destination}
                    >
                        {loading
                            ? <><Icon name="spark" size={16} className="spin" /> Calculando ruta...</>
                            : <><Icon name="route" size={16} /> Planificar viaje</>
                        }
                    </button>
                </div>

                {/* Trip Results */}
                {tripPlan && (
                    <div className="trip-results">
                        <div className="route-summary">
                            <h3>📍 {origin?.name} → {destination?.name}</h3>
                            <div className="route-stats">
                                <div className="stat">
                                    <Icon name="compass" size={16} />
                                    <span>{tripPlan.route.totalDistance} km</span>
                                </div>
                                <div className="stat">
                                    <Icon name="clock" size={16} />
                                    <span>~{Math.round(tripPlan.route.totalTime / 60)}h {tripPlan.route.totalTime % 60}m</span>
                                </div>
                                {tripPlan.route.chargingTime > 0 && (
                                    <div className="stat charging">
                                        <Icon name="bolt" size={16} />
                                        <span>+{tripPlan.route.chargingTime}m carga</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {tripPlan.chargingStops.length > 0 && (
                            <div className="charging-stops">
                                <h4><Icon name="bolt" size={16} /> Parada de carga recomendada</h4>
                                {tripPlan.chargingStops.map((stop, i) => (
                                    <div key={i} className="stop-card">
                                        <div className="stop-header">
                                            <strong>{stop.stationName}</strong>
                                            {stop.hasFast && <span className="fast-badge">Rápido</span>}
                                        </div>
                                        <div className="stop-details">
                                            <span><Icon name="battery" size={12} /> Cargar a {stop.chargeToPercent}%</span>
                                            <span><Icon name="clock" size={12} /> ~{stop.estimatedChargeTime} min</span>
                                        </div>
                                        {stop.amenities.length > 0 && (
                                            <div className="stop-amenities">
                                                {stop.amenities.map((a, j) => (
                                                    <span key={j} className="amenity">{a}</span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {tripPlan.aiRecommendation && (
                            <div className="ai-recommendation">
                                <p>{tripPlan.aiRecommendation}</p>
                            </div>
                        )}

                        <a
                            href={`https://maps.google.com/maps/dir/${origin?.lat},${origin?.lng}/${destination?.lat},${destination?.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="start-navigation-btn"
                        >
                            <Icon name="compass" size={16} /> Abrir en Google Maps
                        </a>
                    </div>
                )}
            </div>
        </div>
    );
}
