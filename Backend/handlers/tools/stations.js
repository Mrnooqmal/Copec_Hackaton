/**
 * Copec EV Agent - Station Tools
 * Handles station search, availability, and details
 */

const stations = require('../../data/stations_geo.json');
const venues = require('../../data/venues.json');
const chargingMetrics = require('../../data/charging_metrics.json');
const { calculateHaversineDistance, isStationAlongRoute } = require('./routing');

/**
 * Find charging stations based on location and filters
 * @param {Object} input - { location, radius_km, filters, along_route, limit }
 */
const findChargingStations = async (input) => {
    const { 
        location, 
        radius_km = 10, 
        filters = {}, 
        along_route,
        limit = 5 
    } = input;

    let results = stations.stations.map(station => {
        // Calculate distance from search location
        const distance = calculateHaversineDistance(
            location.lat, location.lng,
            station.location.lat, station.location.lng
        );

        // Get availability info
        const availableChargers = station.chargers.filter(c => c.status === 'available');
        const fastChargers = station.chargers.filter(c => c.type === 'fast');
        const fastAvailable = fastChargers.filter(c => c.status === 'available');

        // Get venue info if available
        const venueInfo = venues.venues[station.id];
        const hasStreetBurger = venueInfo?.services?.street_burger?.available || false;
        const hasProntoCopec = venueInfo?.services?.pronto_copec?.available || false;
        const hasWifi = venueInfo?.services?.wifi?.available || false;
        const hasLounge = venueInfo?.services?.lounge?.available || false;

        // Get queue info
        const queueInfo = chargingMetrics.queue_density?.[station.id];

        return {
            station_id: station.id,
            name: station.name,
            address: station.address,
            location: station.location,
            distance_km: Math.round(distance * 10) / 10,
            availability: {
                total_chargers: station.chargers.length,
                available: availableChargers.length,
                fast_total: fastChargers.length,
                fast_available: fastAvailable.length,
                has_availability: availableChargers.length > 0
            },
            services: {
                has_food: hasStreetBurger || hasProntoCopec,
                has_street_burger: hasStreetBurger,
                has_pronto_copec: hasProntoCopec,
                has_wifi: hasWifi,
                has_lounge: hasLounge,
                amenities: station.usage_factors.nearby_amenities
            },
            wait_time: {
                estimated_minutes: queueInfo?.avg_wait_minutes || station.usage_factors.avg_wait_time,
                queue_length: queueInfo?.current_queue || 0,
                trend: queueInfo?.trend || 'stable'
            },
            rating: venueInfo?.ratings?.overall || 4.0,
            venue_type: venueInfo?.venue_type || 'copec_standard'
        };
    });

    // Filter by radius
    results = results.filter(s => s.distance_km <= radius_km);

    // Apply filters
    if (filters.only_available) {
        results = results.filter(s => s.availability.has_availability);
    }

    if (filters.charger_type === 'fast') {
        results = results.filter(s => s.availability.fast_available > 0);
    }

    if (filters.has_food) {
        results = results.filter(s => s.services.has_food);
    }

    if (filters.has_wifi) {
        results = results.filter(s => s.services.has_wifi);
    }

    if (filters.min_chargers_available) {
        results = results.filter(s => s.availability.available >= filters.min_chargers_available);
    }

    // If searching along a route, add route relevance
    if (along_route && along_route.origin && along_route.destination) {
        const maxDetour = along_route.max_detour_percent || 30;
        
        results = results.map(station => {
            const routeInfo = isStationAlongRoute(
                along_route.origin,
                along_route.destination,
                station.location,
                maxDetour
            );
            return {
                ...station,
                route_info: routeInfo
            };
        }).filter(s => s.route_info.isOnRoute);

        // Sort by distance from origin for route-based search
        results.sort((a, b) => a.route_info.distanceFromOrigin - b.route_info.distanceFromOrigin);
    } else {
        // Sort by distance for location-based search
        results.sort((a, b) => a.distance_km - b.distance_km);
    }

    // Limit results
    results = results.slice(0, limit);

    return {
        count: results.length,
        search_location: location,
        radius_km,
        filters_applied: filters,
        stations: results,
        searched_at: new Date().toISOString()
    };
};

/**
 * Check real-time availability of a specific station
 * @param {Object} input - { station_id }
 */
