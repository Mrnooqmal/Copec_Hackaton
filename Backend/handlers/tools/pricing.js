/**
 * Copec EV Agent - Pricing Tools
 * Handles charging cost calculations and trip cost estimates
 */

const stations = require('../../data/stations_geo.json');
const { calculateRoute, calculateHaversineDistance, isStationAlongRoute } = require('./routing');

// Pricing configuration (from stations metadata)
const PRICING = {
    fast_charging_per_kwh: stations.metadata?.pricing?.fast_charging_per_kwh || 250,
    slow_charging_per_kwh: stations.metadata?.pricing?.slow_charging_per_kwh || 180,
    currency: 'CLP'
};

// User type discounts
const USER_DISCOUNTS = {
    individual: 0,
    premium: 0.10,      // 10% discount
    fleet: 0.15,        // 15% discount
    business: 0.20      // 20% discount
};

// Charging speeds (kW)
const CHARGER_POWER = {
    fast: 150,
    slow: 50
};

/**
 * Estimate charging cost for a single session
 * @param {Object} input - { current_battery_percent, target_battery_percent, battery_capacity_kwh, charger_type, user_type }
 */
const estimateChargingCost = async (input) => {
    const {
        current_battery_percent,
        target_battery_percent = 80,
        battery_capacity_kwh = 60,
        charger_type = 'fast',
        user_type = 'individual'
    } = input;

    // Validate inputs
    if (current_battery_percent < 0 || current_battery_percent > 100) {
        return { error: 'current_battery_percent debe estar entre 0 y 100' };
    }
    if (target_battery_percent <= current_battery_percent) {
        return { error: 'target_battery_percent debe ser mayor que current_battery_percent' };
    }

    // Calculate energy needed
    const batteryToCharge = target_battery_percent - current_battery_percent;
    const energyNeededKwh = (batteryToCharge / 100) * battery_capacity_kwh;

    // Get price per kWh based on charger type
    const pricePerKwh = charger_type === 'fast' 
        ? PRICING.fast_charging_per_kwh 
        : PRICING.slow_charging_per_kwh;

    // Calculate base cost
    const baseCost = energyNeededKwh * pricePerKwh;

    // Apply user discount
    const discount = USER_DISCOUNTS[user_type] || 0;
    const discountAmount = baseCost * discount;
    const finalCost = baseCost - discountAmount;

    // Calculate charging time
    const chargerPower = CHARGER_POWER[charger_type];
    const chargingTimeMinutes = Math.round((energyNeededKwh / chargerPower) * 60);

    // Calculate Copec points earned (1 point per 100 CLP)
    const pointsEarned = Math.floor(finalCost / 100);

    return {
        charging_session: {
            from_percent: current_battery_percent,
            to_percent: target_battery_percent,
            energy_kwh: Math.round(energyNeededKwh * 10) / 10,
            charger_type,
            charger_power_kw: chargerPower
        },
        time: {
            charging_minutes: chargingTimeMinutes,
            formatted: formatDuration(chargingTimeMinutes),
            note: charger_type === 'fast' 
                ? 'Carga rápida DC - ideal para paradas cortas'
                : 'Carga lenta AC - ideal para cargas prolongadas'
        },
        cost: {
            price_per_kwh: pricePerKwh,
            base_cost_clp: Math.round(baseCost),
            discount_percent: discount * 100,
            discount_amount_clp: Math.round(discountAmount),
            final_cost_clp: Math.round(finalCost),
            formatted: formatCurrency(finalCost)
        },
        user_benefits: {
            user_type,
            discount_applied: discount > 0,
            copec_points_earned: pointsEarned
        },
        comparison: {
            fast_cost: Math.round((energyNeededKwh * PRICING.fast_charging_per_kwh) * (1 - discount)),
            slow_cost: Math.round((energyNeededKwh * PRICING.slow_charging_per_kwh) * (1 - discount)),
            savings_with_slow: Math.round((energyNeededKwh * (PRICING.fast_charging_per_kwh - PRICING.slow_charging_per_kwh)) * (1 - discount)),
            recommendation: getChargingRecommendation(chargingTimeMinutes, charger_type)
        }
    };
};

/**
 * Calculate total trip cost including all charging stops
 * @param {Object} input - { origin, destination, current_battery_percent, vehicle_range_km, battery_capacity_kwh, user_type }
 */
