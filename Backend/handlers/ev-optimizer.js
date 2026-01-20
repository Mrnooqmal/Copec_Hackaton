/**
 * Copec EV Optimizer Agent - Lambda Handler
 * AWS Bedrock integration for intelligent charging recommendations
 * 
 * Endpoints:
 * - POST /api/recommend
 * - GET /api/stations/nearby
 */

const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const stations = require('../data/stations_geo.json');

// Initialize Bedrock client
const bedrockClient = new BedrockRuntimeClient({
    region: process.env.AWS_REGION || 'us-east-1'
});

// Bedrock model configuration
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0';

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
 * Calculate distance between two coordinates (Haversine formula)
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Calculate ETA based on distance (assuming 30 km/h avg city speed)
 */
function calculateETA(distanceKm) {
    const avgSpeedKmh = 30;
    const etaMinutes = Math.round((distanceKm / avgSpeedKmh) * 60);
    return etaMinutes;
}

/**
 * Calculate charging time based on battery level and charger power
 */
function calculateChargingTime(currentBattery, targetBattery, batteryCapacity, chargerPower) {
    const energyNeeded = (targetBattery - currentBattery) / 100 * batteryCapacity;
    const chargingTimeHours = energyNeeded / chargerPower;
    return Math.round(chargingTimeHours * 60); // Return in minutes
}

/**
 * Calculate estimated cost
 */
function calculateCost(energyNeeded, chargerType) {
    const pricePerKwh = chargerType === 'fast' ? 250 : 180; // CLP
    return Math.round(energyNeeded * pricePerKwh);
}

/**
 * Calculate station score based on multiple factors
 */
function calculateStationScore(station, userLocation, userPreferences) {
    const { lat, lng } = userLocation;
    const { urgency = 'normal', preferFast = false, needsAmenities = [] } = userPreferences;

    const distance = calculateDistance(lat, lng, station.location.lat, station.location.lng);

    // Get available chargers
    const availableChargers = station.chargers.filter(c => c.status === 'available');
    const fastAvailable = availableChargers.filter(c => c.type === 'fast').length;
    const slowAvailable = availableChargers.filter(c => c.type === 'slow').length;

    // Base score components (0-100 each)
    let scores = {
        distance: Math.max(0, 100 - distance * 10), // Closer = better
        availability: availableChargers.length > 0 ? (availableChargers.length / station.chargers.length) * 100 : 0,
        waitTime: Math.max(0, 100 - station.usage_factors.avg_wait_time * 3),
        chargerType: preferFast && fastAvailable > 0 ? 100 : (slowAvailable > 0 ? 70 : 30),
        amenities: 0
    };

    // Amenities matching
    if (needsAmenities.length > 0) {
        const matchingAmenities = needsAmenities.filter(a =>
            station.usage_factors.nearby_amenities.some(sa => sa.toLowerCase().includes(a.toLowerCase()))
        );
        scores.amenities = (matchingAmenities.length / needsAmenities.length) * 100;
    }

    // Weights based on urgency
    let weights;
    switch (urgency) {
        case 'high':
            weights = { distance: 0.35, availability: 0.35, waitTime: 0.2, chargerType: 0.1, amenities: 0 };
            break;
        case 'low':
            weights = { distance: 0.15, availability: 0.2, waitTime: 0.15, chargerType: 0.2, amenities: 0.3 };
            break;
        default: // normal
            weights = { distance: 0.25, availability: 0.3, waitTime: 0.2, chargerType: 0.15, amenities: 0.1 };
    }

    const totalScore =
        scores.distance * weights.distance +
        scores.availability * weights.availability +
        scores.waitTime * weights.waitTime +
        scores.chargerType * weights.chargerType +
        scores.amenities * weights.amenities;

    return {
        score: Math.round(totalScore),
        components: scores,
        distance: Math.round(distance * 10) / 10,
        availableChargers: availableChargers.length,
        fastAvailable,
        slowAvailable
    };
}

/**
 * Build prompt for Bedrock to generate recommendation reasoning
 */
function buildRecommendationPrompt(station, scoreData, userContext) {
    return `Eres un asistente de Copec especializado en electromovilidad. Genera una recomendación breve y clara (máximo 2 oraciones) para esta estación de carga.

Contexto del usuario:
- Ubicación: ${userContext.address || 'Santiago, Chile'}
- Nivel de batería: ${userContext.batteryLevel}%
- Urgencia: ${userContext.urgency}
- Tipo de vehículo: ${userContext.vehicleType || 'EV genérico'}
${userContext.needsAmenities?.length > 0 ? `- Necesita: ${userContext.needsAmenities.join(', ')}` : ''}

Estación recomendada:
- Nombre: ${station.name}
- Dirección: ${station.address}
- Distancia: ${scoreData.distance} km
- Cargadores disponibles: ${scoreData.availableChargers} (${scoreData.fastAvailable} rápidos, ${scoreData.slowAvailable} lentos)
- Tiempo de espera promedio: ${station.usage_factors.avg_wait_time} min
- Amenities: ${station.usage_factors.nearby_amenities.join(', ')}
- Score: ${scoreData.score}/100

Genera SOLO la recomendación, sin prefijos ni explicaciones adicionales. Sé conciso y orientado a la acción.`;
}

