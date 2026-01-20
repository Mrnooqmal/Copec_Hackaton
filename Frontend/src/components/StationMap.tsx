import { useEffect, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import StationCard from './StationCard';
import VoiceInput from './VoiceInput';
import TripPlanner from './TripPlanner';
import AIChat from './AIChat';
import { Icon } from './Icon';
import stationsData from '../data/stations_geo.json';
import CopecLogo from '../assets/Copec_Logo_2023.svg';
import CopecCielo from '../assets/Copec_Cielo.png';

// Fix Leaflet default icon issue
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;

// Copec color palette (official brand colors)
const COPEC_COLORS = {
    red: '#D60812',        // Copec official red from logo
    primary: '#146CFD',     // Blue principal
    secondary: '#344285',   // Blue secundario
    white: '#FFFFFF',
    gray: '#6B6B6B',
    lightGray: '#F5F7FA',
    available: '#22C55E',
    occupied: '#EF4444',
    maintenance: '#F59E0B'
};

// Custom marker icons
const createMarkerIcon = (statusClass: 'available' | 'partial' | 'occupied') => {
        return L.divIcon({
                html: `
            <div class="copec-marker">
                <div class="marker-body">
                    <div class="marker-image" style="background-image:url(${CopecCielo});"></div>
                </div>
                <span class="marker-dot ${statusClass}"></span>
            </div>
        `,
                className: 'custom-marker',
                iconSize: [48, 64],
                iconAnchor: [24, 58],
                popupAnchor: [0, -56]
        });
};

// Station type definition
interface Charger {
    id: string;
    type: 'fast' | 'slow';
    power: number;
    status: 'available' | 'occupied' | 'maintenance';
    connector: string;
}

interface Station {
    id: string;
    name: string;
    address: string;
    location: { lat: number; lng: number };
    chargers: Charger[];
    usage_factors: {
        peak_hours: string[];
        avg_wait_time: number;
        nearby_amenities: string[];
    };
    distance?: number;
    eta_minutes?: number;
}

interface Recommendation {
    station_id: string;
    station_name: string;
    address: string;
    score: number;
    reasoning: string;
    eta_minutes: number;
    charging_time_minutes: number;
    total_time_minutes: number;
    estimated_cost_clp: number;
    available_chargers: Charger[];
    amenities: string[];
}

// API Base URL
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Location button component
function LocationControl({ onLocationFound }: { onLocationFound: (lat: number, lng: number) => void }) {
    const map = useMap();

    const handleGetLocation = () => {
        if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const { latitude, longitude } = position.coords;
                    map.setView([latitude, longitude], 14);
                    onLocationFound(latitude, longitude);
                },
                (error) => {
                    console.error('Error getting location:', error);
                    // Default to Santiago centro
                    onLocationFound(-33.4489, -70.6693);
                }
            );
        }
    };

    return (
        <button
            onClick={handleGetLocation}
            className="location-button"
            title="Usar mi ubicación"
        >
            <Icon name="mapPin" size={18} />
        </button>
    );
}

