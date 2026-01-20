/**
 * Copec EV Knowledge - RAG Handler
 * Queries AWS Bedrock Knowledge Base for contextual information
 */

const { BedrockAgentRuntimeClient, RetrieveCommand, RetrieveAndGenerateCommand } = require('@aws-sdk/client-bedrock-agent-runtime');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const fs = require('fs');
const path = require('path');

// Bearer token configuration
const BEDROCK_BEARER_TOKEN = process.env.BEDROCK_BEARER_TOKEN || '';

// Initialize clients with bearer token if available
const getClientConfig = () => {
    const config = {
        region: process.env.AWS_REGION || 'us-east-1'
    };
    
    if (BEDROCK_BEARER_TOKEN) {
        config.token = { token: BEDROCK_BEARER_TOKEN };
    }
    
    return config;
};

const bedrockAgentClient = new BedrockAgentRuntimeClient(getClientConfig());
const bedrockClient = new BedrockRuntimeClient(getClientConfig());

// Configuration
const KNOWLEDGE_BASE_ID = process.env.BEDROCK_KB_ID || '';
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
 * Load local knowledge base documents (fallback when AWS KB is not configured)
 */
function loadLocalKnowledgeBase() {
    const documentsPath = path.join(__dirname, '..', 'knowledge-base', 'documents');
    const documents = {};

    try {
        if (fs.existsSync(documentsPath)) {
            const files = fs.readdirSync(documentsPath);
            for (const file of files) {
                if (file.endsWith('.md') || file.endsWith('.txt')) {
                    const content = fs.readFileSync(path.join(documentsPath, file), 'utf-8');
                    const name = file.replace(/\.(md|txt)$/, '');
                    documents[name] = content;
                }
            }
        }
    } catch (error) {
        console.error('Error loading local knowledge base:', error);
    }

    return documents;
}

// Cache for local KB
let localKBCache = null;

/**
 * Get local knowledge base (cached)
 */
function getLocalKB() {
    if (!localKBCache) {
        localKBCache = loadLocalKnowledgeBase();
    }
    return localKBCache;
}

/**
 * Simple text search in local documents
 */
function searchLocalDocuments(query, maxResults = 3) {
    const documents = getLocalKB();
    const queryTerms = query.toLowerCase().split(/\s+/);
    const results = [];

    for (const [docName, content] of Object.entries(documents)) {
        // Split content into chunks (by sections marked with ##)
        const sections = content.split(/\n(?=##\s)/);
        
        for (const section of sections) {
            const sectionLower = section.toLowerCase();
            
            // Calculate relevance score
            let score = 0;
            for (const term of queryTerms) {
                if (sectionLower.includes(term)) {
                    score += (sectionLower.match(new RegExp(term, 'g')) || []).length;
                }
            }

            if (score > 0) {
                // Extract title from section
                const titleMatch = section.match(/^##\s*(.+)/m);
                const title = titleMatch ? titleMatch[1].trim() : docName;

                results.push({
                    document: docName,
                    title,
                    content: section.substring(0, 500) + (section.length > 500 ? '...' : ''),
                    score,
                    source: 'local'
                });
            }
        }
    }

    // Sort by score and return top results
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, maxResults);
}

/**
 * Query AWS Bedrock Knowledge Base
 */
async function queryBedrockKB(query, maxResults = 3) {
    if (!KNOWLEDGE_BASE_ID) {
        throw new Error('Knowledge Base ID not configured');
    }

    const command = new RetrieveCommand({
        knowledgeBaseId: KNOWLEDGE_BASE_ID,
        retrievalQuery: {
            text: query
        },
        retrievalConfiguration: {
            vectorSearchConfiguration: {
                numberOfResults: maxResults
            }
        }
    });

    const response = await bedrockAgentClient.send(command);
    
    return response.retrievalResults.map(result => ({
        content: result.content.text,
        score: result.score,
        source: result.location?.s3Location?.uri || 'knowledge-base',
        metadata: result.metadata
    }));
}

/**
 * Query with generation (RAG)
 */
async function queryWithGeneration(query, context = '') {
    if (!KNOWLEDGE_BASE_ID) {
        throw new Error('Knowledge Base ID not configured');
    }

    const command = new RetrieveAndGenerateCommand({
        input: {
            text: query
        },
        retrieveAndGenerateConfiguration: {
            type: 'KNOWLEDGE_BASE',
            knowledgeBaseConfiguration: {
                knowledgeBaseId: KNOWLEDGE_BASE_ID,
                modelArn: `arn:aws:bedrock:${process.env.AWS_REGION || 'us-east-1'}::foundation-model/${BEDROCK_MODEL_ID}`
            }
        }
    });

    const response = await bedrockAgentClient.send(command);
    
    return {
        answer: response.output.text,
        citations: response.citations?.map(c => ({
            text: c.generatedResponsePart?.textResponsePart?.text,
            references: c.retrievedReferences?.map(r => ({
                content: r.content?.text?.substring(0, 200),
                source: r.location?.s3Location?.uri
            }))
        }))
    };
}

/**
 * Generate answer using local KB and Claude
 */
async function generateLocalAnswer(query, context) {
    const prompt = `Eres el asistente de Copec especializado en electromovilidad. Responde la siguiente pregunta usando el contexto proporcionado.

CONTEXTO:
${context}

PREGUNTA:
${query}

INSTRUCCIONES:
- Responde de manera concisa y útil
- Si la información no está en el contexto, dilo claramente
- Usa viñetas para listas
- Incluye datos específicos cuando estén disponibles
- Máximo 3 párrafos

RESPUESTA:`;

    const command = new InvokeModelCommand({
        modelId: BEDROCK_MODEL_ID,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 1024,
            messages: [{ role: 'user', content: prompt }]
        })
    });

    const bedrockResponse = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(bedrockResponse.body));
    
    return responseBody.content[0].text;
}