/**
 * Call Bedrock for AI-powered reasoning
 */
async function getBedrockReasoning(prompt) {
    try {
        const command = new InvokeModelCommand({
            modelId: BEDROCK_MODEL_ID,
            contentType: 'application/json',
            accept: 'application/json',
            body: JSON.stringify({
                anthropic_version: "bedrock-2023-05-31",
                max_tokens: 150,
                temperature: 0.7,
                messages: [
                    { role: "user", content: prompt }
                ]
            })
        });

        const response = await bedrockClient.send(command);
        const responseBody = JSON.parse(new TextDecoder().decode(response.body));
        return responseBody.content[0].text;
    } catch (error) {
        console.error('Bedrock error:', error);
        return null;
    }
}

/**
 * Generate fallback reasoning without AI
 */
function getFallbackReasoning(station, scoreData) {
    const reasons = [];

    if (scoreData.distance < 3) reasons.push(`A solo ${scoreData.distance} km de tu ubicación`);
    if (scoreData.fastAvailable > 0) reasons.push(`${scoreData.fastAvailable} cargador(es) rápido(s) disponible(s)`);
    if (station.usage_factors.avg_wait_time < 10) reasons.push('Tiempo de espera bajo');
    if (station.usage_factors.nearby_amenities.length > 3) reasons.push('Múltiples servicios disponibles');

    return reasons.length > 0
        ? reasons.slice(0, 2).join('. ') + '.'
        : `Estación disponible a ${scoreData.distance} km con ${scoreData.availableChargers} cargador(es).`;
}

/**
 * POST /api/recommend
 * Get AI-powered charging station recommendations
 */
module.exports.recommend = async (event) => {
    try {
        const body = JSON.parse(event.body || '{}');

        const {
            location, // { lat, lng }
            batteryLevel = 50,
            batteryCapacity = 75, // kWh
            targetBattery = 80,
            urgency = 'normal', // 'low', 'normal', 'high'
            preferFast = false,
            needsAmenities = [],
            vehicleType = 'EV',
            maxResults = 3
        } = body;

        if (!location || !location.lat || !location.lng) {
            return response(400, {
                error: 'Se requiere ubicación (location.lat, location.lng)'
            });
        }

        const userPreferences = { urgency, preferFast, needsAmenities };
        const userContext = { batteryLevel, urgency, vehicleType, needsAmenities };

        // Score all stations
        const scoredStations = stations.stations.map(station => {
            const scoreData = calculateStationScore(station, location, userPreferences);
            return { station, ...scoreData };
        });

        // Sort by score and get top results
        scoredStations.sort((a, b) => b.score - a.score);
        const topStations = scoredStations.slice(0, maxResults);

        // Generate recommendations with AI reasoning
        const recommendations = await Promise.all(
            topStations.map(async ({ station, score, distance, fastAvailable, slowAvailable, availableChargers, components }) => {
                // Get best available charger
                const availableChgrs = station.chargers.filter(c => c.status === 'available');
                const bestCharger = availableChgrs.find(c => c.type === 'fast') || availableChgrs[0];

                // Calculate times and costs
                const eta = calculateETA(distance);
                const chargingTime = bestCharger
                    ? calculateChargingTime(batteryLevel, targetBattery, batteryCapacity, bestCharger.power)
                    : 30;
                const energyNeeded = (targetBattery - batteryLevel) / 100 * batteryCapacity;
                const estimatedCost = bestCharger
                    ? calculateCost(energyNeeded, bestCharger.type)
                    : Math.round(energyNeeded * 220);

                // Get AI reasoning or fallback
                const scoreData = { score, distance, fastAvailable, slowAvailable, availableChargers };
                const prompt = buildRecommendationPrompt(station, scoreData, userContext);
                let reasoning = await getBedrockReasoning(prompt);

                if (!reasoning) {
                    reasoning = getFallbackReasoning(station, scoreData);
                }

                return {
                    station_id: station.id,
                    station_name: station.name,
                    address: station.address,
                    location: station.location,
                    score,
                    score_breakdown: components,
                    reasoning,
                    eta_minutes: eta,
                    charging_time_minutes: chargingTime,
                    total_time_minutes: eta + chargingTime + station.usage_factors.avg_wait_time,
                    estimated_cost_clp: estimatedCost,
                    available_chargers: availableChgrs.map(c => ({
                        id: c.id,
                        type: c.type,
                        power: c.power,
                        connector: c.connector
                    })),
                    amenities: station.usage_factors.nearby_amenities,
                    actions: [
                        { type: 'navigate', label: 'Ir a la estación', url: `https://maps.google.com/?daddr=${station.location.lat},${station.location.lng}` },
                        { type: 'reserve', label: 'Reservar cargador', available: false }, // Future feature
                        { type: 'call', label: 'Llamar a estación', phone: '+56 2 2200 0000' }
                    ]
                };
            })
        );

        return response(200, {
            success: true,
            query: {
                location,
                batteryLevel,
                targetBattery,
                urgency,
                preferFast,
                needsAmenities
            },
            recommendations,
            generated_at: new Date().toISOString()
        });

    } catch (error) {
        console.error('Recommend error:', error);
        return response(500, {
            error: 'Error al generar recomendaciones',
            details: error.message
        });
    }
};

