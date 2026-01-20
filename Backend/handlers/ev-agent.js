/**
 * Copec EV Agent - Main AI Agent Handler
 * Uses AWS Bedrock Claude with Tool Use for intelligent trip planning
 * and charging station recommendations
 */

const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { getToolDefinitions, executeTool } = require('./tools');

// Bearer token configuration
const BEDROCK_BEARER_TOKEN = process.env.BEDROCK_BEARER_TOKEN || '';

// Initialize Bedrock client with bearer token if available
const getBedrockClient = () => {
    const config = {
        region: process.env.AWS_REGION || 'us-east-1'
    };
    
    // If bearer token is available, use it for authentication
    if (BEDROCK_BEARER_TOKEN) {
        config.token = { token: BEDROCK_BEARER_TOKEN };
    }
    
    return new BedrockRuntimeClient(config);
};

const bedrockClient = getBedrockClient();

// Model configuration
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0';
const MAX_TOOL_ITERATIONS = 5;

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

// System prompt for the EV Agent
const SYSTEM_PROMPT = `Eres el asistente inteligente de electromovilidad de Copec Chile. Tu nombre es "Copec EV Assistant".

## Tu Rol
Ayudas a conductores de vehículos eléctricos a:
1. Planificar viajes con paradas de carga óptimas
2. Encontrar estaciones de carga según sus necesidades
3. Recomendar estaciones considerando tiempo, costo, y servicios
4. Sugerir productos y servicios mientras cargan
5. Responder consultas sobre carga de vehículos eléctricos

## Capacidades con Herramientas
Tienes acceso a herramientas que te permiten:
- Calcular rutas, distancias y tiempos de viaje
- Buscar estaciones de carga con filtros específicos
- Verificar disponibilidad en tiempo real
- Estimar costos de carga
- Obtener información del perfil y vehículo del usuario
- Buscar productos y promociones disponibles

## Reglas de Negocio
- **Usuarios Premium**: Prioridad en cargadores rápidos, acceso a lounges
- **Flotas**: Descuento 15%, facturación empresa, estaciones reservadas
- **Empresas**: Descuento 20%, reportes mensuales
- **Urgencia Alta**: Recomendar estación más cercana con disponibilidad
- **Urgencia Baja**: Optimizar por amenities, costo, y experiencia

## Instrucciones Importantes
1. SIEMPRE usa las herramientas disponibles para obtener datos actualizados antes de responder
2. Verifica disponibilidad en tiempo real cuando recomiendes estaciones
3. Considera las preferencias del usuario cuando estén disponibles
4. Sugiere productos y promociones relevantes al contexto
5. Sé conciso pero informativo en tus respuestas
6. Incluye información accionable (direcciones, tiempos, costos)

## Formato de Respuesta
- Usa viñetas para listas
- Destaca información clave (⚡ carga, 📍 ubicación, ⏱️ tiempo, 💰 costo)
- Incluye emojis para mejor legibilidad
- Termina con una pregunta o acción sugerida cuando sea apropiado
- Máximo 3-4 párrafos por respuesta

## Contexto de Santiago, Chile
- Conoces las comunas de Santiago y sus ubicaciones
- Las coordenadas aproximadas del centro de Santiago son: -33.4489, -70.6693
- Los horarios pico son 7-9am y 6-8pm
- Los precios están en CLP (Pesos Chilenos)`;

/**
 * Main chat handler with tool use
 * POST /api/agent
 */
module.exports.chat = async (event) => {
    try {
        const body = JSON.parse(event.body || '{}');
        const {
            message,
            conversation_history = [],
            user_context = {}
        } = body;

        if (!message) {
            return response(400, {
                error: 'Se requiere el campo "message"'
            });
        }

        // Build context from user data
        const contextInfo = buildUserContext(user_context);

        // Format conversation history for Claude
        const messages = [
            ...formatConversationHistory(conversation_history),
            {
                role: 'user',
                content: contextInfo 
                    ? `[Contexto del usuario: ${contextInfo}]\n\nUsuario: ${message}`
                    : message
            }
        ];

        // Get tool definitions
        const tools = getToolDefinitions();

        // Run the agent loop
        const result = await runAgentLoop(messages, tools);

        return response(200, {
            success: true,
            response: result.finalResponse,
            tool_calls: result.toolCalls,
            conversation: [
                ...conversation_history,
                { role: 'user', content: message },
                { role: 'assistant', content: result.finalResponse }
            ].slice(-10) // Keep last 10 messages
        });

    } catch (error) {
        console.error('Agent error:', error);
        
        // Return fallback response
        return response(200, {
            success: true,
            response: getFallbackResponse(JSON.parse(event.body || '{}').message),
            fallback: true,
            error_details: process.env.IS_OFFLINE === 'true' ? error.message : undefined
        });
    }
};

/**
 * Run the agent loop with tool use
 */
