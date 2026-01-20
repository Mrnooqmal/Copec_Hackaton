/**
 * Copec EV Data Endpoints - Lambda Handler
 * Simulated data endpoints for AI consumption
 * 
 * Endpoints:
 * - GET /api/charging/metrics
 * - GET /api/charging/queue/:stationId
 * - GET /api/venues/:stationId
 * - GET /api/user/:userId/profile
 * - GET /api/user/:userId/vehicle
 * - GET /api/context (aggregated data for AI)
 */

const chargingMetrics = require('../data/charging_metrics.json');
const venues = require('../data/venues.json');
const usersVehicles = require('../data/users_vehicles.json');
const stations = require('../data/stations_geo.json');

// Response helper
const response = (statusCode, body) => ({
    statusCode,
    headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
    },
    body: JSON.stringify(body)
});

/**
 * GET /api/charging/metrics
 * Get charging usage metrics and patterns
 */
module.exports.getChargingMetrics = async (event) => {
    try {
        const params = event.queryStringParameters || {};
        const stationId = params.stationId;

        let data = {
            charging_sessions: chargingMetrics.charging_sessions,
            real_time_power: chargingMetrics.real_time_power,
            metadata: chargingMetrics.metadata
        };

        // Filter by station if specified
        if (stationId) {
            data.charging_sessions = data.charging_sessions.filter(s => s.station_id === stationId);
            data.real_time_power = { [stationId]: data.real_time_power[stationId] };
        }

        return response(200, {
            success: true,
            ...data
        });
    } catch (error) {
        console.error('Get charging metrics error:', error);
        return response(500, { error: 'Error al obtener métricas de carga' });
    }
};

/**
 * GET /api/charging/queue/{stationId}
 * Get queue density and wait times for a station
 */
module.exports.getQueueDensity = async (event) => {
    try {
        const stationId = event.pathParameters?.stationId;

        if (!stationId) {
            // Return all queue data
            return response(200, {
                success: true,
                queues: chargingMetrics.queue_density,
                metadata: chargingMetrics.metadata
            });
        }

        const queueData = chargingMetrics.queue_density[stationId];

        if (!queueData) {
            return response(404, { error: `Estación ${stationId} no encontrada` });
        }

        return response(200, {
            success: true,
            station_id: stationId,
            queue: queueData,
            last_sync: chargingMetrics.metadata.last_sync
        });
    } catch (error) {
        console.error('Get queue density error:', error);
        return response(500, { error: 'Error al obtener densidad de cola' });
    }
};

/**
 * GET /api/venues/{stationId}
 * Get venue details (Pronto Copec, Street Burger, amenities)
 */
module.exports.getVenueDetails = async (event) => {
    try {
        const stationId = event.pathParameters?.stationId;

        if (!stationId) {
            // Return all venues
            return response(200, {
                success: true,
                venues: venues.venues,
                metadata: venues.metadata
            });
        }

        const venueData = venues.venues[stationId];

        if (!venueData) {
            // Return basic info if venue not in detailed list
            return response(200, {
                success: true,
                station_id: stationId,
                venue_type: 'copec_standard',
                services: {
                    pronto_copec: { available: true, hours: '06:00-22:00' },
                    restrooms: { available: true },
                    wifi: { available: true }
                },
                ratings: { overall: 4.0 }
            });
        }

        return response(200, {
            success: true,
            ...venueData
        });
    } catch (error) {
        console.error('Get venue details error:', error);
        return response(500, { error: 'Error al obtener detalles de sede' });
    }
};

/**
 * GET /api/user/{userId}/profile
 * Get user profile and preferences
 */
module.exports.getUserProfile = async (event) => {
    try {
        const userId = event.pathParameters?.userId;

        if (!userId) {
            return response(400, { error: 'Se requiere userId' });
        }

        const userData = usersVehicles.users[userId];

        if (!userData) {
            // Return default profile for demo
            return response(200, {
                success: true,
                user_id: userId,
                profile_type: 'standard',
                preferences: {
                    charger_type: 'any',
                    max_wait_time_minutes: 15,
                    preferred_amenities: [],
                    price_sensitivity: 'medium',
                    eco_mode: false
                },
                copec_points: 0,
                membership_tier: 'bronze',
                is_demo_user: true
            });
        }

        return response(200, {
            success: true,
            ...userData
        });
    } catch (error) {
        console.error('Get user profile error:', error);
        return response(500, { error: 'Error al obtener perfil de usuario' });
    }
};