/**
 * GET /api/stations/nearby
 * List stations near a location with real-time availability
 */
module.exports.nearbyStations = async (event) => {
    try {
        const params = event.queryStringParameters || {};
        const lat = parseFloat(params.lat);
        const lng = parseFloat(params.lng);
        const radiusKm = parseFloat(params.radius) || 10;
        const onlyAvailable = params.available === 'true';
        const chargerType = params.type; // 'fast' or 'slow'

        if (isNaN(lat) || isNaN(lng)) {
            return response(400, {
                error: 'Se requieren parámetros lat y lng válidos'
            });
        }

        let filtered = stations.stations.map(station => {
            const distance = calculateDistance(lat, lng, station.location.lat, station.location.lng);
            const eta = calculateETA(distance);

            let availableChargers = station.chargers.filter(c => c.status === 'available');
            if (chargerType) {
                availableChargers = availableChargers.filter(c => c.type === chargerType);
            }

            return {
                ...station,
                distance: Math.round(distance * 10) / 10,
                eta_minutes: eta,
                available_count: availableChargers.length,
                total_chargers: station.chargers.length,
                has_fast: station.chargers.some(c => c.type === 'fast'),
                has_slow: station.chargers.some(c => c.type === 'slow')
            };
        });

        // Filter by radius
        filtered = filtered.filter(s => s.distance <= radiusKm);

        // Filter by availability if requested
        if (onlyAvailable) {
            filtered = filtered.filter(s => s.available_count > 0);
        }

        // Sort by distance
        filtered.sort((a, b) => a.distance - b.distance);

        return response(200, {
            success: true,
            query: { lat, lng, radius: radiusKm, onlyAvailable, chargerType },
            count: filtered.length,
            stations: filtered,
            metadata: stations.metadata
        });

    } catch (error) {
        console.error('Nearby stations error:', error);
        return response(500, {
            error: 'Error al obtener estaciones cercanas',
            details: error.message
        });
    }
};

/**
 * POST /api/voice/process
 * Process voice input and generate response (mock for transcription)
 */
module.exports.processVoice = async (event) => {
    try {
        const body = JSON.parse(event.body || '{}');
        const { transcript, location } = body;

        if (!transcript) {
            return response(400, { error: 'Se requiere transcripción de voz' });
        }

        // Build conversational prompt for Bedrock
        const prompt = `Eres el asistente de electromovilidad de Copec. Un usuario te dice: "${transcript}"

Contexto: El usuario está en Santiago, Chile${location ? ` cerca de ${location.lat}, ${location.lng}` : ''}.

Responde de manera concisa y útil, como si fueras un asistente de voz en el auto. Si el usuario pregunta por estaciones de carga, sugiere usar el mapa para ver opciones cercanas. Máximo 2-3 oraciones.`;

        let aiResponse = await getBedrockReasoning(prompt);

        if (!aiResponse) {
            aiResponse = 'Entendido. Puedo ayudarte a encontrar la mejor estación de carga. ¿Quieres que te muestre las opciones más cercanas en el mapa?';
        }

        return response(200, {
            success: true,
            input: transcript,
            response: aiResponse,
            actions: [
                { type: 'speak', text: aiResponse },
                { type: 'show_map', suggested: true }
            ]
        });

    } catch (error) {
        console.error('Voice process error:', error);
        return response(500, {
            error: 'Error al procesar voz',
            details: error.message
        });
    }
};
