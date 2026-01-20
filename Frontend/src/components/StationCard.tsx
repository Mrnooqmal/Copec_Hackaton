/**
 * StationCard Component - Copec EV Assistant
 * Detailed station information card
 */

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

interface StationCardProps {
    station: Station;
    onClose: () => void;
    onRecommend: () => void;
}

export default function StationCard({ station, onClose, onRecommend }: StationCardProps) {
    const availableChargers = station.chargers.filter(c => c.status === 'available');
    const fastChargers = station.chargers.filter(c => c.type === 'fast');
    const slowChargers = station.chargers.filter(c => c.type === 'slow');

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'available': return '#22C55E';
            case 'occupied': return '#EF4444';
            case 'maintenance': return '#F59E0B';
            default: return '#6B6B6B';
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'available': return 'Disponible';
            case 'occupied': return 'Ocupado';
            case 'maintenance': return 'Mantenimiento';
            default: return status;
        }
    };

    const getConnectorIcon = (connector: string) => {
        switch (connector) {
            case 'CCS2': return '🔌';
            case 'Type2': return '🔋';
            case 'CHAdeMO': return '⚡';
            default: return '🔌';
        }
    };

    return (
        <div className="station-card-overlay" onClick={onClose}>
            <div className="station-card" onClick={(e) => e.stopPropagation()}>
                <button className="close-btn" onClick={onClose}>✕</button>

                <div className="card-header">
                    <h2>{station.name}</h2>
                    <p className="address">{station.address}</p>
                    {station.distance !== undefined && (
                        <p className="distance">📍 {station.distance} km {station.eta_minutes && `• ${station.eta_minutes} min`}</p>
                    )}
                </div>

                <div className="availability-summary">
                    <div className="summary-item available">
                        <span className="count">{availableChargers.length}</span>
                        <span className="label">Disponibles</span>
                    </div>
                    <div className="summary-item fast">
                        <span className="count">{fastChargers.length}</span>
                        <span className="label">Rápidos</span>
                    </div>
                    <div className="summary-item slow">
                        <span className="count">{slowChargers.length}</span>
                        <span className="label">Lentos</span>
                    </div>
                </div>

                <div className="chargers-section">
                    <h3>Cargadores</h3>
                    <div className="chargers-grid">
                        {station.chargers.map((charger) => (
                            <div
                                key={charger.id}
                                className={`charger-item ${charger.status}`}
                            >
                                <div className="charger-icon">
                                    {getConnectorIcon(charger.connector)}
                                </div>
                                <div className="charger-info">
                                    <span className="charger-type">
                                        {charger.type === 'fast' ? '⚡ Rápido' : '🔋 Lento'}
                                    </span>
                                    <span className="charger-power">{charger.power} kW</span>
                                    <span className="charger-connector">{charger.connector}</span>
                                </div>
                                <div
                                    className="charger-status"
                                    style={{ backgroundColor: getStatusColor(charger.status) }}
                                >
                                    {getStatusLabel(charger.status)}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="usage-section">
                    <h3>Información de uso</h3>
                    <div className="usage-grid">
                        <div className="usage-item">
                            <span className="usage-icon">⏱️</span>
                            <span className="usage-label">Tiempo promedio de espera</span>
                            <span className="usage-value">{station.usage_factors.avg_wait_time} min</span>
                        </div>
                        <div className="usage-item">
                            <span className="usage-icon">🕐</span>
                            <span className="usage-label">Horarios pico</span>
                            <span className="usage-value">{station.usage_factors.peak_hours.join(', ')}</span>
                        </div>
                    </div>
                </div>

                <div className="amenities-section">
                    <h3>Servicios cercanos</h3>
                    <div className="amenities-list">
                        {station.usage_factors.nearby_amenities.map((amenity, index) => (
                            <span key={index} className="amenity-badge">
                                {amenity === 'café' && '☕'}
                                {amenity === 'baños' && '🚻'}
                                {amenity === 'WiFi' && '📶'}
                                {amenity === 'tienda' && '🏪'}
                                {amenity === 'restaurante' && '🍽️'}
                                {amenity === 'estacionamiento' && '🅿️'}
                                {amenity === 'lounge' && '🛋️'}
                                {!['café', 'baños', 'WiFi', 'tienda', 'restaurante', 'estacionamiento', 'lounge'].some(a => amenity.includes(a)) && '✓'}
                                {' '}{amenity}
                            </span>
                        ))}
                    </div>
                </div>

                <div className="card-actions">
                    <button
                        className="action-btn primary"
                        onClick={onRecommend}
                    >
                        🎯 Recomendar para mí
                    </button>
                    <a
                        href={`https://maps.google.com/?daddr=${station.location.lat},${station.location.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="action-btn secondary"
                    >
                        🧭 Navegar
                    </a>
                </div>
            </div>
        </div>
    );
}