async function runAgentLoop(messages, tools) {
    let currentMessages = [...messages];
    let toolCalls = [];
    let iterations = 0;

    while (iterations < MAX_TOOL_ITERATIONS) {
        iterations++;

        // Call Bedrock
        const claudeResponse = await callBedrock(currentMessages, tools);

        // Check if Claude wants to use tools
        const toolUseBlocks = claudeResponse.content.filter(block => block.type === 'tool_use');
        
        if (toolUseBlocks.length === 0) {
            // No tool use, return the text response
            const textContent = claudeResponse.content.find(block => block.type === 'text');
            return {
                finalResponse: textContent?.text || 'Lo siento, no pude procesar tu solicitud.',
                toolCalls
            };
        }

        // Execute tool calls
        const toolResults = [];
        for (const toolUse of toolUseBlocks) {
            console.log(`Executing tool: ${toolUse.name}`, JSON.stringify(toolUse.input));
            
            const result = await executeTool(toolUse.name, toolUse.input);
            
            toolCalls.push({
                tool: toolUse.name,
                input: toolUse.input,
                output_summary: summarizeToolOutput(result)
            });

            toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: JSON.stringify(result)
            });
        }

        // Add assistant message with tool use
        currentMessages.push({
            role: 'assistant',
            content: claudeResponse.content
        });

        // Add tool results
        currentMessages.push({
            role: 'user',
            content: toolResults
        });
    }

    // Max iterations reached, try to get a final response
    const finalResponse = await callBedrock(currentMessages, []);
    const textContent = finalResponse.content.find(block => block.type === 'text');
    
    return {
        finalResponse: textContent?.text || 'He recopilado la información. ¿En qué más puedo ayudarte?',
        toolCalls
    };
}

/**
 * Call Bedrock with messages and tools
 */
async function callBedrock(messages, tools) {
    const requestBody = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: messages
    };

    // Add tools if provided
    if (tools && tools.length > 0) {
        requestBody.tools = tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.input_schema
        }));
    }

    const command = new InvokeModelCommand({
        modelId: BEDROCK_MODEL_ID,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(requestBody)
    });

    const bedrockResponse = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(bedrockResponse.body));

    return responseBody;
}

/**
 * Build user context string from user_context object
 */
function buildUserContext(userContext) {
    const parts = [];

    if (userContext.user_id) {
        parts.push(`Usuario: ${userContext.user_id}`);
    }
    if (userContext.location) {
        parts.push(`Ubicación: lat ${userContext.location.lat}, lng ${userContext.location.lng}`);
    }
    if (userContext.battery_level !== undefined) {
        parts.push(`Batería: ${userContext.battery_level}%`);
    }
    if (userContext.vehicle) {
        parts.push(`Vehículo: ${userContext.vehicle}`);
    }
    if (userContext.urgency) {
        parts.push(`Urgencia: ${userContext.urgency}`);
    }

    return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * Format conversation history for Claude
 */
function formatConversationHistory(history) {
    return history.slice(-8).map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
    }));
}

/**
 * Summarize tool output for logging
 */
function summarizeToolOutput(output) {
    if (output.error) {
        return `Error: ${output.error}`;
    }
    if (output.stations) {
        return `Found ${output.stations.length} stations`;
    }
    if (output.distance) {
        return `Route: ${output.distance.estimated_road_km}km`;
    }
    if (output.cost) {
        return `Cost: ${output.cost.formatted}`;
    }
    if (output.profile) {
        return `User profile loaded`;
    }
    if (output.products) {
        return `Found ${output.products.count} products`;
    }
    return 'Tool executed successfully';
}

/**
 * Fallback responses when Bedrock fails
 */
