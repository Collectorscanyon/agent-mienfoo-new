#!/bin/bash

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

# Calculate signature using webhook secret
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | sed 's/^.* //')

# Send the webhook request
curl -X POST \
  -H "Content-Type: application/json" \
  -H "x-neynar-signature: $SIGNATURE" \
  -d "$PAYLOAD" \
  https://fee2d3b2-512d-43ca-ab39-79cc1237c4e9-00-4sxq5j4nhrsw.picard.replit.co/webhook