/**
 * GET /api/user/{userId}/vehicle
 * Get user's vehicle information
 */
module.exports.getUserVehicle = async (event) => {
    try {
        const userId = event.pathParameters?.userId;

        if (!userId) {
            return response(400, { error: 'Se requiere userId' });
        }

        // Find vehicle by owner_id
        const vehicle = Object.values(usersVehicles.vehicles).find(v => v.owner_id === userId);

        if (!vehicle) {
            // Return demo vehicle
            return response(200, {
                success: true,
                user_id: userId,
                vehicle: {
                    brand: 'Generic EV',
                    model: 'Demo Model',
                    battery_capacity_kwh: 60,
                    current_battery_percent: 50,
                    connector_types: ['CCS2', 'Type2'],
                    max_charge_rate_kw: 100,
                    is_demo_vehicle: true
                }
            });
        }

        return response(200, {
            success: true,
            user_id: userId,
            vehicle
        });
    } catch (error) {
        console.error('Get user vehicle error:', error);
        return response(500, { error: 'Error al obtener información del vehículo' });
    }
};

/**
 * POST /api/context
 * Get aggregated context data for AI recommendations
 * This is the main endpoint that feeds the AI with all relevant data
 */
module.exports.getAIContext = async (event) => {
    try {
        const body = JSON.parse(event.body || '{}');
        const { userId, location, stationId } = body;

        // Aggregate all relevant data for AI
        const context = {
            timestamp: new Date().toISOString(),

            // User context
            user: null,
            vehicle: null,

            // Station context
            stations_summary: {
                total: stations.stations.length,
                available: stations.stations.filter(s =>
                    s.chargers.some(c => c.status === 'available')
                ).length
            },

            // Queue status
            queue_overview: Object.entries(chargingMetrics.queue_density).map(([id, q]) => ({
                station_id: id,
                ...q
            })),

            // High demand stations (queue > 2)
            high_demand_stations: Object.entries(chargingMetrics.queue_density)
                .filter(([, q]) => q.current_queue > 2)
                .map(([id]) => id),

            // Recommended stations (no queue, fast available)
            recommended_for_quick_charge: stations.stations
                .filter(s => {
                    const queue = chargingMetrics.queue_density[s.id];
                    const hasFast = s.chargers.some(c => c.type === 'fast' && c.status === 'available');
                    return queue?.current_queue === 0 && hasFast;
                })
                .map(s => s.id),

            // Premium venues
            premium_venues: Object.values(venues.venues)
                .filter(v => ['copec_premium', 'copec_flagship'].includes(v.venue_type))
                .map(v => v.station_id),

            // Current pricing
            pricing: stations.metadata.pricing
        };

        // Add user data if userId provided
        if (userId && usersVehicles.users[userId]) {
            context.user = usersVehicles.users[userId];
            const vehicle = Object.values(usersVehicles.vehicles).find(v => v.owner_id === userId);
            if (vehicle) {
                context.vehicle = vehicle;
            }
        }

        // Add specific station data if stationId provided
        if (stationId) {
            const station = stations.stations.find(s => s.id === stationId);
            const venue = venues.venues[stationId];
            const queue = chargingMetrics.queue_density[stationId];

            context.focused_station = {
                station,
                venue: venue || null,
                queue: queue || null
            };
        }

        return response(200, {
            success: true,
            context
        });
    } catch (error) {
        console.error('Get AI context error:', error);
        return response(500, { error: 'Error al obtener contexto para IA' });
    }
};

/**
 * GET /api/stations/all
 * Get all stations with enriched data (venues, queues)
 */
module.exports.getAllStationsEnriched = async () => {
    try {
        const enrichedStations = stations.stations.map(station => {
            const venue = venues.venues[station.id];
            const queue = chargingMetrics.queue_density[station.id];

            return {
                ...station,
                venue: venue || {
                    venue_type: 'copec_standard',
                    services: { pronto_copec: { available: true } }
                },
                queue: queue || { current_queue: 0, avg_wait_minutes: 0, trend: 'stable' }
            };
        });

        return response(200, {
            success: true,
            stations: enrichedStations,
            metadata: {
                ...stations.metadata,
                enriched: true
            }
        });
    } catch (error) {
        console.error('Get all stations enriched error:', error);
        return response(500, { error: 'Error al obtener estaciones enriquecidas' });
    }
};