const checkStationAvailability = async (input) => {
    const { station_id } = input;

    const station = stations.stations.find(s => s.id === station_id);
    
    if (!station) {
        return {
            error: `Estación ${station_id} no encontrada`,
            available_stations: stations.stations.slice(0, 5).map(s => ({ id: s.id, name: s.name }))
        };
    }

    const queueInfo = chargingMetrics.queue_density?.[station_id];
    const venueInfo = venues.venues[station_id];

    // Group chargers by type and status
    const chargersByType = {
        fast: { total: 0, available: 0, occupied: 0, maintenance: 0 },
        slow: { total: 0, available: 0, occupied: 0, maintenance: 0 }
    };

    station.chargers.forEach(charger => {
        const type = charger.type;
        chargersByType[type].total++;
        chargersByType[type][charger.status]++;
    });

    // Calculate wait time based on queue and charger availability
    const totalAvailable = chargersByType.fast.available + chargersByType.slow.available;
    const currentQueue = queueInfo?.current_queue || 0;
    
    let estimatedWaitMinutes = 0;
    if (totalAvailable === 0 && currentQueue > 0) {
        // Average charging session is ~30 min for fast, ~60 for slow
        const avgSessionTime = chargersByType.fast.total > 0 ? 25 : 45;
        estimatedWaitMinutes = Math.round(currentQueue * avgSessionTime / station.chargers.length);
    }

    return {
        station_id,
        station_name: station.name,
        address: station.address,
        last_updated: new Date().toISOString(),
        summary: {
            total_chargers: station.chargers.length,
            total_available: totalAvailable,
            is_available: totalAvailable > 0,
            queue_length: currentQueue
        },
        chargers: {
            fast: chargersByType.fast,
            slow: chargersByType.slow
        },
        detailed_chargers: station.chargers.map(c => ({
            id: c.id,
            type: c.type,
            power_kw: c.power,
            connector: c.connector,
            status: c.status,
            status_label: getStatusLabel(c.status)
        })),
        wait_time: {
            estimated_minutes: estimatedWaitMinutes,
            queue_length: currentQueue,
            trend: queueInfo?.trend || 'stable',
            recommendation: getWaitRecommendation(estimatedWaitMinutes, totalAvailable)
        },
        peak_hours: station.usage_factors.peak_hours,
        is_peak_now: isPeakHourNow(station.usage_factors.peak_hours)
    };
};

/**
 * Get detailed information about a station
 * @param {Object} input - { station_id }
 */
const getStationDetails = async (input) => {
    const { station_id } = input;

    const station = stations.stations.find(s => s.id === station_id);
    
    if (!station) {
        return {
            error: `Estación ${station_id} no encontrada`
        };
    }

    const venueInfo = venues.venues[station_id];
    const queueInfo = chargingMetrics.queue_density?.[station_id];

    // Build comprehensive station details
    const details = {
        station_id: station.id,
        name: station.name,
        address: station.address,
        location: station.location,
        venue_type: venueInfo?.venue_type || 'copec_standard',
        
        // Charger information
        chargers: {
            total: station.chargers.length,
            types: {
                fast: station.chargers.filter(c => c.type === 'fast').length,
                slow: station.chargers.filter(c => c.type === 'slow').length
            },
            connectors: [...new Set(station.chargers.map(c => c.connector))],
            max_power_kw: Math.max(...station.chargers.map(c => c.power))
        },

        // Services
        services: {
            pronto_copec: venueInfo?.services?.pronto_copec || { available: true },
            street_burger: venueInfo?.services?.street_burger || { available: false },
            restrooms: venueInfo?.services?.restrooms || { available: true },
            wifi: venueInfo?.services?.wifi || { available: true },
            lounge: venueInfo?.services?.lounge || { available: false },
            parking: venueInfo?.services?.parking || { available: true }
        },

        // Amenities
        amenities: station.usage_factors.nearby_amenities,

        // Usage patterns
        usage: {
            peak_hours: station.usage_factors.peak_hours,
            avg_wait_time_minutes: station.usage_factors.avg_wait_time,
            current_queue: queueInfo?.current_queue || 0,
            trend: queueInfo?.trend || 'stable'
        },

        // Ratings
        ratings: venueInfo?.ratings || {
            overall: 4.0,
            cleanliness: 4.0,
            service: 4.0,
            speed: 4.0
        },

        // Contact
        contact: venueInfo?.contact || {
            phone: '+56 2 2200 0000'
        },

        // Google Maps link
        maps_url: `https://maps.google.com/?daddr=${station.location.lat},${station.location.lng}`
    };

    return details;
};

// Helper functions
const getStatusLabel = (status) => {
    const labels = {
        available: 'Disponible',
        occupied: 'En uso',
        maintenance: 'En mantenimiento'
    };
    return labels[status] || status;
};

const getWaitRecommendation = (waitMinutes, available) => {
    if (available > 0) {
        return 'Hay cargadores disponibles, puedes llegar ahora.';
    }
    if (waitMinutes <= 10) {
        return 'Espera corta, vale la pena esperar.';
    }
    if (waitMinutes <= 20) {
        return 'Espera moderada. Considera otras estaciones cercanas.';
    }
    return 'Espera larga. Te recomendamos buscar otra estación.';
};

const isPeakHourNow = (peakHours) => {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    return peakHours.some(range => {
        const [start, end] = range.split('-');
        return currentTime >= start && currentTime <= end;
    });
};

module.exports = {
    findChargingStations,
    checkStationAvailability,
    getStationDetails
};
