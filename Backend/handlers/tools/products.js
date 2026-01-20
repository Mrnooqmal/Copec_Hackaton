/**
 * Copec EV Agent - Product Tools
 * Handles product search, promotions, and services at Copec stations
 */

const venues = require('../../data/venues.json');
const stations = require('../../data/stations_geo.json');

// Product catalog (simulated)
const PRODUCT_CATALOG = {
    breakfast: [
        { id: 'bkf_001', name: 'Combo Desayuno Completo', description: 'Café + Croissant + Jugo', price: 4500, available_hours: '06:00-11:00' },
        { id: 'bkf_002', name: 'Café Americano', description: 'Café 100% arábica', price: 1800, available_hours: '06:00-22:00' },
        { id: 'bkf_003', name: 'Croissant Jamón Queso', description: 'Croissant relleno horneado', price: 2500, available_hours: '06:00-20:00' },
        { id: 'bkf_004', name: 'Yogurt con Granola', description: 'Yogurt natural con granola y frutas', price: 2200, available_hours: '06:00-14:00' }
    ],
    lunch: [
        { id: 'lch_001', name: 'Classic Burger', description: 'Hamburguesa clásica con papas', price: 6900, available_hours: '11:00-22:00', partner: 'Street Burger' },
        { id: 'lch_002', name: 'Veggie Burger', description: 'Hamburguesa vegetariana', price: 7500, available_hours: '11:00-22:00', partner: 'Street Burger' },
        { id: 'lch_003', name: 'Chicken Burger', description: 'Hamburguesa de pollo crispy', price: 7200, available_hours: '11:00-22:00', partner: 'Street Burger' },
        { id: 'lch_004', name: 'Combo Familiar', description: '4 burgers + 4 bebidas + papas XL', price: 24900, available_hours: '11:00-22:00', partner: 'Street Burger' }
    ],
    dinner: [
        { id: 'dnr_001', name: 'BBQ Burger', description: 'Hamburguesa con salsa BBQ y bacon', price: 8500, available_hours: '18:00-23:00', partner: 'Street Burger' },
        { id: 'dnr_002', name: 'Wrap de Pollo', description: 'Wrap con pollo y vegetales', price: 5500, available_hours: '11:00-23:00' }
    ],
    snacks: [
        { id: 'snk_001', name: 'Papas Fritas', description: 'Papas fritas crujientes', price: 2500, available_hours: '11:00-23:00', partner: 'Street Burger' },
        { id: 'snk_002', name: 'Nachos con Queso', description: 'Nachos con salsa de queso', price: 3200, available_hours: '11:00-23:00' },
        { id: 'snk_003', name: 'Galletas Surtidas', description: 'Pack de galletas', price: 1500, available_hours: '24/7' },
        { id: 'snk_004', name: 'Barra de Chocolate', description: 'Chocolate con almendras', price: 1200, available_hours: '24/7' }
    ],
    drinks: [
        { id: 'drk_001', name: 'Bebida 500ml', description: 'Coca-Cola, Sprite, Fanta', price: 1500, available_hours: '24/7' },
        { id: 'drk_002', name: 'Agua Mineral 600ml', description: 'Agua mineral sin gas', price: 1000, available_hours: '24/7' },
        { id: 'drk_003', name: 'Jugo Natural', description: 'Jugo de naranja o manzana', price: 2200, available_hours: '06:00-22:00' },
        { id: 'drk_004', name: 'Café Latte', description: 'Café con leche espumada', price: 2500, available_hours: '06:00-22:00' },
        { id: 'drk_005', name: 'Energizante', description: 'Red Bull o Monster', price: 2800, available_hours: '24/7' }
    ]
};