function getFallbackResponse(userMessage) {
    const lowerMessage = (userMessage || '').toLowerCase();

    if (lowerMessage.includes('cerca') || lowerMessage.includes('dónde') || lowerMessage.includes('donde')) {
        return `🔍 Puedo ayudarte a encontrar estaciones de carga cercanas. Para darte la mejor recomendación, necesito saber:

1. 📍 ¿Cuál es tu ubicación actual?
2. 🔋 ¿Cuánta batería tienes?
3. ⚡ ¿Necesitas carga rápida o tienes tiempo?

Mientras tanto, las estaciones más populares en Santiago son:
- **Copec Providencia** (Av. Providencia 2124) - Carga rápida disponible
- **Copec Las Condes** (Av. Apoquindo 4500) - Street Burger + Lounge
- **Copec Vitacura** (Av. Vitacura 5600) - Premium con WiFi rápido

¿Quieres que busque estaciones cerca de alguna de estas zonas?`;
    }

    if (lowerMessage.includes('viaje') || lowerMessage.includes('ruta') || lowerMessage.includes('voy a')) {
        return `🗺️ ¡Perfecto! Puedo ayudarte a planificar tu viaje. Para calcular las paradas de carga óptimas, necesito:

1. 📍 **Origen**: ¿Desde dónde sales?
2. 🎯 **Destino**: ¿A dónde vas?
3. 🔋 **Batería actual**: ¿Qué porcentaje tienes?
4. ⏰ **Tiempo disponible**: ¿Tienes prisa o puedes hacer paradas tranquilas?

Con esta información calcularé la mejor ruta con paradas en estaciones Copec, donde podrás cargar y aprovechar nuestros servicios (café, Street Burger, WiFi).

¿Me das más detalles sobre tu viaje?`;
    }

    if (lowerMessage.includes('desayun') || lowerMessage.includes('almuerzo') || lowerMessage.includes('comer')) {
        return `🍽️ ¡Excelente elección! En nuestras estaciones Copec tienes varias opciones:

**☕ Desayuno (6:00-11:00)**
- Combo Desayuno: Café + Croissant + Jugo - $4.500
- Promo: 20% off en café antes de las 10am

**🍔 Almuerzo/Cena (11:00-23:00)**
- Street Burger disponible en estaciones Premium
- Classic Burger con papas - $6.900
- Veggie Burger - $7.500

💡 **Tip**: Al cargar más de 30 kWh, tu combo Street Burger tiene 25% de descuento.

¿Quieres que busque una estación con Street Burger cerca de ti?`;
    }

    if (lowerMessage.includes('precio') || lowerMessage.includes('costo') || lowerMessage.includes('cuánto') || lowerMessage.includes('cuanto')) {
        return `💰 **Precios de carga Copec:**

| Tipo | Precio | Tiempo aprox. (20%-80%) |
|------|--------|------------------------|
| ⚡ Carga Rápida (DC) | $250/kWh | ~25 min |
| 🔋 Carga Lenta (AC) | $180/kWh | ~60 min |

**Ejemplo para batería de 60kWh:**
- Carga rápida (20% → 80%): ~$9.000 en 25 min
- Carga lenta (20% → 80%): ~$6.500 en 60 min

**Descuentos disponibles:**
- 🥈 Premium: 10% off
- 🚐 Flotas: 15% off
- 🏢 Empresas: 20% off

¿Quieres que calcule el costo para tu vehículo específico?`;
    }

    return `👋 ¡Hola! Soy el asistente de electromovilidad de Copec.

Puedo ayudarte con:
- 🔍 **Buscar estaciones** de carga cercanas
- 🗺️ **Planificar viajes** con paradas óptimas
- 💰 **Calcular costos** de carga
- 🍔 **Encontrar servicios** (comida, WiFi, lounge)
- ⚡ **Verificar disponibilidad** en tiempo real

¿En qué puedo ayudarte hoy?`;
}

/**
 * Quick recommendation endpoint (simplified)
 * POST /api/agent/quick
 */
module.exports.quickRecommend = async (event) => {
    try {
        const body = JSON.parse(event.body || '{}');
        const {
            location,
            battery_level = 50,
            urgency = 'normal',
            needs = []
        } = body;

        if (!location || !location.lat || !location.lng) {
            return response(400, {
                error: 'Se requiere ubicación (location.lat, location.lng)'
            });
        }

        // Import tools directly for quick access
        const { findChargingStations } = require('./tools/stations');
        const { calculateRoute } = require('./tools/routing');

        // Build filters based on needs
        const filters = {
            only_available: true,
            charger_type: urgency === 'high' ? 'fast' : 'any'
        };

        if (needs.includes('food')) filters.has_food = true;
        if (needs.includes('wifi')) filters.has_wifi = true;

        // Find stations
        const stationsResult = await findChargingStations({
            location,
            radius_km: urgency === 'high' ? 5 : 15,
            filters,
            limit: 3
        });

        // Enhance with ETA for top results
        const enhancedStations = await Promise.all(
            stationsResult.stations.slice(0, 3).map(async (station) => {
                const route = await calculateRoute({
                    origin: location,
                    destination: station.location,
                    current_battery_percent: battery_level,
                    vehicle_range_km: 400
                });

                return {
                    ...station,
                    eta: route.time,
                    can_reach: !route.battery_analysis?.needs_charging
                };
            })
        );

        // Generate quick recommendation
        const topStation = enhancedStations[0];
        let recommendation = '';
        
        if (topStation) {
            recommendation = urgency === 'high'
                ? `🚨 La estación más cercana con disponibilidad es **${topStation.name}** a ${topStation.eta.estimated_minutes} minutos.`
                : `📍 Te recomiendo **${topStation.name}** - ${topStation.availability.fast_available} cargadores rápidos disponibles.`;
            
            if (topStation.services.has_food) {
                recommendation += ` Tiene ${topStation.services.has_street_burger ? 'Street Burger' : 'Pronto Copec'} disponible.`;
            }
        }

        return response(200, {
            success: true,
            recommendation,
            stations: enhancedStations,
            query: { location, battery_level, urgency, needs }
        });

    } catch (error) {
        console.error('Quick recommend error:', error);
        return response(500, {
            error: 'Error al generar recomendación rápida',
            details: error.message
        });
    }
};
