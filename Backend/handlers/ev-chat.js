/**
 * Copec EV Chat - AI Conversational Interface
 * Uses AWS Bedrock for natural language trip planning
 */

const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const stations = require('../data/stations_geo.json');
const venues = require('../data/venues.json');
const chargingMetrics = require('../data/charging_metrics.json');

const bedrockClient = new BedrockRuntimeClient({ region: 'us-east-1' });

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

// Build context for AI
const buildContext = (userContext = {}) => {
    const availableStations = stations.stations.filter(s =>
        s.chargers.some(c => c.status === 'available')
    );

    const stationsSummary = stations.stations.slice(0, 5).map(s => ({
        name: s.name,
        address: s.address,
        available: s.chargers.filter(c => c.status === 'available').length,
        total: s.chargers.length,
        hasFast: s.chargers.some(c => c.type === 'fast'),
        amenities: s.usage_factors.nearby_amenities
    }));

    const premiumVenues = Object.values(venues.venues).filter(v =>
        ['copec_premium', 'copec_flagship'].includes(v.venue_type)
    );

    return `
## Contexto del Sistema Copec EV Assistant

### Estadísticas Actuales:
- Total estaciones: ${stations.stations.length}
- Estaciones disponibles: ${availableStations.length}
- Estaciones premium con Street Burger: ${premiumVenues.length}

### Top 5 Estaciones:
${stationsSummary.map(s => `- ${s.name}: ${s.available}/${s.total} disponibles, ${s.hasFast ? 'carga rápida' : 'carga lenta'}, cerca: ${s.amenities.join(', ')}`).join('\n')}

### Usuario Actual:
- Batería: ${userContext.batteryLevel || 50}%
- Urgencia: ${userContext.urgency || 'normal'}
- Ubicación: ${userContext.location ? `lat ${userContext.location.lat}, lng ${userContext.location.lng}` : 'Santiago centro'}
- Vehículo: ${userContext.vehicle || 'No especificado'}

### Precios:
- Carga rápida: $${stations.metadata.pricing.fast_charging_per_kwh} CLP/kWh
- Carga lenta: $${stations.metadata.pricing.slow_charging_per_kwh} CLP/kWh
`;
};

// System prompt for the AI
const SYSTEM_PROMPT = `Eres el asistente de electromovilidad de Copec Chile. Tu rol es ayudar a conductores de vehículos eléctricos a:

1. Encontrar estaciones de carga cercanas
2. Planificar viajes optimizando paradas de carga
3. Recomendar estaciones según preferencias (rapidez, amenities, costo)
4. Responder consultas sobre carga de vehículos eléctricos

REGLAS:
- Responde siempre en español chileno, de manera concisa y amigable
- Incluye datos específicos cuando estén disponibles (tiempos, costos, distancias)
- Si el usuario pregunta por una estación específica, proporciona detalles
- Para planificar viajes, considera la autonomía del vehículo y paradas óptimas
- Sugiere servicios adicionales (Pronto Copec, Street Burger) cuando sea relevante
- Máximo 3 párrafos por respuesta

FORMATO DE RESPUESTA:
- Usa viñetas para listas
- Destaca información importante
- Termina con una pregunta o sugerencia de acción cuando sea apropiado`;

/**
 * POST /api/chat
 * Conversational AI endpoint
 */