// Promotions catalog
const PROMOTIONS = [
    {
        id: 'promo_001',
        name: 'Café + Carga',
        description: 'Obtén 15% de descuento en café al cargar tu vehículo',
        discount_percent: 15,
        applies_to: 'drinks',
        conditions: ['Válido durante la sesión de carga'],
        valid_until: '2026-03-31',
        category: 'combo'
    },
    {
        id: 'promo_002',
        name: 'Happy Hour Carga',
        description: 'Carga con 20% de descuento entre 22:00 y 06:00',
        discount_percent: 20,
        applies_to: 'charging',
        conditions: ['Horario: 22:00 - 06:00', 'Válido en todas las estaciones'],
        valid_until: '2026-06-30',
        category: 'charging'
    },
    {
        id: 'promo_003',
        name: 'Combo Carga + Almuerzo',
        description: 'Al cargar más de 30 kWh, tu combo Street Burger tiene 25% off',
        discount_percent: 25,
        applies_to: 'food',
        conditions: ['Carga mínima: 30 kWh', 'Válido en estaciones con Street Burger'],
        valid_until: '2026-02-28',
        category: 'combo',
        partner: 'Street Burger'
    },
    {
        id: 'promo_004',
        name: 'Puntos Dobles',
        description: 'Gana el doble de puntos Copec los martes y jueves',
        points_multiplier: 2,
        applies_to: 'all',
        conditions: ['Solo martes y jueves', 'Aplica a carga y compras'],
        valid_until: '2026-12-31',
        category: 'charging',
        days: ['tuesday', 'thursday']
    },
    {
        id: 'promo_005',
        name: 'Primera Carga',
        description: '50% de descuento en tu primera carga como nuevo usuario',
        discount_percent: 50,
        applies_to: 'charging',
        conditions: ['Solo nuevos usuarios', 'Una vez por cuenta'],
        valid_until: '2026-12-31',
        category: 'charging',
        user_type: 'new'
    },
    {
        id: 'promo_006',
        name: 'Desayuno Express',
        description: 'Combo desayuno a solo $2.990 antes de las 10am',
        special_price: 2990,
        original_price: 4500,
        applies_to: 'breakfast',
        conditions: ['Válido hasta las 10:00', 'Incluye café + croissant'],
        valid_until: '2026-04-30',
        category: 'food'
    }
];

/**
 * Search products available at a station
 * @param {Object} input - { station_id, category, time_of_day }
 */
const searchProducts = async (input) => {
    const { station_id, category = 'all', time_of_day } = input;

    // Get station and venue info
    const station = stations.stations.find(s => s.id === station_id);
    const venue = venues.venues[station_id];

    if (!station) {
        return {
            error: `Estación ${station_id} no encontrada`,
            suggestion: 'Usa find_charging_stations para buscar estaciones primero.'
        };
    }

    // Determine available services at this station
    const hasStreetBurger = venue?.services?.street_burger?.available || false;
    const hasProntoCopec = venue?.services?.pronto_copec?.available || true;
    const streetBurgerHours = venue?.services?.street_burger?.hours || '11:00-23:00';
    const prontoHours = venue?.services?.pronto_copec?.hours || '24/7';

    // Get current time or use provided time
    let currentHour = new Date().getHours();
    let currentMinute = new Date().getMinutes();
    
    if (time_of_day) {
        const [h, m] = time_of_day.split(':').map(Number);
        currentHour = h;
        currentMinute = m || 0;
    }
    
    const currentTime = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;

    // Filter products by category
    let products = [];
    const categories = category === 'all' 
        ? Object.keys(PRODUCT_CATALOG) 
        : [category];

    for (const cat of categories) {
        if (PRODUCT_CATALOG[cat]) {
            const categoryProducts = PRODUCT_CATALOG[cat].map(product => {
                // Check if product requires Street Burger and it's available
                if (product.partner === 'Street Burger' && !hasStreetBurger) {
                    return null;
                }

                // Check if product is available at current time
                const isAvailable = checkTimeAvailability(product.available_hours, currentTime);

                return {
                    ...product,
                    category: cat,
                    is_available: isAvailable,
                    formatted_price: formatCurrency(product.price)
                };
            }).filter(p => p !== null);

            products.push(...categoryProducts);
        }
    }

    // Sort by availability first, then by category
    products.sort((a, b) => {
        if (a.is_available !== b.is_available) {
            return a.is_available ? -1 : 1;
        }
        return 0;
    });

    // Get applicable promotions
    const applicablePromos = PROMOTIONS.filter(promo => {
        if (promo.applies_to === 'charging') return false;
        if (category !== 'all' && promo.applies_to !== category && promo.applies_to !== 'all') return false;
        if (promo.partner === 'Street Burger' && !hasStreetBurger) return false;
        return isPromotionValid(promo);
    });

    return {
        station_id,
        station_name: station.name,
        current_time: currentTime,
        services: {
            pronto_copec: { available: hasProntoCopec, hours: prontoHours },
            street_burger: { available: hasStreetBurger, hours: streetBurgerHours }
        },
        products: {
            count: products.length,
            available_count: products.filter(p => p.is_available).length,
            items: products
        },
        promotions: applicablePromos.map(p => ({
            id: p.id,
            name: p.name,
            description: p.description,
            discount: p.discount_percent ? `${p.discount_percent}%` : (p.special_price ? formatCurrency(p.special_price) : null),
            valid_until: p.valid_until
        })),
        recommendations: generateProductRecommendations(currentHour, hasStreetBurger, products)
    };
};

/**
 * Get active promotions
 * @param {Object} input - { station_id, category, user_type }
 */
