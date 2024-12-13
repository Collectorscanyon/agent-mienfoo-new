#!/bin/bash

# Check if WEBHOOK_SECRET is set
if [ -z "$WEBHOOK_SECRET" ]; then
    echo "Error: WEBHOOK_SECRET environment variable is not set"
    exit 1
fi

# Create the webhook payload
PAYLOAD='{
  "type": "cast.created",
  "data": {
    "hash": "testxyz123",
    "text": "Hello @mienfoo.eth, what is your favorite Pokémon card?",
    "author": {
      "username": "test_user",
      "fid": "123456"
    }
  }
}'

# Ensure the payload is properly formatted JSON and sort keys
FORMATTED_PAYLOAD=$(echo "$PAYLOAD" | jq -c '.')
SORTED_PAYLOAD=$(echo "$FORMATTED_PAYLOAD" | jq -cS '.')
SIGNATURE=$(echo -n "$SORTED_PAYLOAD" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | sed 's/^.* //')

# Debug information
echo "Debug information:"
echo "Webhook secret length: ${#WEBHOOK_SECRET}"
echo "Original payload: $PAYLOAD"
echo "Sorted payload: $SORTED_PAYLOAD"
echo "Full signature: $SIGNATURE"
echo "Payload keys (sorted): $(echo "$SORTED_PAYLOAD" | jq -r 'keys | join(",")')"

# Debug information
echo "Debug information:"
echo "Webhook secret length: ${#WEBHOOK_SECRET}"
echo "Original payload: $PAYLOAD"
echo "Sorted payload: $SORTED_PAYLOAD"
echo "Full signature: $SIGNATURE"
echo "Payload keys (sorted): $(echo "$SORTED_PAYLOAD" | jq -r 'keys | join(",")')"

# Log what we're about to do
echo "Testing webhook endpoint..."
echo "Payload: $PAYLOAD"
echo "Signature: ${SIGNATURE:0:10}..." # Only show first 10 chars for security

# Test the health endpoint first
echo -e "\nTesting health endpoint..."
curl -s "http://localhost:5000/api/webhook" | jq '.' || echo "Health check failed"

# Send the webhook request
echo -e "\nSending webhook POST request..."
curl -v -X POST \
  -H "Content-Type: application/json" \
  -H "x-neynar-signature: $SIGNATURE" \
  -d "$SORTED_PAYLOAD" \
  "http://localhost:5000/api/webhook" 2>&1

# Check the response
if [ $? -eq 0 ]; then
    echo -e "\nWebhook test completed successfully"
else
    echo -e "\nWebhook test failed"
    exit 1
fi