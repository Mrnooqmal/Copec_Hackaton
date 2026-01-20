/**
 * StationCard Component - Copec EV Assistant
 * Detailed station information card
 */

import { Icon } from './Icon';

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

    return (
        <div className="station-card-overlay" onClick={onClose}>
            <div className="station-card" onClick={(e) => e.stopPropagation()}>
                <button className="close-btn" onClick={onClose} aria-label="Cerrar">
                    <Icon name="close" size={16} />
                </button>

                <div className="card-header">
                    <h2>{station.name}</h2>
                    <p className="address">{station.address}</p>
                    {station.distance !== undefined && (
                        <p className="distance">
                            <Icon name="mapPin" size={14} /> {station.distance} km {station.eta_minutes && `• ${station.eta_minutes} min`}
                        </p>
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
                                    <Icon name="plug" size={18} />
                                </div>
                                <div className="charger-info">
                                    <span className="charger-type">
                                        <Icon name={charger.type === 'fast' ? 'bolt' : 'battery'} size={14} /> {charger.type === 'fast' ? 'Rápido' : 'Lento'}
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
                            <span className="usage-icon"><Icon name="clock" size={16} /></span>
                            <span className="usage-label">Tiempo promedio de espera</span>
                            <span className="usage-value">{station.usage_factors.avg_wait_time} min</span>
                        </div>
                        <div className="usage-item">
                            <span className="usage-icon"><Icon name="gauge" size={16} /></span>
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
                                {renderAmenityIcon(amenity)} {amenity}
                            </span>
                        ))}
                    </div>
                </div>

                <div className="card-actions">
                    <button
                        className="action-btn primary"
                        onClick={onRecommend}
                    >
                        <Icon name="target" size={16} /> Recomendar para mí
                    </button>
                    <a
                        href={`https://maps.google.com/?daddr=${station.location.lat},${station.location.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="action-btn secondary"
                    >
                        <Icon name="compass" size={16} /> Navegar
                    </a>
                </div>
            </div>
        </div>
    );
}

function renderAmenityIcon(amenity: string) {
    const normalized = amenity.toLowerCase();
    if (normalized.includes('caf') || normalized.includes('coffee')) return <Icon name="coffee" size={14} />;
    if (normalized.includes('baño') || normalized.includes('restroom') || normalized.includes('wc')) return <Icon name="restroom" size={14} />;
    if (normalized.includes('wifi')) return <Icon name="wifi" size={14} />;
    if (normalized.includes('tienda') || normalized.includes('shop')) return <Icon name="store" size={14} />;
    if (normalized.includes('restaur')) return <Icon name="restaurant" size={14} />;
    if (normalized.includes('estacionamiento') || normalized.includes('parking')) return <Icon name="parking" size={14} />;
    if (normalized.includes('lounge')) return <Icon name="lounge" size={14} />;
    return <Icon name="spark" size={14} />;
}