module.exports.chat = async (event) => {
    try {
        const body = JSON.parse(event.body || '{}');
        const { message, conversationHistory = [], userContext = {} } = body;

        if (!message) {
            return response(400, { error: 'Se requiere el campo "message"' });
        }

        // Build the prompt with context
        const context = buildContext(userContext);

        // Format conversation history
        const formattedHistory = conversationHistory.slice(-6).map(msg => ({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content
        }));

        // Build messages array for Claude
        const messages = [
            ...formattedHistory,
            { role: 'user', content: `${context}\n\n---\n\nUsuario: ${message}` }
        ];

        // Call Bedrock
        const modelId = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0';

        const command = new InvokeModelCommand({
            modelId,
            contentType: 'application/json',
            accept: 'application/json',
            body: JSON.stringify({
                anthropic_version: 'bedrock-2023-05-31',
                max_tokens: 1024,
                system: SYSTEM_PROMPT,
                messages
            })
        });

        const bedrockResponse = await bedrockClient.send(command);
        const responseBody = JSON.parse(new TextDecoder().decode(bedrockResponse.body));
        const aiMessage = responseBody.content[0].text;

        // Extract any actions from the response
        const actions = extractActions(aiMessage, userContext);

        return response(200, {
            success: true,
            message: aiMessage,
            actions,
            usage: {
                input_tokens: responseBody.usage?.input_tokens,
                output_tokens: responseBody.usage?.output_tokens
            }
        });

    } catch (error) {
        console.error('Chat error:', error);

        // Fallback response
        return response(200, {
            success: true,
            message: getFallbackResponse(JSON.parse(event.body || '{}').message),
            actions: [],
            fallback: true
        });
    }
};

// Extract actionable items from AI response
const extractActions = (aiMessage, userContext) => {
    const actions = [];
    const lowerMessage = aiMessage.toLowerCase();

    // Check for station mentions
    const stationMentions = stations.stations.filter(s =>
        lowerMessage.includes(s.name.toLowerCase())
    );

    if (stationMentions.length > 0) {
        actions.push({
            type: 'show_stations',
            stations: stationMentions.map(s => s.id)
        });
    }

    // Check for navigation suggestions
    if (lowerMessage.includes('navegar') || lowerMessage.includes('ir a') || lowerMessage.includes('dirígete')) {
        actions.push({ type: 'suggest_navigation' });
    }

    // Check for trip planning
    if (lowerMessage.includes('planifica') || lowerMessage.includes('ruta') || lowerMessage.includes('viaje')) {
        actions.push({ type: 'open_trip_planner' });
    }

    return actions;
};

// Fallback responses when Bedrock fails
const getFallbackResponse = (userMessage) => {
    const lowerMessage = (userMessage || '').toLowerCase();

    if (lowerMessage.includes('cerca') || lowerMessage.includes('dónde')) {
        return 'Tenemos varias estaciones disponibles en Santiago. Las más cercanas al centro son Copec Alameda (Av. Alameda 1234) y Copec Providencia (Av. Providencia 2100). Ambas cuentan con cargadores rápidos y Pronto Copec 24/7. ¿Te gustaría ver la disponibilidad en tiempo real?';
    }

    if (lowerMessage.includes('rápid') || lowerMessage.includes('urgente')) {
        return 'Para carga rápida, te recomiendo Copec Las Condes o Copec Vitacura. Ambas tienen cargadores de 150kW que pueden cargar tu vehículo al 80% en aproximadamente 30 minutos. Actualmente hay disponibilidad en ambas. ¿Quieres que te direccione a la más cercana?';
    }

    if (lowerMessage.includes('viaje') || lowerMessage.includes('ruta')) {
        return 'Para planificar tu viaje, necesito saber tu destino y el nivel de batería actual. Puedo calcular las paradas óptimas de carga en la ruta, considerando estaciones Copec con cargadores rápidos y servicios como Street Burger para hacer más agradable la espera.';
    }

    if (lowerMessage.includes('precio') || lowerMessage.includes('costo') || lowerMessage.includes('cuánto')) {
        return 'Los precios de carga Copec son: Carga rápida (DC) a $200 CLP/kWh y carga lenta (AC) a $120 CLP/kWh. Para un vehículo promedio de 60kWh, una carga completa costaría entre $7.200 y $12.000 CLP aproximadamente.';
    }

    return 'Estoy aquí para ayudarte con la carga de tu vehículo eléctrico. Puedo encontrar estaciones cercanas, planificar rutas de viaje, o darte información sobre tiempos y costos de carga. ¿En qué te puedo ayudar?';
};