const calculateTripCost = async (input) => {
    const {
        origin,
        destination,
        current_battery_percent = 50,
        vehicle_range_km = 400,
        battery_capacity_kwh = 60,
        user_type = 'individual'
    } = input;

    // Calculate route
    const route = await calculateRoute({
        origin,
        destination,
        current_battery_percent,
        vehicle_range_km
    });

    const totalDistanceKm = route.distance.estimated_road_km;
    
    // Calculate battery consumption
    const batteryPerKm = 100 / vehicle_range_km;
    const batteryNeeded = totalDistanceKm * batteryPerKm;
    const batteryAtArrival = current_battery_percent - batteryNeeded;

    // Determine if charging is needed
    const needsCharging = batteryAtArrival < 15; // Minimum 15% at arrival

    let chargingStops = [];
    let totalChargingCost = 0;
    let totalChargingTime = 0;

    if (needsCharging) {
        // Find stations along the route
        const stationsOnRoute = stations.stations
            .map(station => {
                const routeInfo = isStationAlongRoute(origin, destination, station.location, 25);
                return { ...station, routeInfo };
            })
            .filter(s => s.routeInfo.isOnRoute)
            .sort((a, b) => a.routeInfo.distanceFromOrigin - b.routeInfo.distanceFromOrigin);

        // Calculate optimal charging stops
        let currentBattery = current_battery_percent;
        let currentPosition = origin;

        for (const station of stationsOnRoute) {
            const distanceToStation = station.routeInfo.distanceFromOrigin;
            const batteryToStation = distanceToStation * batteryPerKm;
            const batteryAtStation = currentBattery - batteryToStation;

            // Need to charge if battery would be below 20% at station
            if (batteryAtStation < 20 || currentBattery === current_battery_percent) {
                // Calculate how much to charge
                const remainingDistance = totalDistanceKm - distanceToStation;
                const batteryForRemaining = remainingDistance * batteryPerKm;
                const targetBattery = Math.min(80, batteryForRemaining + 20); // Charge to 80% or enough for remaining

                const hasFast = station.chargers.some(c => c.type === 'fast' && c.status === 'available');
                const chargerType = hasFast ? 'fast' : 'slow';

                const chargeEstimate = await estimateChargingCost({
                    current_battery_percent: Math.max(batteryAtStation, 10),
                    target_battery_percent: targetBattery,
                    battery_capacity_kwh,
                    charger_type: chargerType,
                    user_type
                });

                if (!chargeEstimate.error) {
                    chargingStops.push({
                        station_id: station.id,
                        station_name: station.name,
                        address: station.address,
                        location: station.location,
                        distance_from_origin_km: distanceToStation,
                        detour_km: station.routeInfo.detourKm,
                        charging: {
                            from_percent: Math.round(batteryAtStation),
                            to_percent: targetBattery,
                            charger_type: chargerType,
                            time_minutes: chargeEstimate.time.charging_minutes,
                            cost_clp: chargeEstimate.cost.final_cost_clp
                        },
                        amenities: station.usage_factors.nearby_amenities
                    });

                    totalChargingCost += chargeEstimate.cost.final_cost_clp;
                    totalChargingTime += chargeEstimate.time.charging_minutes;
                    currentBattery = targetBattery;
                    currentPosition = station.location;

                    // Check if we can now reach destination
                    const remainingBattery = targetBattery - (remainingDistance * batteryPerKm);
                    if (remainingBattery >= 15) {
                        break; // We can make it now
                    }
                }
            }
        }
    }

    // Calculate total trip time
    const drivingTimeMinutes = route.time.estimated_minutes;
    const totalTimeMinutes = drivingTimeMinutes + totalChargingTime;

    return {
        trip: {
            origin: { ...origin, name: origin.name || 'Origen' },
            destination: { ...destination, name: destination.name || 'Destino' },
            distance_km: totalDistanceKm
        },
        battery: {
            start_percent: current_battery_percent,
            needed_percent: Math.round(batteryNeeded),
            end_percent: Math.round(needsCharging ? 15 : batteryAtArrival),
            needs_charging: needsCharging
        },
        time: {
            driving_minutes: drivingTimeMinutes,
            charging_minutes: totalChargingTime,
            total_minutes: totalTimeMinutes,
            formatted: formatDuration(totalTimeMinutes)
        },
        cost: {
            charging_cost_clp: totalChargingCost,
            formatted: formatCurrency(totalChargingCost),
            user_type,
            discount_applied: USER_DISCOUNTS[user_type] > 0
        },
        charging_stops: chargingStops,
        stops_count: chargingStops.length,
        summary: generateTripSummary(route, chargingStops, totalChargingCost, needsCharging)
    };
};

// Helper functions
const formatDuration = (minutes) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins === 0 ? `${hours}h` : `${hours}h ${mins}min`;
};

const formatCurrency = (amount) => {
    return `$${Math.round(amount).toLocaleString('es-CL')} CLP`;
};

const getChargingRecommendation = (timeMinutes, chargerType) => {
    if (chargerType === 'fast' && timeMinutes <= 30) {
        return 'Tiempo ideal para una parada rápida. Aprovecha para tomar un café.';
    }
    if (chargerType === 'fast' && timeMinutes <= 45) {
        return 'Buen momento para almorzar o desayunar en Street Burger.';
    }
    if (chargerType === 'slow') {
        return 'Carga lenta recomendada para estadías largas o mientras trabajas.';
    }
    return 'Considera dividir la carga en múltiples paradas para viajes largos.';
};

const generateTripSummary = (route, stops, cost, needsCharging) => {
    if (!needsCharging) {
        return `Puedes completar el viaje de ${route.distance.estimated_road_km} km sin necesidad de cargar. Llegarás con suficiente batería.`;
    }
    if (stops.length === 1) {
        return `Viaje de ${route.distance.estimated_road_km} km con 1 parada de carga en ${stops[0].station_name}. Costo total: ${formatCurrency(cost)}.`;
    }
    return `Viaje de ${route.distance.estimated_road_km} km con ${stops.length} paradas de carga. Costo total: ${formatCurrency(cost)}.`;
};

module.exports = {
    estimateChargingCost,
    calculateTripCost,
    PRICING,
    USER_DISCOUNTS
};