const getPromotions = async (input) => {
    const { station_id, category = 'all', user_type } = input;

    let applicablePromos = PROMOTIONS.filter(promo => {
        // Filter by validity
        if (!isPromotionValid(promo)) return false;

        // Filter by category
        if (category !== 'all' && promo.category !== category && promo.applies_to !== 'all') return false;

        // Filter by user type if specified
        if (promo.user_type && user_type !== promo.user_type) return false;

        return true;
    });

    // If station specified, check for station-specific promos
    let stationSpecificPromos = [];
    if (station_id) {
        const venue = venues.venues[station_id];
        if (venue?.services?.pronto_copec?.promotions) {
            stationSpecificPromos = venue.services.pronto_copec.promotions.map(p => ({
                ...p,
                station_specific: true,
                station_id
            }));
        }
        
        // Filter out Street Burger promos if not available
        const hasStreetBurger = venue?.services?.street_burger?.available;
        if (!hasStreetBurger) {
            applicablePromos = applicablePromos.filter(p => p.partner !== 'Street Burger');
        }
    }

    // Combine and format promotions
    const allPromos = [...applicablePromos, ...stationSpecificPromos];

    return {
        total_promotions: allPromos.length,
        filter: { station_id, category, user_type },
        promotions: allPromos.map(promo => ({
            id: promo.id || `station_promo_${Math.random().toString(36).substr(2, 9)}`,
            name: promo.name,
            description: promo.description,
            category: promo.category || 'general',
            discount: promo.discount_percent 
                ? { type: 'percent', value: promo.discount_percent }
                : promo.special_price 
                    ? { type: 'special_price', value: promo.special_price, original: promo.original_price }
                    : promo.points_multiplier
                        ? { type: 'points', multiplier: promo.points_multiplier }
                        : null,
            conditions: promo.conditions || [],
            valid_until: promo.valid_until,
            partner: promo.partner,
            station_specific: promo.station_specific || false
        })),
        tips: getPromotionTips(allPromos)
    };
};

// Helper functions

const formatCurrency = (amount) => {
    return `$${Math.round(amount).toLocaleString('es-CL')}`;
};

const checkTimeAvailability = (availableHours, currentTime) => {
    if (availableHours === '24/7') return true;
    
    const [start, end] = availableHours.split('-');
    return currentTime >= start && currentTime <= end;
};

const isPromotionValid = (promo) => {
    const today = new Date();
    const validUntil = new Date(promo.valid_until);
    
    if (today > validUntil) return false;

    // Check day-specific promotions
    if (promo.days) {
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const todayName = dayNames[today.getDay()];
        if (!promo.days.includes(todayName)) return false;
    }

    return true;
};

const generateProductRecommendations = (hour, hasStreetBurger, products) => {
    const recommendations = [];

    if (hour >= 6 && hour < 10) {
        recommendations.push({
            type: 'breakfast',
            message: '☕ Es hora del desayuno. Te recomendamos el Combo Desayuno Completo.',
            product_ids: ['bkf_001', 'bkf_002']
        });
    }

    if (hour >= 12 && hour < 15 && hasStreetBurger) {
        recommendations.push({
            type: 'lunch',
            message: '🍔 Hora de almorzar. El Classic Burger de Street Burger es el favorito.',
            product_ids: ['lch_001', 'lch_002']
        });
    }

    if (hour >= 18 && hour < 22 && hasStreetBurger) {
        recommendations.push({
            type: 'dinner',
            message: '🌙 Para la cena, prueba nuestro BBQ Burger con bacon.',
            product_ids: ['dnr_001']
        });
    }

    if (hour >= 22 || hour < 6) {
        recommendations.push({
            type: 'late_night',
            message: '🌙 Snacks y bebidas disponibles 24/7 en Pronto Copec.',
            product_ids: ['snk_003', 'drk_005']
        });
    }

    return recommendations;
};

const getPromotionTips = (promos) => {
    const tips = [];

    const chargePromo = promos.find(p => p.applies_to === 'charging');
    if (chargePromo) {
        tips.push(`💡 Aprovecha: ${chargePromo.name} - ${chargePromo.description}`);
    }

    const comboPromo = promos.find(p => p.category === 'combo');
    if (comboPromo) {
        tips.push(`🎁 Combo especial: ${comboPromo.name}`);
    }

    const today = new Date().getDay();
    if (today === 2 || today === 4) { // Tuesday or Thursday
        tips.push('⭐ ¡Hoy es día de puntos dobles! Aprovecha para cargar y sumar más.');
    }

    return tips;
};

module.exports = {
    searchProducts,
    getPromotions,
    PRODUCT_CATALOG,
    PROMOTIONS
};
