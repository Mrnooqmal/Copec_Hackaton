/**
 * TripPlanner Component - Copec EV Assistant
 * Plan trips with optimal charging stops
 */

import { useState } from 'react';
import { MapPin, Navigation, Plus, Trash2, Battery, Zap, Clock, Route, Loader2, Coffee, Wifi, Store } from 'lucide-react';

interface Location {
    lat: number;
    lng: number;
    name: string;
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

// Common destinations in Chile
const PRESET_DESTINATIONS = [
    { name: 'Valparaíso', lat: -33.0153, lng: -71.5503 },
    { name: 'Viña del Mar', lat: -33.0245, lng: -71.5518 },
    { name: 'Rancagua', lat: -34.1708, lng: -70.7444 },
    { name: 'Concón', lat: -32.9181, lng: -71.5094 },
    { name: 'San Antonio', lat: -33.5927, lng: -71.6214 }
];

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function TripPlanner({ onClose, userLocation, onShowRoute }: TripPlannerProps) {
    const [origin, setOrigin] = useState<Location | null>(
        userLocation ? { ...userLocation, name: 'Mi ubicación' } : null
    );
    const [destination, setDestination] = useState<Location | null>(null);
    const [waypoints, setWaypoints] = useState<Location[]>([]);
    const [batteryLevel, setBatteryLevel] = useState(50);
    const [vehicleRange, setVehicleRange] = useState(400);
    const [preferFast, setPreferFast] = useState(true);
    const [loading, setLoading] = useState(false);
    const [tripPlan, setTripPlan] = useState<TripPlan | null>(null);
    const [customOrigin, setCustomOrigin] = useState('');

    const handlePlanTrip = async () => {
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
                    waypoints,
                    currentBattery: batteryLevel,
                    vehicleRange,
                    preferences: { preferFast }
                })
            });

            if (response.ok) {
                const data = await response.json();
                setTripPlan(data.trip);
                if (onShowRoute) {
                    onShowRoute(data.trip);
                }
            } else {
                // Mock response for demo
                const mockTrip: TripPlan = {
                    origin,
                    destination,
                    route: {
                        totalDistance: 120,
                        totalTime: 150,
                        drivingTime: 120,
                        chargingTime: 30,
                        needsCharging: batteryLevel < 60
                    },
                    chargingStops: batteryLevel < 60 ? [{
                        stationId: 'COPEC_CASABLANCA',
                        stationName: 'Copec Casablanca',
                        address: 'Ruta 68 Km 62',
                        location: { lat: -33.3167, lng: -71.4000 },
                        chargeToPercent: 80,
                        estimatedChargeTime: 25,
                        reason: 'Parada óptima en ruta',
                        hasFast: true,
                        amenities: ['café', 'baños', 'WiFi', 'Street Burger']
                    }] : [],
                    aiRecommendation: batteryLevel < 60
                        ? 'Te recomiendo cargar en Copec Casablanca, tienen cargadores rápidos y un Street Burger para disfrutar mientras cargas. El tiempo de carga será aprox. 25 minutos.'
                        : 'Con tu nivel de batería actual puedes llegar sin necesidad de cargar. ¡Buen viaje!'
                };
                setTripPlan(mockTrip);
            }
        } catch (error) {
            console.error('Error planning trip:', error);
        } finally {
            setLoading(false);
        }
    };

    const addWaypoint = () => {
        // For demo, add a preset waypoint
        const available = PRESET_DESTINATIONS.filter(
            d => !waypoints.some(w => w.name === d.name) && d.name !== destination?.name
        );
        if (available.length > 0) {
            setWaypoints([...waypoints, available[0]]);
        }
    };

    const removeWaypoint = (index: number) => {
        setWaypoints(waypoints.filter((_, i) => i !== index));
    };

    const getAmenityIcon = (amenity: string) => {
        if (amenity.toLowerCase().includes('café') || amenity.toLowerCase().includes('coffee')) return <Coffee size={12} />;
        if (amenity.toLowerCase().includes('wifi')) return <Wifi size={12} />;
        if (amenity.toLowerCase().includes('burger') || amenity.toLowerCase().includes('tienda')) return <Store size={12} />;
        return null;
    };

    return (
        <div className="trip-planner-overlay" onClick={onClose}>
            <div className="trip-planner" onClick={(e) => e.stopPropagation()}>
                <div className="trip-header">
                    <h2><Route size={20} /> Planificar Viaje</h2>
                    <button className="close-btn" onClick={onClose}>
                        <Trash2 size={16} />
                    </button>
                </div>

                <div className="trip-form">
                    {/* Origin */}
                    <div className="location-input">
                        <label><MapPin size={14} /> Origen</label>
                        <div className="input-row">
                            <select
                                value={origin?.name || ''}
                                onChange={(e) => {
                                    if (e.target.value === 'current' && userLocation) {
                                        setOrigin({ ...userLocation, name: 'Mi ubicación' });
                                    } else if (e.target.value === 'custom') {
                                        setOrigin(null);
                                    } else {
                                        const preset = PRESET_DESTINATIONS.find(d => d.name === e.target.value);
                                        if (preset) setOrigin(preset);
                                    }
                                }}
                            >
                                <option value="">Seleccionar origen</option>
                                {userLocation && <option value="current">Mi ubicación</option>}
                                {PRESET_DESTINATIONS.map(d => (
                                    <option key={d.name} value={d.name}>{d.name}</option>
                                ))}
                                <option value="custom">Otra ubicación...</option>
                            </select>
                        </div>
                        {origin === null && (
                            <input
                                type="text"
                                placeholder="Ingresa dirección de origen"
                                value={customOrigin}
                                onChange={(e) => setCustomOrigin(e.target.value)}
                                onBlur={() => {
                                    if (customOrigin) {
                                        setOrigin({ lat: -33.45, lng: -70.65, name: customOrigin });
                                    }
                                }}
                            />
                        )}
                    </div>

                    {/* Waypoints */}
                    {waypoints.length > 0 && (
                        <div className="waypoints-section">
                            {waypoints.map((wp, index) => (
                                <div key={index} className="waypoint-item">
                                    <MapPin size={12} />
                                    <span>{wp.name}</span>
                                    <button onClick={() => removeWaypoint(index)}>
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <button className="add-waypoint-btn" onClick={addWaypoint}>
                        <Plus size={14} /> Agregar parada
                    </button>

                    {/* Destination */}
                    <div className="location-input">
                        <label><Navigation size={14} /> Destino</label>
                        <select
                            value={destination?.name || ''}
                            onChange={(e) => {
                                const preset = PRESET_DESTINATIONS.find(d => d.name === e.target.value);
                                if (preset) setDestination(preset);
                            }}
                        >
                            <option value="">Seleccionar destino</option>
                            {PRESET_DESTINATIONS.map(d => (
                                <option key={d.name} value={d.name}>{d.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Vehicle Settings */}
                    <div className="vehicle-settings">
                        <div className="setting-group">
                            <label><Battery size={14} /> Batería actual</label>
                            <div className="battery-slider">
                                <input
                                    type="range"
                                    min="5"
                                    max="95"
                                    value={batteryLevel}
                                    onChange={(e) => setBatteryLevel(Number(e.target.value))}
                                />
                                <span>{batteryLevel}%</span>
                            </div>
                        </div>

                        <div className="setting-group">
                            <label><Zap size={14} /> Autonomía (km)</label>
                            <select
                                value={vehicleRange}
                                onChange={(e) => setVehicleRange(Number(e.target.value))}
                            >
                                <option value={300}>300 km</option>
                                <option value={400}>400 km</option>
                                <option value={500}>500 km</option>
                                <option value={600}>600 km</option>
                            </select>
                        </div>

                        <div className="setting-group checkbox">
                            <label>
                                <input
                                    type="checkbox"
                                    checked={preferFast}
                                    onChange={(e) => setPreferFast(e.target.checked)}
                                />
                                <Zap size={14} /> Preferir carga rápida
                            </label>
                        </div>
                    </div>

                    <button
                        className="plan-btn"
                        onClick={handlePlanTrip}
                        disabled={loading || !origin || !destination}
                    >
                        {loading ? <><Loader2 size={16} className="spin" /> Planificando...</> : <><Route size={16} /> Planificar ruta</>}
                    </button>
                </div>

                {/* Trip Results */}
                {tripPlan && (
                    <div className="trip-results">
                        <div className="route-summary">
                            <h3>Resumen del viaje</h3>
                            <div className="route-stats">
                                <div className="stat">
                                    <Navigation size={16} />
                                    <span>{tripPlan.route.totalDistance} km</span>
                                </div>
                                <div className="stat">
                                    <Clock size={16} />
                                    <span>{Math.round(tripPlan.route.totalTime / 60)}h {tripPlan.route.totalTime % 60}m</span>
                                </div>
                                {tripPlan.route.chargingTime > 0 && (
                                    <div className="stat">
                                        <Zap size={16} />
                                        <span>{tripPlan.route.chargingTime}m carga</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Charging Stops */}
                        {tripPlan.chargingStops.length > 0 && (
                            <div className="charging-stops">
                                <h3><Zap size={16} /> Paradas de carga</h3>
                                {tripPlan.chargingStops.map((stop, index) => (
                                    <div key={index} className="stop-card">
                                        <div className="stop-header">
                                            <strong>{stop.stationName}</strong>
                                            {stop.hasFast && <span className="fast-badge">Rápido</span>}
                                        </div>
                                        <p className="stop-address">{stop.address}</p>
                                        <div className="stop-details">
                                            <span><Battery size={12} /> Cargar a {stop.chargeToPercent}%</span>
                                            <span><Clock size={12} /> ~{stop.estimatedChargeTime} min</span>
                                        </div>
                                        {stop.amenities.length > 0 && (
                                            <div className="stop-amenities">
                                                {stop.amenities.slice(0, 4).map((a, i) => (
                                                    <span key={i} className="amenity-chip">
                                                        {getAmenityIcon(a)} {a}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* AI Recommendation */}
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
                            <Navigation size={16} /> Iniciar navegación
                        </a>
                    </div>
                )}
            </div>
        </div>
    );
}
