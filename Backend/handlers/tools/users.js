/**
 * Copec EV Agent - User Tools
 * Handles user profiles, vehicles, and preferences
 */

const usersVehicles = require('../../data/users_vehicles.json');

/**
 * Get user profile including account type, history, and points
 * @param {Object} input - { user_id }
 */
const getUserProfile = async (input) => {
    const { user_id } = input;

    const user = usersVehicles.users[user_id];

    if (!user) {
        // Return demo profile for unknown users
        return {
            user_id,
            is_demo_user: true,
            profile: {
                name: 'Usuario Demo',
                profile_type: 'individual',
                membership_tier: 'bronze',
                copec_points: 0
            },
            charging_history: {
                total_sessions: 0,
                total_kwh: 0,
                total_spent_clp: 0,
                favorite_stations: [],
                avg_monthly_sessions: 0
            },
            benefits: getBenefitsByTier('bronze'),
            note: 'Usuario no registrado. Datos de demostración.'
        };
    }

    return {
        user_id: user.user_id,
        is_demo_user: false,
        profile: {
            name: user.name,
            email: user.email,
            profile_type: user.profile_type,
            membership_tier: user.membership_tier,
            copec_points: user.copec_points
        },
        charging_history: {
            total_sessions: user.charging_history.total_sessions,
            total_kwh: user.charging_history.total_kwh,
            total_spent_clp: user.charging_history.total_spent_clp,
            total_spent_formatted: formatCurrency(user.charging_history.total_spent_clp),
            favorite_stations: user.charging_history.favorite_stations,
            avg_monthly_sessions: user.charging_history.avg_monthly_sessions
        },
        benefits: getBenefitsByTier(user.membership_tier),
        discounts: getDiscountsByType(user.profile_type),
        recommendations: generateUserRecommendations(user)
    };
};

/**
 * Get user's vehicle information
 * @param {Object} input - { user_id }
 */
const getUserVehicle = async (input) => {
    const { user_id } = input;

    // Find vehicle by owner_id
    const vehicle = Object.values(usersVehicles.vehicles).find(v => v.owner_id === user_id);

    if (!vehicle) {
        // Return demo vehicle
        return {
            user_id,
            is_demo_vehicle: true,
            vehicle: {
                brand: 'Tesla',
                model: 'Model 3 Standard Range',
                year: 2024,
                battery_capacity_kwh: 60,
                current_battery_percent: 50,
                range_km: 400,
                connector_types: ['CCS2', 'Type2'],
                max_charge_rate_kw: 150
            },
            charging_recommendations: getChargingRecommendationsForVehicle(60, 150),
            note: 'Vehículo de demostración. Registra tu vehículo para datos personalizados.'
        };
    }

    return {
        user_id,
        is_demo_vehicle: false,
        vehicle: {
            vehicle_id: vehicle.vehicle_id,
            brand: vehicle.brand,
            model: vehicle.model,
            year: vehicle.year,
            battery_capacity_kwh: vehicle.battery_capacity_kwh,
            current_battery_percent: vehicle.current_battery_percent,
            range_km: vehicle.range_km,
            connector_types: vehicle.connector_types,
            max_charge_rate_kw: vehicle.max_charge_rate_kw,
            license_plate: vehicle.license_plate
        },
        efficiency: vehicle.efficiency_kwh_per_km 
            ? `${vehicle.efficiency_kwh_per_km} kWh/km`
            : calculateEfficiency(vehicle.battery_capacity_kwh, vehicle.range_km),
        charging_recommendations: getChargingRecommendationsForVehicle(
            vehicle.battery_capacity_kwh, 
            vehicle.max_charge_rate_kw
        ),
        compatible_chargers: getCompatibleChargers(vehicle.connector_types)
    };
};

/**
 * Get user preferences for charging
 * @param {Object} input - { user_id }
 */
const getUserPreferences = async (input) => {
    const { user_id } = input;

    const user = usersVehicles.users[user_id];

    if (!user) {
        // Return default preferences
        return {
            user_id,
            is_default: true,
            preferences: {
                charger_type: 'any',
                max_wait_time_minutes: 15,
                preferred_amenities: [],
                price_sensitivity: 'medium',
                eco_mode: false
            },
            notifications: {
                charging_complete: true,
                queue_updates: false,
                promotions: true
            },
            note: 'Preferencias por defecto. Registra tu cuenta para personalizarlas.'
        };
    }

    return {
        user_id,
        is_default: false,
        preferences: {
            charger_type: user.preferences.charger_type,
            max_wait_time_minutes: user.preferences.max_wait_time_minutes,
            preferred_amenities: user.preferences.preferred_amenities,
            price_sensitivity: user.preferences.price_sensitivity,
            eco_mode: user.preferences.eco_mode
        },
        notifications: user.preferences.notifications,
        priority_settings: getPrioritySettings(user.preferences),
        personalized_tips: getPersonalizedTips(user)
    };
};

// Helper functions

const formatCurrency = (amount) => {
    return `$${Math.round(amount).toLocaleString('es-CL')} CLP`;
};

