import kafka from './client.js';
import fastJsonStringify from 'fast-json-stringify';

let producer = null;

async function getProducer() {
    if(producer) return producer;

    producer = kafka.producer({
        ack: 'all', // Ensure all replicas acknowledge
        linger: 10, // Batch messages for 100ms
        retry: {
            retries: 5, // Number of retry attempts
            initialRetryTime: 300, // Initial retry time in ms
        },
    });

    await producer.connect();
    console.log('Kafka Producer connected');

    //graceful shutdown
    const shutdown = async () => {
        await producer.disconnect();
        console.log('Kafka Producer disconnected');
        process.exit(0);
    };
    
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return producer;
}

async function publishEvent(topic, key, message) {
    const producer = await getProducer();

    try {
        await producer.send({
            topic,
            messages: [{
                key: key.toString(), // Ensure key is a string
                value: JSON.stringify(message), // Serialize message as JSON
                header: {
                    "X-Correlation-Id": message.correlationId,
                    "X-Event-Type": message.eventType,
                    "X-Schema-Version": String(message.schemaVersion),
                    "X-Source": message.source,
                    "X-Timestamp": message.timestamp,
                    "content-type": "application/json"
                }
            }]
        });
    } catch (error) {
        console.error(`Failed to publish event to topic ${topic}:`, error);
    }
}

export  {
    publishEvent,
    getProducer,
};