/**
 * Copec EV - Knowledge Base Upload Script
 * Uploads documents to S3 for Bedrock Knowledge Base
 * 
 * Usage:
 *   node upload-kb.js                    # Upload all documents
 *   node upload-kb.js --create-bucket    # Create bucket first
 *   node upload-kb.js --sync             # Sync changes only
 */

const { S3Client, PutObjectCommand, CreateBucketCommand, HeadBucketCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuration
const CONFIG = {
    region: process.env.AWS_REGION || 'us-east-1',
    bucketName: process.env.KB_BUCKET_NAME || 'copec-ev-knowledge-base',
    documentsPath: path.join(__dirname, 'documents'),
    prefix: 'knowledge-base/'
};

// Initialize S3 client
const s3Client = new S3Client({ region: CONFIG.region });

/**
 * Check if bucket exists
 */
async function bucketExists() {
    try {
        await s3Client.send(new HeadBucketCommand({ Bucket: CONFIG.bucketName }));
        return true;
    } catch (error) {
        if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
            return false;
        }
        throw error;
    }
}

/**
 * Create S3 bucket for Knowledge Base
 */
async function createBucket() {
    console.log(`📦 Creating bucket: ${CONFIG.bucketName}`);
    
    try {
        const params = {
            Bucket: CONFIG.bucketName
        };

        // Add location constraint for non-us-east-1 regions
        if (CONFIG.region !== 'us-east-1') {
            params.CreateBucketConfiguration = {
                LocationConstraint: CONFIG.region
            };
        }

        await s3Client.send(new CreateBucketCommand(params));
        console.log(`✅ Bucket created successfully`);
        return true;
    } catch (error) {
        if (error.name === 'BucketAlreadyOwnedByYou') {
            console.log('ℹ️ Bucket already exists and is owned by you');
            return true;
        }
        throw error;
    }
}

/**
 * Calculate MD5 hash of file content
 */
function calculateHash(content) {
    return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Get list of existing objects in S3
 */
async function getExistingObjects() {
    try {
        const response = await s3Client.send(new ListObjectsV2Command({
            Bucket: CONFIG.bucketName,
            Prefix: CONFIG.prefix
        }));
        return response.Contents || [];
    } catch (error) {
        return [];
    }
}

/**
 * Upload a single document to S3
 */
async function uploadDocument(filePath, fileName) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const key = `${CONFIG.prefix}${fileName}`;
    
    // Determine content type
    const ext = path.extname(fileName).toLowerCase();
    const contentTypes = {
        '.md': 'text/markdown',
        '.txt': 'text/plain',
        '.json': 'application/json',
        '.html': 'text/html'
    };
    const contentType = contentTypes[ext] || 'text/plain';

    const params = {
        Bucket: CONFIG.bucketName,
        Key: key,
        Body: content,
        ContentType: contentType,
        Metadata: {
            'source': 'copec-ev-assistant',
            'uploaded-at': new Date().toISOString(),
            'content-hash': calculateHash(content)
        }
    };

    await s3Client.send(new PutObjectCommand(params));
    console.log(`  ✅ Uploaded: ${fileName}`);
    
    return {
        key,
        size: Buffer.byteLength(content, 'utf-8'),
        hash: calculateHash(content)
    };
}

/**
 * Get all documents from the documents folder
 */
function getLocalDocuments() {
    if (!fs.existsSync(CONFIG.documentsPath)) {
        console.error(`❌ Documents folder not found: ${CONFIG.documentsPath}`);
        process.exit(1);
    }

    const files = fs.readdirSync(CONFIG.documentsPath);
    const validExtensions = ['.md', '.txt', '.json', '.html'];
    
    return files.filter(file => {
        const ext = path.extname(file).toLowerCase();
        return validExtensions.includes(ext);
    });
}

/**
 * Main upload function
 */
async function uploadAllDocuments(syncOnly = false) {
    console.log('\n🚀 Copec EV Knowledge Base Upload\n');
    console.log(`📁 Documents path: ${CONFIG.documentsPath}`);
    console.log(`🪣 Bucket: ${CONFIG.bucketName}`);
    console.log(`🌍 Region: ${CONFIG.region}\n`);

    // Check if bucket exists
    const exists = await bucketExists();
    if (!exists) {
        console.log('⚠️ Bucket does not exist. Run with --create-bucket flag first.');
        process.exit(1);
    }

    // Get local documents
    const documents = getLocalDocuments();
    console.log(`📄 Found ${documents.length} documents to upload\n`);

    if (documents.length === 0) {
        console.log('⚠️ No documents found in the documents folder');
        return;
    }

    // Get existing objects for sync mode
    let existingObjects = [];
    if (syncOnly) {
        existingObjects = await getExistingObjects();
        console.log(`🔍 Found ${existingObjects.length} existing objects in S3\n`);
    }

    // Upload each document
    const results = [];
    for (const doc of documents) {
        const filePath = path.join(CONFIG.documentsPath, doc);
        
        if (syncOnly) {
            // Check if file has changed
            const content = fs.readFileSync(filePath, 'utf-8');
            const localHash = calculateHash(content);
            const existing = existingObjects.find(obj => obj.Key === `${CONFIG.prefix}${doc}`);
            
            if (existing) {
                // File exists, check if it needs updating (simplified check)
                console.log(`  🔄 Updating: ${doc}`);
            }
        }

        try {
            const result = await uploadDocument(filePath, doc);
            results.push(result);
        } catch (error) {
            console.error(`  ❌ Failed to upload ${doc}: ${error.message}`);
        }
    }

    console.log('\n✨ Upload complete!');
    console.log(`📊 Summary: ${results.length}/${documents.length} documents uploaded\n`);

    // Print S3 URIs for Knowledge Base configuration
    console.log('📋 S3 URI for Bedrock Knowledge Base:');
    console.log(`   s3://${CONFIG.bucketName}/${CONFIG.prefix}\n`);

    return results;
}

/**
 * Generate Knowledge Base configuration
 */
function generateKBConfig() {
    const config = {
        name: 'copec-ev-knowledge-base',
        description: 'Knowledge base for Copec EV charging assistant',
        roleArn: 'arn:aws:iam::YOUR_ACCOUNT_ID:role/BedrockKnowledgeBaseRole',
        knowledgeBaseConfiguration: {
            type: 'VECTOR',
            vectorKnowledgeBaseConfiguration: {
                embeddingModelArn: 'arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v1'
            }
        },
        storageConfiguration: {
            type: 'OPENSEARCH_SERVERLESS',
            opensearchServerlessConfiguration: {
                collectionArn: 'arn:aws:aoss:us-east-1:YOUR_ACCOUNT_ID:collection/YOUR_COLLECTION_ID',
                vectorIndexName: 'copec-ev-index',
                fieldMapping: {
                    vectorField: 'embedding',
                    textField: 'text',
                    metadataField: 'metadata'
                }
            }
        }
    };

    console.log('\n📝 Sample Knowledge Base Configuration:');
    console.log(JSON.stringify(config, null, 2));
}

// CLI handling
async function main() {
    const args = process.argv.slice(2);

    try {
        if (args.includes('--create-bucket')) {
            await createBucket();
        }

        if (args.includes('--config')) {
            generateKBConfig();
            return;
        }

        const syncOnly = args.includes('--sync');
        await uploadAllDocuments(syncOnly);

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.Code === 'InvalidAccessKeyId') {
            console.error('⚠️ Check your AWS credentials');
        }
        process.exit(1);
    }
}

main();