const getBenefitsByTier = (tier) => {
    const benefits = {
        bronze: {
            tier: 'Bronze',
            discount_percent: 0,
            priority_queue: false,
            free_wifi: true,
            lounge_access: false,
            points_multiplier: 1
        },
        silver: {
            tier: 'Silver',
            discount_percent: 5,
            priority_queue: false,
            free_wifi: true,
            lounge_access: false,
            points_multiplier: 1.2
        },
        gold: {
            tier: 'Gold',
            discount_percent: 10,
            priority_queue: true,
            free_wifi: true,
            lounge_access: true,
            points_multiplier: 1.5
        },
        platinum: {
            tier: 'Platinum',
            discount_percent: 15,
            priority_queue: true,
            free_wifi: true,
            lounge_access: true,
            points_multiplier: 2,
            dedicated_support: true
        }
    };
    return benefits[tier] || benefits.bronze;
};

const getDiscountsByType = (profileType) => {
    const discounts = {
        individual: { base_discount: 0, description: 'Tarifa estándar' },
        premium: { base_discount: 10, description: '10% descuento en toda carga' },
        fleet: { base_discount: 15, description: '15% descuento flotas + facturación empresa' },
        business: { base_discount: 20, description: '20% descuento empresas + reportes mensuales' }
    };
    return discounts[profileType] || discounts.individual;
};

const generateUserRecommendations = (user) => {
    const recommendations = [];

    // Based on usage patterns
    if (user.charging_history.avg_monthly_sessions > 10 && user.profile_type === 'individual') {
        recommendations.push({
            type: 'upgrade',
            message: 'Con tu frecuencia de carga, considera actualizar a Premium para obtener 10% de descuento.',
            potential_savings: Math.round(user.charging_history.total_spent_clp * 0.1 / 12)
        });
    }

    // Based on favorite stations
    if (user.charging_history.favorite_stations.length > 0) {
        recommendations.push({
            type: 'station',
            message: `Tu estación favorita es ${user.charging_history.favorite_stations[0]}. ¡Revisa las promociones especiales!`
        });
    }

    // Points redemption
    if (user.copec_points > 5000) {
        recommendations.push({
            type: 'points',
            message: `Tienes ${user.copec_points} puntos Copec. Puedes canjearlos por descuentos en carga o productos.`
        });
    }

    return recommendations;
};

const getChargingRecommendationsForVehicle = (batteryCapacity, maxChargeRate) => {
    return {
        optimal_charge_range: '20% - 80%',
        reason: 'Cargar entre 20% y 80% maximiza la vida útil de la batería',
        fast_charge_time_to_80: `${Math.round((batteryCapacity * 0.6) / maxChargeRate * 60)} minutos`,
        slow_charge_time_to_80: `${Math.round((batteryCapacity * 0.6) / 50 * 60)} minutos`,
        tip: maxChargeRate >= 150 
            ? 'Tu vehículo soporta carga ultra-rápida. Aprovecha los cargadores de 150kW.'
            : 'Para cargas rápidas, busca cargadores de al menos 50kW.'
    };
};

const calculateEfficiency = (batteryCapacity, range) => {
    const efficiency = batteryCapacity / range;
    return `${(efficiency * 100).toFixed(1)} kWh/100km`;
};

const getCompatibleChargers = (connectorTypes) => {
    const chargerInfo = {
        CCS2: { name: 'CCS Combo 2', type: 'DC Fast', power: 'hasta 350kW' },
        Type2: { name: 'Type 2 (Mennekes)', type: 'AC', power: 'hasta 22kW' },
        CHAdeMO: { name: 'CHAdeMO', type: 'DC Fast', power: 'hasta 100kW' }
    };

    return connectorTypes.map(connector => chargerInfo[connector] || { name: connector, type: 'Unknown' });
};

const getPrioritySettings = (preferences) => {
    const priorities = [];

    if (preferences.charger_type === 'fast') {
        priorities.push('Prioridad: Cargadores rápidos');
    }
    if (preferences.max_wait_time_minutes <= 10) {
        priorities.push('Prioridad: Mínimo tiempo de espera');
    }
    if (preferences.price_sensitivity === 'high') {
        priorities.push('Prioridad: Menor costo');
    }
    if (preferences.preferred_amenities.length > 0) {
        priorities.push(`Amenities preferidos: ${preferences.preferred_amenities.join(', ')}`);
    }

    return priorities;
};

const getPersonalizedTips = (user) => {
    const tips = [];

    if (user.preferences.eco_mode) {
        tips.push('Modo eco activo: Priorizamos cargadores lentos para menor impacto ambiental.');
    }
    if (user.preferences.price_sensitivity === 'high') {
        tips.push('Consejo: Los cargadores lentos son 30% más económicos que los rápidos.');
    }
    if (user.membership_tier === 'gold' || user.membership_tier === 'platinum') {
        tips.push('Tienes acceso a lounges premium mientras cargas. ¡Disfrútalos!');
    }

    return tips;
};

module.exports = {
    getUserProfile,
    getUserVehicle,
    getUserPreferences
};