/**
 * POST /api/knowledge/query
 * Query the knowledge base
 */
module.exports.query = async (event) => {
    try {
        const body = JSON.parse(event.body || '{}');
        const { query, max_results = 3, generate_answer = false } = body;

        if (!query) {
            return response(400, { error: 'Se requiere el campo "query"' });
        }

        let results;
        let answer = null;
        let source = 'local';

        // Try AWS Knowledge Base first, fall back to local
        console.log('BEDROCK_KB_ID value:', KNOWLEDGE_BASE_ID);
        if (KNOWLEDGE_BASE_ID) {
            try {
                console.log('Attempting Bedrock KB query...');
                if (generate_answer) {
                    const ragResult = await queryWithGeneration(query);
                    return response(200, {
                        success: true,
                        source: 'bedrock-kb',
                        answer: ragResult.answer,
                        citations: ragResult.citations
                    });
                } else {
                    results = await queryBedrockKB(query, max_results);
                    source = 'bedrock-kb';
                }
            } catch (kbError) {
                console.log('Bedrock KB error, falling back to local:', kbError.message);
                results = searchLocalDocuments(query, max_results);
            }
        } else {
            // Use local knowledge base
            results = searchLocalDocuments(query, max_results);
        }

        // Generate answer if requested and using local KB
        if (generate_answer && source === 'local' && results.length > 0) {
            const context = results.map(r => r.content).join('\n\n---\n\n');
            try {
                answer = await generateLocalAnswer(query, context);
            } catch (genError) {
                console.log('Answer generation error:', genError.message);
            }
        }

        return response(200, {
            success: true,
            source,
            query,
            results_count: results.length,
            results,
            answer
        });

    } catch (error) {
        console.error('Knowledge query error:', error);
        return response(500, {
            error: 'Error al consultar la base de conocimiento',
            details: error.message
        });
    }
};

/**
 * GET /api/knowledge/topics
 * Get available knowledge topics
 */
module.exports.topics = async () => {
    try {
        const documents = getLocalKB();
        
        const topics = Object.entries(documents).map(([name, content]) => {
            // Extract main headers from document
            const headers = content.match(/^##\s+.+$/gm) || [];
            
            return {
                document: name,
                title: name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                sections: headers.map(h => h.replace(/^##\s+/, '')),
                size: content.length
            };
        });

        return response(200, {
            success: true,
            topics_count: topics.length,
            topics,
            knowledge_base_id: KNOWLEDGE_BASE_ID || 'not-configured',
            using_local: !KNOWLEDGE_BASE_ID
        });

    } catch (error) {
        console.error('Topics error:', error);
        return response(500, { error: 'Error al obtener temas' });
    }
};

/**
 * POST /api/knowledge/search
 * Simple search across all documents
 */
module.exports.search = async (event) => {
    try {
        const body = JSON.parse(event.body || '{}');
        const { query, category } = body;

        if (!query) {
            return response(400, { error: 'Se requiere el campo "query"' });
        }

        let results = searchLocalDocuments(query, 10);

        // Filter by category/document if specified
        if (category) {
            const categoryMap = {
                'stations': 'stations-info',
                'policies': 'policies-rules',
                'products': 'products-services',
                'guide': 'ev-charging-guide'
            };
            const docName = categoryMap[category];
            if (docName) {
                results = results.filter(r => r.document === docName);
            }
        }

        return response(200, {
            success: true,
            query,
            category,
            results_count: results.length,
            results
        });

    } catch (error) {
        console.error('Search error:', error);
        return response(500, { error: 'Error en la búsqueda' });
    }
};

/**
 * Tool function for use by the agent
 */
module.exports.queryKnowledge = async (input) => {
    const { query, category, max_results = 3 } = input;
    
    let results = searchLocalDocuments(query, max_results);
    
    // Filter by category if specified
    if (category) {
        const categoryMap = {
            'stations': 'stations-info',
            'policies': 'policies-rules',
            'products': 'products-services',
            'guide': 'ev-charging-guide',
            'charging': 'ev-charging-guide'
        };
        const docName = categoryMap[category.toLowerCase()];
        if (docName) {
            results = results.filter(r => r.document === docName);
        }
    }

    if (results.length === 0) {
        return {
            found: false,
            message: 'No se encontró información relevante para tu consulta.',
            suggestion: 'Intenta con términos más específicos o consulta las categorías: stations, policies, products, guide'
        };
    }

    return {
        found: true,
        results_count: results.length,
        results: results.map(r => ({
            title: r.title,
            content: r.content,
            document: r.document
        }))
    };
};
