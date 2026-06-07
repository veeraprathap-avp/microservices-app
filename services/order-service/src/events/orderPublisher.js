const { publishEvent } = require('../kafka/producer');
const Topics = require('../kafka/topics');
const { v4: uuidv4 } = require('uuid');

async function publishOrderCreatedEvent(order) {
    const correlationId = uuidv4(); // Generate a unique correlation ID for this event
    const eventId = uuidv4(); // Unique event ID
    const eventType = Topics.ORDER_PLACED; // Define event type
    await publishEvent(Topics.ORDER_PLACED, order.id, {
        eventType,
        messageId: uuidv4(),
        correlationId,
        eventType: "order.placed",
        schemaVersion: 1,
        timestamp: new Date().toISOString(),
        source: "nodejs-order-service",
        data: {
            ...order,
            eventId,
            correlationId,
            occurredAt: new Date().toISOString(),
            version: 1,
            eventType
        },
    });
    console.log(`[Event] ORDER_PLACED published for orderId=${order.id}`);
}

async function publishOrderCancelled(orderId, reason) {
    await publishEvent(
        Topics.ORDER_CANCELLED,
        orderId,
        {
            eventType: 'ORDER_CANCELLED',
            eventId: uuidv4(),
            occurredAt: new Date().toISOString(),
            eventId: uuidv4(),
            messageId: uuidv4(),
            correlationId: uuidv4(),
            schemaVersion: 1,
            timestamp: new Date().toISOString(),
            source: "nodejs-order-service",
            data: { orderId, reason },
        }
    );
}

module.exports = { publishOrderCreatedEvent, publishOrderCancelled };
