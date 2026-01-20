/**
 * Copec EV Agent - Routing Tools
 * Handles route calculations, distances, and ETAs
 */

/**
 * Haversine formula to calculate distance between two points
 */
const calculateHaversineDistance = (lat1, lng1, lat2, lng2) => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

/**
 * Get traffic multiplier based on time of day
 * Peak hours have higher multipliers
 */
const getTrafficMultiplier = (hour) => {
    // Peak morning: 7-9, Peak evening: 17-20
    if (hour >= 7 && hour <= 9) return 1.4;
    if (hour >= 17 && hour <= 20) return 1.5;
    if (hour >= 10 && hour <= 16) return 1.2;
    if (hour >= 21 && hour <= 23) return 1.1;
    return 1.0; // Night hours
};

/**
 * Calculate route between two points
 * @param {Object} input - { origin, destination, current_battery_percent, vehicle_range_km }
 */
const calculateRoute = async (input) => {
    const { origin, destination, current_battery_percent, vehicle_range_km } = input;

    // Calculate straight-line distance
    const straightLineDistance = calculateHaversineDistance(
        origin.lat, origin.lng,
        destination.lat, destination.lng
    );

    // Estimate actual road distance (typically 1.3x straight line in urban areas)
    const roadDistanceMultiplier = straightLineDistance > 50 ? 1.2 : 1.35;
    const estimatedRoadDistance = Math.round(straightLineDistance * roadDistanceMultiplier * 10) / 10;

    // Calculate time based on average speed
    const avgSpeedKmh = estimatedRoadDistance > 100 ? 80 : 45; // Highway vs city
    const baseTimeMinutes = Math.round((estimatedRoadDistance / avgSpeedKmh) * 60);

    // Apply traffic multiplier
    const currentHour = new Date().getHours();
    const trafficMultiplier = getTrafficMultiplier(currentHour);
    const estimatedTimeMinutes = Math.round(baseTimeMinutes * trafficMultiplier);

    // Calculate battery analysis if provided
    let batteryAnalysis = null;
    if (current_battery_percent !== undefined && vehicle_range_km) {
        const currentRange = (current_battery_percent / 100) * vehicle_range_km;
        const batteryNeeded = (estimatedRoadDistance / vehicle_range_km) * 100;
        const batteryAtArrival = current_battery_percent - batteryNeeded;
        const canComplete = batteryAtArrival >= 10; // 10% safety margin

        batteryAnalysis = {
            current_range_km: Math.round(currentRange),
            battery_needed_percent: Math.round(batteryNeeded),
            estimated_battery_at_arrival: Math.round(batteryAtArrival),
            can_complete_trip: canComplete,
            needs_charging: !canComplete,
            safety_margin_percent: 10
        };

        if (!canComplete) {
            // Calculate where they need to charge
            const maxDistanceBeforeCharge = currentRange * 0.8; // Charge at 20% remaining
            batteryAnalysis.recommended_charge_within_km = Math.round(maxDistanceBeforeCharge);
            batteryAnalysis.recommendation = `Necesitas cargar antes de ${Math.round(maxDistanceBeforeCharge)} km para completar el viaje de forma segura.`;
        }
    }

    return {
        origin: {
            lat: origin.lat,
            lng: origin.lng,
            name: origin.name || 'Origen'
        },
        destination: {
            lat: destination.lat,
            lng: destination.lng,
            name: destination.name || 'Destino'
        },
        distance: {
            straight_line_km: Math.round(straightLineDistance * 10) / 10,
            estimated_road_km: estimatedRoadDistance,
            unit: 'km'
        },
        time: {
            estimated_minutes: estimatedTimeMinutes,
            base_minutes: baseTimeMinutes,
            traffic_multiplier: trafficMultiplier,
            traffic_condition: trafficMultiplier > 1.3 ? 'heavy' : trafficMultiplier > 1.1 ? 'moderate' : 'light',
            formatted: formatDuration(estimatedTimeMinutes)
        },
        battery_analysis: batteryAnalysis,
        route_type: estimatedRoadDistance > 100 ? 'highway' : 'urban',
        calculated_at: new Date().toISOString()
    };
};

/**
 * Calculate ETA from one point to another
 * @param {Object} input - { origin, destination, departure_time }
 */
const calculateETA = async (input) => {
    const { origin, destination, departure_time } = input;

    // Get the route calculation
    const route = await calculateRoute({ origin, destination });

    // Parse departure time or use now
    let departureHour = new Date().getHours();
    let departureMinutes = new Date().getMinutes();

    if (departure_time) {
        const [h, m] = departure_time.split(':').map(Number);
        departureHour = h;
        departureMinutes = m;
    }

    // Calculate arrival time
    const totalMinutes = departureHour * 60 + departureMinutes + route.time.estimated_minutes;
    const arrivalHour = Math.floor(totalMinutes / 60) % 24;
    const arrivalMinute = totalMinutes % 60;

    const formatTime = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

    return {
        departure_time: formatTime(departureHour, departureMinutes),
        arrival_time: formatTime(arrivalHour, arrivalMinute),
        travel_duration_minutes: route.time.estimated_minutes,
        travel_duration_formatted: route.time.formatted,
        distance_km: route.distance.estimated_road_km,
        traffic_condition: route.time.traffic_condition,
        note: route.time.traffic_condition === 'heavy' 
            ? 'Considera salir antes o después de la hora pico para evitar tráfico.'
            : null
    };
};

/**
 * Format duration in minutes to human-readable string
 */
const formatDuration = (minutes) => {
    if (minutes < 60) {
        return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (mins === 0) {
        return `${hours} hora${hours > 1 ? 's' : ''}`;
    }
    return `${hours} hora${hours > 1 ? 's' : ''} ${mins} min`;
};

/**
 * Calculate if a station is along a route (with acceptable detour)
 */
const isStationAlongRoute = (origin, destination, stationLocation, maxDetourPercent = 30) => {
    const directDistance = calculateHaversineDistance(
        origin.lat, origin.lng,
        destination.lat, destination.lng
    );

    const distanceViaStation = 
        calculateHaversineDistance(origin.lat, origin.lng, stationLocation.lat, stationLocation.lng) +
        calculateHaversineDistance(stationLocation.lat, stationLocation.lng, destination.lat, destination.lng);

    const detour = distanceViaStation - directDistance;
    const detourPercent = (detour / directDistance) * 100;

    return {
        isOnRoute: detourPercent <= maxDetourPercent,
        detourKm: Math.round(detour * 10) / 10,
        detourPercent: Math.round(detourPercent),
        distanceFromOrigin: Math.round(
            calculateHaversineDistance(origin.lat, origin.lng, stationLocation.lat, stationLocation.lng) * 10
        ) / 10
    };
};

module.exports = {
    calculateRoute,
    calculateETA,
    calculateHaversineDistance,
    isStationAlongRoute,
    formatDuration,
    getTrafficMultiplier
};