export default function StationMap() {
    const [stations, setStations] = useState<Station[]>(stationsData.stations as Station[]);
    const [selectedStation, setSelectedStation] = useState<Station | null>(null);
    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
    const [loading, setLoading] = useState(false);
    const [showRecommendations, setShowRecommendations] = useState(false);
    const [batteryLevel, setBatteryLevel] = useState(50);
    const [urgency, setUrgency] = useState<'low' | 'normal' | 'high'>('normal');
    const [showTripPlanner, setShowTripPlanner] = useState(false);
    const [showAIChat, setShowAIChat] = useState(false);

    // Santiago center coordinates
    const defaultCenter: [number, number] = [-33.4489, -70.6693];
    const defaultZoom = 12;

    // Fetch nearby stations when location changes
    useEffect(() => {
        if (userLocation) {
            fetchNearbyStations(userLocation.lat, userLocation.lng);
        }
    }, [userLocation]);

    const fetchNearbyStations = async (lat: number, lng: number) => {
        try {
            const response = await fetch(
                `${API_BASE}/api/stations/nearby?lat=${lat}&lng=${lng}&radius=15`
            );
            if (response.ok) {
                const data = await response.json();
                setStations(data.stations);
            }
        } catch (error) {
            console.error('Error fetching stations:', error);
            // Keep using local data
        }
    };

    const handleGetRecommendations = useCallback(async () => {
        if (!userLocation) {
            alert('Por favor, activa tu ubicación primero');
            return;
        }

        setLoading(true);
        try {
            const response = await fetch(`${API_BASE}/api/recommend`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    location: userLocation,
                    batteryLevel,
                    urgency,
                    preferFast: true,
                    maxResults: 3
                })
            });

            if (response.ok) {
                const data = await response.json();
                setRecommendations(data.recommendations);
                setShowRecommendations(true);
            } else {
                // Mock recommendations if API fails
                const mockRecommendations = stations
                    .filter(s => s.chargers.some(c => c.status === 'available'))
                    .slice(0, 3)
                    .map((s, i) => ({
                        station_id: s.id,
                        station_name: s.name,
                        address: s.address,
                        score: 95 - i * 10,
                        reasoning: `Estación ${urgency === 'high' ? 'cercana con cargador rápido disponible' : 'con buena disponibilidad y amenities'}`,
                        eta_minutes: 5 + i * 3,
                        charging_time_minutes: 20 + i * 5,
                        total_time_minutes: 30 + i * 10,
                        estimated_cost_clp: 5000 + i * 1000,
                        available_chargers: s.chargers.filter(c => c.status === 'available'),
                        amenities: s.usage_factors.nearby_amenities
                    }));
                setRecommendations(mockRecommendations);
                setShowRecommendations(true);
            }
        } catch (error) {
            console.error('Error getting recommendations:', error);
        } finally {
            setLoading(false);
        }
    }, [userLocation, batteryLevel, urgency, stations]);

    const handleVoiceResult = (transcript: string) => {
        // Process voice input - in real app, this would call the API
        console.log('Voice transcript:', transcript);

        // Simple keyword detection for demo
        if (transcript.toLowerCase().includes('carga') || transcript.toLowerCase().includes('estación')) {
            handleGetRecommendations();
        }
    };

    const getMarkerColor = (station: Station) => {
        const availableCount = station.chargers.filter(c => c.status === 'available').length;
        if (availableCount === 0) return COPEC_COLORS.occupied;
        if (availableCount === station.chargers.length) return COPEC_COLORS.available;
        return COPEC_COLORS.primary;
    };

    const getStatusClass = (station: Station) => {
        const availableCount = station.chargers.filter(c => c.status === 'available').length;
        if (availableCount === 0) return 'occupied';
        if (availableCount === station.chargers.length) return 'available';
        return 'partial';
    };

    return (
        <div className="station-map-container">
            {/* SVG filter to desaturate tiles but keep greens more visible */}
            <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true" focusable="false">
                <filter id="desaturate-keep-green">
                    <feColorMatrix
                        type="matrix"
                        values="0.33 0.33 0.33 0 0  0.2 0.7 0.2 0 0  0.33 0.33 0.33 0 0  0 0 0 1 0"
                    />
                </filter>
            </svg>
            {/* Header */}
            <header className="map-header">
                <div className="logo-section">
                    <img src={CopecLogo} alt="Copec" className="copec-logo" />
                    <div className="title-section">
                        <h1>EV Assistant</h1>
                        <span className="tag">Hackathon Demo</span>
                    </div>
                </div>
                <VoiceInput onResult={handleVoiceResult} />
            </header>

            {/* Controls */}
            <div className="map-controls">
                <div className="control-group">
                    <label>Batería actual</label>
                    <div className="battery-control">
                        <input
                            type="range"
                            min="5"
                            max="95"
                            value={batteryLevel}
                            onChange={(e) => setBatteryLevel(Number(e.target.value))}
                        />
                        <span className="battery-value">{batteryLevel}%</span>
                    </div>
                </div>

                <div className="control-group">
                    <label>Urgencia</label>
                    <div className="urgency-buttons">
                        {(['low', 'normal', 'high'] as const).map((u) => (
                            <button
                                key={u}
                                className={`urgency-btn ${urgency === u ? 'active' : ''}`}
                                onClick={() => setUrgency(u)}
                            >
                                <Icon
                                    name={u === 'low' ? 'leaf' : u === 'normal' ? 'gauge' : 'bolt'}
                                    size={16}
                                />
                                <span>{u === 'low' ? 'Baja' : u === 'normal' ? 'Equilibrada' : 'Alta'}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <button
                    className="recommend-btn"
                    onClick={handleGetRecommendations}
                    disabled={loading}
                >
                    {loading ? (
                        'Buscando...'
                    ) : (
                        <>
                            <Icon name="search" size={16} />
                            <span>Recomendar estación</span>
                        </>
                    )}
                </button>
            </div>

            {/* Map */}
            <div className="map-wrapper">
                <div className="map-surface">
                    <MapContainer
                        center={defaultCenter}
                        zoom={defaultZoom}
                        style={{ height: '100%', width: '100%' }}
                    >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    <LocationControl
                        onLocationFound={(lat, lng) => setUserLocation({ lat, lng })}
                    />

                    {/* User location marker */}
                    {userLocation && (
                        <Marker
                            position={[userLocation.lat, userLocation.lng]}
                            icon={L.divIcon({
                                html: '<div class="user-marker"><svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#D60812" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s7-6.5 7-12.5A7 7 0 0 0 5 9.5C5 15.5 12 22 12 22Z"/><circle cx="12" cy="9.5" r="3.5"/></svg></div>',
                                className: 'user-marker-container',
                                iconSize: [30, 30],
                                iconAnchor: [15, 30]
                            })}
                        >
                            <Popup>Tu ubicación</Popup>
                        </Marker>
                    )}

                    {/* Station markers */}
                    {stations.map((station) => {
                        const available = station.chargers.filter(c => c.status === 'available').length;
                        return (
                            <Marker
                                key={station.id}
                                position={[station.location.lat, station.location.lng]}
                                icon={createMarkerIcon(getStatusClass(station))}
                                eventHandlers={{
                                    click: () => setSelectedStation(station)
                                }}
                            >
                                <Popup>
                                    <div className="marker-popup">
                                        <strong>{station.name}</strong>
                                        <p>{available} / {station.chargers.length} disponibles</p>
                                    </div>
                                </Popup>
                                <Tooltip direction="top" offset={[0, -10]} opacity={1} permanent={false}>
                                    <div className="marker-popup">
                                        <strong>{station.name}</strong>
                                        <p>{available} / {station.chargers.length} disponibles</p>
                                    </div>
                                </Tooltip>
                            </Marker>
                        );
                    })}
                    </MapContainer>
                </div>
            </div>

            {/* Station detail card */}
            {selectedStation && (
                <StationCard
                    station={selectedStation}
                    onClose={() => setSelectedStation(null)}
                    onRecommend={handleGetRecommendations}
                />
            )}

            {/* Recommendations panel */}
            {showRecommendations && recommendations.length > 0 && (
                <div className="recommendations-panel">
                    <div className="panel-header">
                        <div className="panel-title">
                            <Icon name="target" size={18} />
                            <h2>Recomendaciones</h2>
                        </div>
                        <button onClick={() => setShowRecommendations(false)} aria-label="Cerrar">
                            <Icon name="close" size={16} />
                        </button>
                    </div>
                    <div className="recommendations-list">
                        {recommendations.map((rec, index) => (
                            <div key={rec.station_id} className="recommendation-card">
                                <div className="rec-header">
                                    <span className="rec-rank">#{index + 1}</span>
                                    <span className="rec-score">{rec.score}/100</span>
                                </div>
                                <h3>{rec.station_name}</h3>
                                <p className="rec-reasoning">{rec.reasoning}</p>
                                <div className="rec-details">
                                    <span><Icon name="car" size={14} /> {rec.eta_minutes} min</span>
                                    <span><Icon name="bolt" size={14} /> {rec.charging_time_minutes} min carga</span>
                                    <span><Icon name="wallet" size={14} /> ${rec.estimated_cost_clp.toLocaleString('es-CL')}</span>
                                </div>
                                <div className="rec-amenities">
                                    {rec.amenities.slice(0, 3).map((a, i) => (
                                        <span key={i} className="amenity-tag">{a}</span>
                                    ))}
                                </div>
                                <a
                                    href={`https://maps.google.com/?daddr=${stations.find(s => s.id === rec.station_id)?.location.lat},${stations.find(s => s.id === rec.station_id)?.location.lng}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="navigate-btn"
                                >
                                    <Icon name="compass" size={14} /> Navegar
                                </a>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Legend */}
            <div className="map-legend">
                <div className="legend-item">
                    <span className="legend-dot available"></span>
                    <span>Disponible</span>
                </div>
                <div className="legend-item">
                    <span className="legend-dot partial"></span>
                    <span>Parcial</span>
                </div>
                <div className="legend-item">
                    <span className="legend-dot occupied"></span>
                    <span>Ocupado</span>
                </div>
            </div>

            {/* Floating Action Buttons */}
            <div className="fab-stack">
                <button
                    className="fab"
                    onClick={() => setShowTripPlanner(true)}
                    title="Planificar viaje"
                >
                    <Icon name="route" size={18} />
                </button>

                <button
                    className="fab"
                    onClick={() => setShowAIChat(true)}
                    title="Asistente IA"
                >
                    <Icon name="chat" size={18} />
                </button>
            </div>

            {/* Trip Planner Modal */}
            {showTripPlanner && (
                <TripPlanner
                    onClose={() => setShowTripPlanner(false)}
                    userLocation={userLocation}
                />
            )}

            {/* AI Chat */}
            {showAIChat && (
                <AIChat
                    isOpen={showAIChat}
                    onClose={() => setShowAIChat(false)}
                    userContext={{
                        batteryLevel,
                        location: userLocation || undefined,
                        urgency
                    }}
                    onAction={(action) => {
                        if (action.type === 'open_trip_planner') {
                            setShowAIChat(false);
                            setShowTripPlanner(true);
                        }
                    }}
                />
            )}
        </div>
    );
}
