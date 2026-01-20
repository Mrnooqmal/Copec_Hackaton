/**
 * Copec EV Trips - Trip Planning Handler
 * Manages trip planning and route optimization
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { v4: uuidv4 } = require('uuid');
const stations = require('../data/stations_geo.json');

// Initialize clients
const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const bedrockClient = new BedrockRuntimeClient({ region: 'us-east-1' });

const TRIPS_TABLE = process.env.TRIPS_TABLE;

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

// Haversine distance calculation
const calculateDistance = (lat1, lng1, lat2, lng2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Find optimal charging stops along a route
const findChargingStops = (origin, destination, currentBattery, vehicleRange, preferences = {}) => {
    // Calculate total distance
    const totalDistance = calculateDistance(
        origin.lat, origin.lng,
        destination.lat, destination.lng
    );

    // Calculate range with current battery
    const currentRange = (currentBattery / 100) * vehicleRange;

    // If we can make it without charging, no stops needed
    if (currentRange >= totalDistance * 1.2) { // 20% safety margin
        return {
            needsCharging: false,
            stops: [],
            totalDistance,
            estimatedTime: Math.round(totalDistance / 60 * 60) // 60 km/h average
        };
    }

    // Find stations along the route
    const routeStations = stations.stations
        .map(station => {
            // Calculate if station is roughly on the route
            const distToOrigin = calculateDistance(
                origin.lat, origin.lng,
                station.location.lat, station.location.lng
            );
            const distToDestination = calculateDistance(
                station.location.lat, station.location.lng,
                destination.lat, destination.lng
            );
            const detour = (distToOrigin + distToDestination) - totalDistance;

            return {
                ...station,
                distanceFromOrigin: distToOrigin,
                detour,
                available: station.chargers.filter(c => c.status === 'available').length,
                hasFast: station.chargers.some(c => c.type === 'fast' && c.status === 'available')
            };
        })
        .filter(s => s.detour < totalDistance * 0.3) // Max 30% detour
        .filter(s => s.available > 0)
        .sort((a, b) => {
            // Prioritize by preferences
            if (preferences.preferFast && a.hasFast !== b.hasFast) {
                return a.hasFast ? -1 : 1;
            }
            return a.distanceFromOrigin - b.distanceFromOrigin;
        });

    // Select optimal stops based on range
    const stops = [];
    let currentPosition = origin;
    let remainingBattery = currentBattery;

    for (const station of routeStations) {
        const distToStation = calculateDistance(
            currentPosition.lat, currentPosition.lng,
            station.location.lat, station.location.lng
        );

        // Calculate battery after reaching station
        const batteryUsed = (distToStation / vehicleRange) * 100;
        remainingBattery -= batteryUsed;

        if (remainingBattery < 20) { // Need to charge before this point
            const prevStation = routeStations.find(s =>
                calculateDistance(currentPosition.lat, currentPosition.lng, s.location.lat, s.location.lng) < distToStation
            );

            if (prevStation) {
                stops.push({
                    station: prevStation,
                    chargeToPercent: 80,
                    estimatedChargeTime: prevStation.hasFast ? 25 : 60,
                    reason: 'Carga necesaria antes de continuar'
                });
                remainingBattery = 80;
                currentPosition = prevStation.location;
            }
        }

        // Check if we can reach destination
        const distToEnd = calculateDistance(
            station.location.lat, station.location.lng,
            destination.lat, destination.lng
        );

        if ((remainingBattery / 100) * vehicleRange >= distToEnd * 1.2) {
            break; // We can make it
        }
    }

    // If stops are empty but we need charging, add the first available station
    if (stops.length === 0 && currentRange < totalDistance) {
        const firstGoodStation = routeStations[0];
        if (firstGoodStation) {
            stops.push({
                station: firstGoodStation,
                chargeToPercent: 80,
                estimatedChargeTime: firstGoodStation.hasFast ? 25 : 60,
                reason: 'Parada de carga recomendada'
            });
        }
    }

    // Calculate total time
    const drivingTime = Math.round(totalDistance / 60 * 60); // minutes
    const chargingTime = stops.reduce((sum, s) => sum + s.estimatedChargeTime, 0);

    return {
        needsCharging: true,
        stops,
        totalDistance: Math.round(totalDistance),
        drivingTime,
        chargingTime,
        totalTime: drivingTime + chargingTime
    };
};

/**
 * POST /api/trips/plan
 * Plan a trip with optimal charging stops
 */
