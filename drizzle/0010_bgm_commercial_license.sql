UPDATE "bgm_assets"
SET
  "license_type" = 'Commercial Use Approved',
  "updated_at" = now()
WHERE "key" IN (
  'chill-intro-open',
  'cinematic-product-company-opening',
  'critical-deployment-fast-corporate',
  'elevate-luxury-hospitality',
  'morning-sunshine-focus',
  'night-patrol',
  'royal-fairy-tale-opening',
  'sweet-hope',
  'grand-opening-event',
  'journey-begins-cinematic',
  'standup-meeting-warm-jazz'
);
