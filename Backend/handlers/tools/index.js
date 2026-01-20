/**
 * Copec EV Agent - Tool Registry
 * Central registry for all tools available to the AI agent
 */

const routingTools = require('./routing');
const stationsTools = require('./stations');
const pricingTools = require('./pricing');
const usersTools = require('./users');
const productsTools = require('./products');
const knowledgeTools = require('../ev-knowledge');

/**
 * All available tools for the Bedrock Agent
 * Each tool has: name, description, input_schema, handler
 */
const TOOLS = [
    // Routing Tools
    {
        name: 'calculate_route',
        description: 'Calcula la ruta entre dos puntos geográficos. Devuelve distancia en km, tiempo estimado en minutos, y si la ruta es viable con la batería actual.',
        input_schema: {
            type: 'object',
            properties: {
                origin: {
                    type: 'object',
                    description: 'Punto de origen con coordenadas',
                    properties: {
                        lat: { type: 'number', description: 'Latitud del origen' },
                        lng: { type: 'number', description: 'Longitud del origen' },
                        name: { type: 'string', description: 'Nombre del lugar (opcional)' }
                    },
                    required: ['lat', 'lng']
                },
                destination: {
                    type: 'object',
                    description: 'Punto de destino con coordenadas',
                    properties: {
                        lat: { type: 'number', description: 'Latitud del destino' },
                        lng: { type: 'number', description: 'Longitud del destino' },
                        name: { type: 'string', description: 'Nombre del lugar (opcional)' }
                    },
                    required: ['lat', 'lng']
                },
                current_battery_percent: {
                    type: 'number',
                    description: 'Porcentaje actual de batería del vehículo (0-100)'
                },
                vehicle_range_km: {
                    type: 'number',
                    description: 'Autonomía total del vehículo en km con batería al 100%'
                }
            },
            required: ['origin', 'destination']
        },
        handler: routingTools.calculateRoute
    },
    {
        name: 'calculate_eta',
        description: 'Calcula el tiempo estimado de llegada (ETA) desde un punto a otro considerando tráfico promedio.',
        input_schema: {
            type: 'object',
            properties: {
                origin: {
                    type: 'object',
                    properties: {
                        lat: { type: 'number' },
                        lng: { type: 'number' }
                    },
                    required: ['lat', 'lng']
                },
                destination: {
                    type: 'object',
                    properties: {
                        lat: { type: 'number' },
                        lng: { type: 'number' }
                    },
                    required: ['lat', 'lng']
                },
                departure_time: {
                    type: 'string',
                    description: 'Hora de salida en formato HH:MM (opcional, default: ahora)'
                }
            },
            required: ['origin', 'destination']
        },
        handler: routingTools.calculateETA
    },

    // Station Tools
    {
        name: 'find_charging_stations',
        description: 'Busca estaciones de carga Copec cercanas o en una ruta. Puede filtrar por tipo de cargador, disponibilidad, y servicios.',
        input_schema: {
            type: 'object',
            properties: {
                location: {
                    type: 'object',
                    description: 'Ubicación central de búsqueda',
                    properties: {
                        lat: { type: 'number' },
                        lng: { type: 'number' }
                    },
                    required: ['lat', 'lng']
                },
                radius_km: {
                    type: 'number',
                    description: 'Radio de búsqueda en kilómetros (default: 10)'
                },
                filters: {
                    type: 'object',
                    description: 'Filtros opcionales',
                    properties: {
                        only_available: { type: 'boolean', description: 'Solo estaciones con cargadores disponibles' },
                        charger_type: { type: 'string', enum: ['fast', 'slow', 'any'], description: 'Tipo de cargador preferido' },
                        has_food: { type: 'boolean', description: 'Estaciones con servicio de comida (Street Burger, Pronto)' },
                        has_wifi: { type: 'boolean', description: 'Estaciones con WiFi' },
                        min_chargers_available: { type: 'number', description: 'Mínimo de cargadores disponibles' }
                    }
                },
                along_route: {
                    type: 'object',
                    description: 'Buscar estaciones a lo largo de una ruta',
                    properties: {
                        origin: { type: 'object', properties: { lat: { type: 'number' }, lng: { type: 'number' } } },
                        destination: { type: 'object', properties: { lat: { type: 'number' }, lng: { type: 'number' } } },
                        max_detour_percent: { type: 'number', description: 'Máximo desvío permitido como % de la ruta total' }
                    }
                },
                limit: {
                    type: 'number',
                    description: 'Número máximo de resultados (default: 5)'
                }
            },
            required: ['location']
        },
        handler: stationsTools.findChargingStations
    },
    {
        name: 'check_station_availability',
        description: 'Verifica la disponibilidad en tiempo real de una estación específica, incluyendo cargadores libres y tiempo de espera estimado.',
        input_schema: {
            type: 'object',
            properties: {
                station_id: {
                    type: 'string',
                    description: 'ID de la estación Copec (ej: COPEC_PROVIDENCIA_002)'
                }
            },
            required: ['station_id']
        },
        handler: stationsTools.checkStationAvailability
    },
    {
        name: 'get_station_details',
        description: 'Obtiene información detallada de una estación: servicios, horarios, amenities, rating.',
        input_schema: {
            type: 'object',
            properties: {
                station_id: {
                    type: 'string',
                    description: 'ID de la estación Copec'
                }
            },
            required: ['station_id']
        },
        handler: stationsTools.getStationDetails
    },

    // Pricing Tools
    {
        name: 'estimate_charging_cost',
        description: 'Estima el costo de una sesión de carga basado en el nivel de batería actual, objetivo, y tipo de cargador.',
        input_schema: {
            type: 'object',
            properties: {
                current_battery_percent: {
                    type: 'number',
                    description: 'Porcentaje actual de batería (0-100)'
                },
                target_battery_percent: {
                    type: 'number',
                    description: 'Porcentaje objetivo de batería (default: 80)'
                },
                battery_capacity_kwh: {
                    type: 'number',
                    description: 'Capacidad total de la batería en kWh (default: 60)'
                },
                charger_type: {
                    type: 'string',
                    enum: ['fast', 'slow'],
                    description: 'Tipo de cargador a usar'
                },
                user_type: {
                    type: 'string',
                    enum: ['individual', 'premium', 'fleet', 'business'],
                    description: 'Tipo de usuario para aplicar descuentos'
                }
            },
            required: ['current_battery_percent', 'charger_type']
        },
        handler: pricingTools.estimateChargingCost
    },
    {
        name: 'calculate_trip_cost',
        description: 'Calcula el costo total de un viaje incluyendo todas las paradas de carga necesarias.',
        input_schema: {
            type: 'object',
            properties: {
                origin: {
                    type: 'object',
                    properties: { lat: { type: 'number' }, lng: { type: 'number' } },
                    required: ['lat', 'lng']
                },
                destination: {
                    type: 'object',
                    properties: { lat: { type: 'number' }, lng: { type: 'number' } },
                    required: ['lat', 'lng']
                },
                current_battery_percent: { type: 'number' },
                vehicle_range_km: { type: 'number' },
                battery_capacity_kwh: { type: 'number' },
                user_type: { type: 'string' }
            },
            required: ['origin', 'destination', 'current_battery_percent']
        },
        handler: pricingTools.calculateTripCost
    },

    // User Tools
    {
        name: 'get_user_profile',
        description: 'Obtiene el perfil del usuario incluyendo tipo de cuenta, preferencias, historial de carga, y puntos Copec.',
        input_schema: {
            type: 'object',
            properties: {
                user_id: {
                    type: 'string',
                    description: 'ID del usuario'
                }
            },
            required: ['user_id']
        },
        handler: usersTools.getUserProfile
    },
    {
        name: 'get_user_vehicle',
        description: 'Obtiene información del vehículo del usuario: marca, modelo, capacidad batería, autonomía, tipos de conector compatibles.',
        input_schema: {
            type: 'object',
            properties: {
                user_id: {
                    type: 'string',
                    description: 'ID del usuario'
                }
            },
            required: ['user_id']
        },
        handler: usersTools.getUserVehicle
    },
    {
        name: 'get_user_preferences',
        description: 'Obtiene las preferencias de carga del usuario: tipo de cargador preferido, amenities, sensibilidad al precio.',
        input_schema: {
            type: 'object',
            properties: {
                user_id: {
                    type: 'string',
                    description: 'ID del usuario'
                }
            },
            required: ['user_id']
        },
        handler: usersTools.getUserPreferences
    },

    // Product Tools
    {
        name: 'search_products',
        description: 'Busca productos y servicios disponibles en una estación Copec (Pronto Copec, Street Burger, etc.)',
        input_schema: {
            type: 'object',
            properties: {
                station_id: {
                    type: 'string',
                    description: 'ID de la estación'
                },
                category: {
                    type: 'string',
                    enum: ['food', 'drinks', 'snacks', 'breakfast', 'lunch', 'dinner', 'all'],
                    description: 'Categoría de productos a buscar'
                },
                time_of_day: {
                    type: 'string',
                    description: 'Hora del día en formato HH:MM para filtrar por disponibilidad'
                }
            },
            required: ['station_id']
        },
        handler: productsTools.searchProducts
    },
    {
        name: 'get_promotions',
        description: 'Obtiene las promociones activas en Copec, puede filtrar por estación o tipo.',
        input_schema: {
            type: 'object',
            properties: {
                station_id: {
                    type: 'string',
                    description: 'ID de estación específica (opcional)'
                },
                category: {
                    type: 'string',
                    enum: ['charging', 'food', 'combo', 'all'],
                    description: 'Tipo de promoción'
                },
                user_type: {
                    type: 'string',
                    description: 'Tipo de usuario para promociones exclusivas'
                }
            },
            required: []
        },
        handler: productsTools.getPromotions
    },

    // Knowledge Base Tool (RAG)
    {
        name: 'query_knowledge_base',
        description: 'Consulta la base de conocimientos de Copec para obtener información sobre políticas, procedimientos, guías de carga, información de estaciones, productos y servicios. Úsalo cuando necesites información contextual o detalles que no están disponibles en otros tools.',
        input_schema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Pregunta o tema a consultar en la base de conocimientos'
                },
                category: {
                    type: 'string',
                    enum: ['stations', 'policies', 'products', 'guide', 'charging'],
                    description: 'Categoría específica a consultar (opcional)'
                },
                max_results: {
                    type: 'number',
                    description: 'Número máximo de resultados (default: 3)'
                }
            },
            required: ['query']
        },
        handler: knowledgeTools.queryKnowledge
    }
];

/**
 * Get tool definitions for Bedrock (without handlers)
 */
const getToolDefinitions = () => {
    return TOOLS.map(({ name, description, input_schema }) => ({
        name,
        description,
        input_schema
    }));
};

/**
 * Execute a tool by name with given input
 */
const executeTool = async (toolName, toolInput) => {
    const tool = TOOLS.find(t => t.name === toolName);
    
    if (!tool) {
        return {
            error: `Tool '${toolName}' not found`,
            available_tools: TOOLS.map(t => t.name)
        };
    }

    try {
        const result = await tool.handler(toolInput);
        return result;
    } catch (error) {
        console.error(`Error executing tool ${toolName}:`, error);
        return {
            error: `Error executing ${toolName}: ${error.message}`
        };
    }
};

/**
 * Get tool by name
 */
const getTool = (toolName) => {
    return TOOLS.find(t => t.name === toolName);
};

module.exports = {
    TOOLS,
    getToolDefinitions,
    executeTool,
    getTool
};