module.exports.planTrip = async (event) => {
    try {
        const body = JSON.parse(event.body || '{}');
        const {
            origin,
            destination,
            waypoints = [],
            currentBattery = 50,
            vehicleRange = 400, // km
            preferences = {}
        } = body;

        if (!origin || !destination) {
            return response(400, {
                error: 'Se requieren origen y destino',
                example: {
                    origin: { lat: -33.4489, lng: -70.6693, name: 'Santiago Centro' },
                    destination: { lat: -33.0153, lng: -71.5503, name: 'Valparaíso' },
                    currentBattery: 60,
                    vehicleRange: 400
                }
            });
        }

        // Calculate route with charging stops
        const route = findChargingStops(origin, destination, currentBattery, vehicleRange, preferences);

        // Enhance with AI recommendations if available
        let aiRecommendation = null;
        try {
            const prompt = `Genera una breve recomendación (2-3 oraciones) para un viaje de ${origin.name || 'origen'} a ${destination.name || 'destino'} 
            (${route.totalDistance}km) con ${currentBattery}% de batería. 
            ${route.needsCharging ? `Necesita ${route.stops.length} parada(s) de carga.` : 'No necesita cargar en ruta.'}
            Menciona algún tip útil sobre el viaje o las estaciones Copec en la ruta.`;

            const command = new InvokeModelCommand({
                modelId: process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0',
                contentType: 'application/json',
                accept: 'application/json',
                body: JSON.stringify({
                    anthropic_version: 'bedrock-2023-05-31',
                    max_tokens: 200,
                    messages: [{ role: 'user', content: prompt }]
                })
            });

            const bedrockResponse = await bedrockClient.send(command);
            const responseBody = JSON.parse(new TextDecoder().decode(bedrockResponse.body));
            aiRecommendation = responseBody.content[0].text;
        } catch (aiError) {
            console.log('AI recommendation skipped:', aiError.message);
        }

        return response(200, {
            success: true,
            trip: {
                origin,
                destination,
                waypoints,
                route: {
                    totalDistance: route.totalDistance,
                    totalTime: route.totalTime || route.estimatedTime,
                    drivingTime: route.drivingTime || route.estimatedTime,
                    chargingTime: route.chargingTime || 0,
                    needsCharging: route.needsCharging
                },
                chargingStops: route.stops.map(stop => ({
                    stationId: stop.station.id,
                    stationName: stop.station.name,
                    address: stop.station.address,
                    location: stop.station.location,
                    chargeToPercent: stop.chargeToPercent,
                    estimatedChargeTime: stop.estimatedChargeTime,
                    reason: stop.reason,
                    hasFast: stop.station.hasFast,
                    amenities: stop.station.usage_factors?.nearby_amenities || []
                })),
                aiRecommendation
            }
        });

    } catch (error) {
        console.error('Plan trip error:', error);
        return response(500, { error: 'Error al planificar viaje' });
    }
};

/**
 * GET /api/trips/{userId}
 * Get user's saved trips
 */
module.exports.getUserTrips = async (event) => {
    try {
        const userId = event.pathParameters?.userId;

        if (!userId) {
            return response(400, { error: 'Se requiere userId' });
        }

        // For offline mode, return mock data
        if (process.env.IS_OFFLINE === 'true' || !TRIPS_TABLE) {
            return response(200, {
                success: true,
                trips: [
                    {
                        tripId: 'demo-trip-1',
                        userId,
                        origin: { name: 'Santiago Centro', lat: -33.4489, lng: -70.6693 },
                        destination: { name: 'Valparaíso', lat: -33.0153, lng: -71.5503 },
                        createdAt: new Date().toISOString(),
                        status: 'planned'
                    }
                ]
            });
        }

        const command = new QueryCommand({
            TableName: TRIPS_TABLE,
            IndexName: 'userId-index',
            KeyConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: { ':userId': userId },
            ScanIndexForward: false,
            Limit: 10
        });

        const result = await docClient.send(command);

        return response(200, {
            success: true,
            trips: result.Items || []
        });

    } catch (error) {
        console.error('Get trips error:', error);
        return response(500, { error: 'Error al obtener viajes' });
    }
};

/**
 * POST /api/trips
 * Save a planned trip
 */
module.exports.saveTrip = async (event) => {
    try {
        const body = JSON.parse(event.body || '{}');
        const { userId, origin, destination, route, chargingStops } = body;

        if (!userId || !origin || !destination) {
            return response(400, { error: 'Se requieren userId, origen y destino' });
        }

        const trip = {
            tripId: uuidv4(),
            userId,
            origin,
            destination,
            route,
            chargingStops,
            status: 'planned',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        // For offline mode, just return the trip
        if (process.env.IS_OFFLINE === 'true' || !TRIPS_TABLE) {
            return response(200, {
                success: true,
                trip,
                offline: true
            });
        }

        await docClient.send(new PutCommand({
            TableName: TRIPS_TABLE,
            Item: trip
        }));

        return response(200, {
            success: true,
            trip
        });

    } catch (error) {
        console.error('Save trip error:', error);
        return response(500, { error: 'Error al guardar viaje' });
    }
};
