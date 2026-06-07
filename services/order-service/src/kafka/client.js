import {Kafka, logLevel} from 'kafkajs';

const brokers = process.env.KAFKA_BROKERS ? process.env.KAFKA_BROKERS.split(',') : ['localhost:9092'];

const kafka = new Kafka({
    clientId:  process.env.KAFKA_CLIENT_ID || 'order-service',
    brokers,
    logLevel: logLevel.WARN,

    //Retry configuration - Important for transient failures
    retry: {
        initialRetryTime: 300, // Initial retry time in ms
        retries: 8, // Number of retry attempts
    },
    //Enable for SSL/SASL production Brockers
    // ssl: process.env.KAFKA_SSL === 'true',
    // sasl: {
    //   mechanism: process.env.KAFKA_SASL_MECHANISM,
    //   username: process.env.KAFKA_SASL_USERNAME,
    //   password: process.env.KAFKA_SASL_PASSWORD,
    // },
});
export default kafka;