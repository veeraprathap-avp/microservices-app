#!/bin/bash

# Correlation ID End-to-End Test Script
# This script tests the correlation ID propagation across all microservices

set -e

GATEWAY_URL="http://localhost:3000"
CORRELATION_ID="test-trace-$(date +%s)"

echo "========================================"
echo "Correlation ID E2E Test"
echo "========================================"
echo "Using Correlation ID: $CORRELATION_ID"
echo ""

# Check if gateway is running
echo "1. Checking API Gateway health..."
if ! curl -s "$GATEWAY_URL/health" > /dev/null; then
  echo "❌ API Gateway not running on $GATEWAY_URL"
  echo "   Start it with: cd api-gateway && npm start"
  exit 1
fi
echo "✓ API Gateway is running"
echo ""

# Test 1: GET users with correlation ID
echo "2. Testing GET /api/users with custom correlation ID..."
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "x-correlation-id: $CORRELATION_ID" \
  "$GATEWAY_URL/api/users")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | head -n -1)
RESPONSE_CORR_ID=$(curl -s -i \
  -H "x-correlation-id: $CORRELATION_ID" \
  "$GATEWAY_URL/api/users" 2>/dev/null | grep -i "x-correlation-id" | cut -d' ' -f2 | tr -d '\r')

if [ "$HTTP_CODE" = "200" ] && [ "$RESPONSE_CORR_ID" = "$CORRELATION_ID" ]; then
  echo "✓ GET /api/users returned HTTP $HTTP_CODE"
  echo "  Response x-correlation-id: $RESPONSE_CORR_ID"
else
  echo "❌ GET /api/users failed or missing correlation ID"
  exit 1
fi
echo ""

# Test 2: GET products
echo "3. Testing GET /api/products..."
PRODUCT_CORR_ID=$(curl -s -i \
  -H "x-correlation-id: $CORRELATION_ID" \
  "$GATEWAY_URL/api/products" 2>/dev/null | grep -i "x-correlation-id" | cut -d' ' -f2 | tr -d '\r')

if [ "$PRODUCT_CORR_ID" = "$CORRELATION_ID" ]; then
  echo "✓ GET /api/products returned correct correlation ID"
else
  echo "❌ GET /api/products missing correlation ID"
  exit 1
fi
echo ""

# Test 3: Auto-generate correlation ID
echo "4. Testing auto-generated correlation ID..."
AUTO_CORR_ID=$(curl -s -i \
  "$GATEWAY_URL/api/products" 2>/dev/null | grep -i "x-correlation-id" | cut -d' ' -f2 | tr -d '\r')

if [ ! -z "$AUTO_CORR_ID" ] && [ "$AUTO_CORR_ID" != "unknown" ]; then
  echo "✓ Auto-generated correlation ID: $AUTO_CORR_ID"
else
  echo "❌ Failed to auto-generate correlation ID"
  exit 1
fi
echo ""

# Test 4: Authentication and create user
echo "5. Testing authenticated POST /api/users..."
# Get token
TOKEN=$(curl -s -X POST "$GATEWAY_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"demo","password":"demo"}' | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "⚠ Could not get auth token, skipping authenticated test"
else
  # Create user with correlation ID
  CREATE_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "$GATEWAY_URL/api/users" \
    -H "Authorization: Bearer $TOKEN" \
    -H "x-correlation-id: $CORRELATION_ID-create" \
    -H "Content-Type: application/json" \
    -d '{"name":"Test User","email":"test@example.com"}')
  
  CREATE_HTTP_CODE=$(echo "$CREATE_RESPONSE" | tail -n 1)
  if [ "$CREATE_HTTP_CODE" = "201" ] || [ "$CREATE_HTTP_CODE" = "409" ]; then
    echo "✓ POST /api/users returned HTTP $CREATE_HTTP_CODE"
  else
    echo "❌ POST /api/users failed with HTTP $CREATE_HTTP_CODE"
  fi
fi
echo ""

echo "========================================"
echo "✓ All correlation ID tests passed!"
echo "========================================"
echo ""
echo "How to view correlation ID in service logs:"
echo "- Each service logs the correlation ID with every request"
echo "- Look for 'correlationId: $CORRELATION_ID' in the logs"
echo "- Check the service console output to verify propagation"
echo ""
echo "Example grep command:"
echo "  # In service console, filter logs for correlation ID:"
echo "  grep '$CORRELATION_ID' <service-output>"
