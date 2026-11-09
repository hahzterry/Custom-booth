PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE IF NOT EXISTS "d1_migrations"(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(1,'0001_initial.sql','2026-08-14 13:53:24');
CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL UNIQUE,
  stripe_customer_id TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO "customers" ("id","email","email_normalized","stripe_customer_id","created_at","updated_at") VALUES('9e68bb1e-1324-403d-b028-c8970165dc2b','hahz5d@pm.me','hahz5d@pm.me','cus_VZwVzJq23L6ZU9','2026-11-06T12:52:25.605Z','2026-11-06T12:52:25.605Z');
CREATE TABLE IF NOT EXISTS "checkout_requests_old" (
  id TEXT PRIMARY KEY,
  idempotency_key_hash TEXT NOT NULL UNIQUE,
  request_fingerprint TEXT NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN (
    'PERSONAL_6_MONTH',
    'PERSONAL_12_MONTH',
    'FOUNDING_LIFETIME'
  )),
  email_normalized TEXT,
  stripe_price_id TEXT NOT NULL,
  stripe_checkout_session_id TEXT UNIQUE,
  stripe_checkout_url TEXT,
  stripe_checkout_expires_at TEXT,
  founding_reservation_id TEXT,
  status TEXT NOT NULL CHECK (status IN (
    'creating',
    'ready',
    'completed',
    'expired',
    'failed'
  )),
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO "checkout_requests_old" ("id","idempotency_key_hash","request_fingerprint","plan","email_normalized","stripe_price_id","stripe_checkout_session_id","stripe_checkout_url","stripe_checkout_expires_at","founding_reservation_id","status","last_error_code","created_at","updated_at") VALUES('2f8d0746-0e27-4c94-b41d-49fbffc2b095','282e94413774b123e74e6695e6c3e4fd33f5fc37f3c5b1d4e47ceb81e2ae32fa','e6e61ee8c1231b7f14935cb5e62efee7cd73cee475820d22407ca1c7eb297f9b','PERSONAL_12_MONTH',NULL,'price_1U4M3wEC5zyE604b1JBP8VZi','cs_live_a1JqeTVJDwk6MOzIvf9e1nRyJfcoU1Znylh89pAWGqMfJvIPVTW8zHdvsl','https://checkout.stripe.com/c/pay/cs_live_a1JqeTVJDwk6MOzIvf9e1nRyJfcoU1Znylh89pAWGqMfJvIPVTW8zHdvsl#fidnandhYHdWcXxpYCc%2FJ2FgY2RwaXEnKSdicGRmZGhqaWBTZHdsZGtxJz8nZmprcXdqaScpJ2R1bE5gfCc%2FJ3VuWmlsc2BaMDRLMFFof0BGMH98QDM1MWdNQEFEVnNzfDd9MjZwSlJERmZJSzdybnB9QWlSUkRQaH1Ma3ZTTFx9QEBkcDZKX3dQVVZqXWBqNUtyUG5dUGZyYExWXFxoMmM1NU5wQnZkMHZ3JyknY3dqaFZgd3Ngdyc%2FcXdwYCknZ2RmbmJ3anBrYUZqaWp3Jz8nJmNjY2NjYycpJ2lkfGpwcVF8dWAnPyd2bGtiaWBabHFgaCcpJ2BrZGdpYFVpZGZgbWppYWB3dic%2FcXdwYHgl','2026-08-16T16:19:19.000Z',NULL,'ready',NULL,'2026-08-15T16:19:18.767Z','2026-08-15T16:19:19.288Z');
INSERT INTO "checkout_requests_old" ("id","idempotency_key_hash","request_fingerprint","plan","email_normalized","stripe_price_id","stripe_checkout_session_id","stripe_checkout_url","stripe_checkout_expires_at","founding_reservation_id","status","last_error_code","created_at","updated_at") VALUES('d19e5214-29b6-41ac-80a7-51c69c4fb0ce','e29eed193498cf1cbddda70f43989da9e0fcfc7fd404adcd44a6efed5b015bec','953d74dc12cd7dd3ef04de5dbe33f9b89ae96bcc2b022930558dd4b4bd8abca6','PERSONAL_6_MONTH',NULL,'price_1U4M5REC5zyE604bd4TMOBUh','cs_live_a1sZwNXYGBW6B9bgEFvxO3UNeyzCsjSiL8UeVk9J4BmmW9AYaMVEhrP0dG','https://checkout.stripe.com/c/pay/cs_live_a1sZwNXYGBW6B9bgEFvxO3UNeyzCsjSiL8UeVk9J4BmmW9AYaMVEhrP0dG#fidnandhYHdWcXxpYCc%2FJ2FgY2RwaXEnKSdicGRmZGhqaWBTZHdsZGtxJz8nZmprcXdqaScpJ2R1bE5gfCc%2FJ3VuWmlsc2BaMDRLMFFof0BGMH98QDM1MWdNQEFEVnNzfDd9MjZwSlJERmZJSzdybnB9QWlSUkRQaH1Ma3ZTTFx9QEBkcDZKX3dQVVZqXWBqNUtyUG5dUGZyYExWXFxoMmM1NU5wQnZkMHZ3JyknY3dqaFZgd3Ngdyc%2FcXdwYCknZ2RmbmJ3anBrYUZqaWp3Jz8nJmNjY2NjYycpJ2lkfGpwcVF8dWAnPyd2bGtiaWBabHFgaCcpJ2BrZGdpYFVpZGZgbWppYWB3dic%2FcXdwYHgl','2026-08-16T16:19:20.000Z',NULL,'ready',NULL,'2026-08-15T16:19:20.040Z','2026-08-15T16:19:20.557Z');
INSERT INTO "checkout_requests_old" ("id","idempotency_key_hash","request_fingerprint","plan","email_normalized","stripe_price_id","stripe_checkout_session_id","stripe_checkout_url","stripe_checkout_expires_at","founding_reservation_id","status","last_error_code","created_at","updated_at") VALUES('26ab26c6-e2e5-423f-9dfc-a707f87792c8','6399c6341239df8db758e36ed8e4fc63505a591f7c8e8af463c39873d61d62e3','953d74dc12cd7dd3ef04de5dbe33f9b89ae96bcc2b022930558dd4b4bd8abca6','PERSONAL_6_MONTH',NULL,'price_1U4M5REC5zyE604bd4TMOBUh','cs_live_a1NLN4c4eyoQ7gTA9mFiGuy0UzF3DWPuKVehlhWADsY4AI8byqmSpcNlCU','https://checkout.stripe.com/c/pay/cs_live_a1NLN4c4eyoQ7gTA9mFiGuy0UzF3DWPuKVehlhWADsY4AI8byqmSpcNlCU#fidnandhYHdWcXxpYCc%2FJ2FgY2RwaXEnKSdicGRmZGhqaWBTZHdsZGtxJz8nZmprcXdqaScpJ2R1bE5gfCc%2FJ3VuWmlsc2BaMDRLMFFof0BGMH98QDM1MWdNQEFEVnNzfDd9MjZwSlJERmZJSzdybnB9QWlSUkRQaH1Ma3ZTTFx9QEBkcDZKX3dQVVZqXWBqNUtyUG5dUGZyYExWXFxoMmM1NU5wQnZkMHZ3JyknY3dqaFZgd3Ngdyc%2FcXdwYCknZ2RmbmJ3anBrYUZqaWp3Jz8nJmNjY2NjYycpJ2lkfGpwcVF8dWAnPyd2bGtiaWBabHFgaCcpJ2BrZGdpYFVpZGZgbWppYWB3dic%2FcXdwYHgl','2026-08-16T16:19:41.000Z',NULL,'ready',NULL,'2026-08-15T16:19:40.939Z','2026-08-15T16:19:41.382Z');
INSERT INTO "checkout_requests_old" ("id","idempotency_key_hash","request_fingerprint","plan","email_normalized","stripe_price_id","stripe_checkout_session_id","stripe_checkout_url","stripe_checkout_expires_at","founding_reservation_id","status","last_error_code","created_at","updated_at") VALUES('97c51bb4-3b32-4005-b49d-5ecfe77b1ce5','853460959a50dc604738873f2cbf9dcd2648347f46ebe4c7c236441240ff3ac2','c930c9fb24b6d4514ec134771b1be90de5bff69c3667e46ea318c75813bfa424','FOUNDING_LIFETIME',NULL,'price_1U4M7KEC5zyE604bHv7q8qov','cs_live_a1isri8s4Nu7VLSKsMJfAKLqgWUkDMYkaIZOi5SrSivvw7txNft1AqqKlM','https://checkout.stripe.com/c/pay/cs_live_a1isri8s4Nu7VLSKsMJfAKLqgWUkDMYkaIZOi5SrSivvw7txNft1AqqKlM#fidnandhYHdWcXxpYCc%2FJ2FgY2RwaXEnKSdicGRmZGhqaWBTZHdsZGtxJz8nZmprcXdqaScpJ2R1bE5gfCc%2FJ3VuWmlsc2BaMDRLMFFof0BGMH98QDM1MWdNQEFEVnNzfDd9MjZwSlJERmZJSzdybnB9QWlSUkRQaH1Ma3ZTTFx9QEBkcDZKX3dQVVZqXWBqNUtyUG5dUGZyYExWXFxoMmM1NU5wQnZkMHZ3JyknY3dqaFZgd3Ngdyc%2FcXdwYCknZ2RmbmJ3anBrYUZqaWp3Jz8nJmNjY2NjYycpJ2lkfGpwcVF8dWAnPyd2bGtiaWBabHFgaCcpJ2BrZGdpYFVpZGZgbWppYWB3dic%2FcXdwYHgl','2026-08-15T16:50:52.000Z','541e1568-a5b9-4532-8cb2-b8b2dec050b2','expired',NULL,'2026-08-15T16:19:52.285Z','2026-08-15T16:50:53.602Z');
INSERT INTO "checkout_requests_old" ("id","idempotency_key_hash","request_fingerprint","plan","email_normalized","stripe_price_id","stripe_checkout_session_id","stripe_checkout_url","stripe_checkout_expires_at","founding_reservation_id","status","last_error_code","created_at","updated_at") VALUES('3585dd1a-25c4-4de0-8c86-294a9984703e','5f6591a781b9ebab17589ee8d603f3974ae653dd5c8ad53af082df93f4ed1e09','e6e61ee8c1231b7f14935cb5e62efee7cd73cee475820d22407ca1c7eb297f9b','PERSONAL_12_MONTH',NULL,'price_1U4M3wEC5zyE604b1JBP8VZi','cs_live_a1FGSMeHxg2DF3t7pifDutjy2aAltNVhruma8JE12xdn0Htp3Yr627d4UR','https://checkout.stripe.com/c/pay/cs_live_a1FGSMeHxg2DF3t7pifDutjy2aAltNVhruma8JE12xdn0Htp3Yr627d4UR#fidnandhYHdWcXxpYCc%2FJ2FgY2RwaXEnKSdicGRmZGhqaWBTZHdsZGtxJz8nZmprcXdqaScpJ2R1bE5gfCc%2FJ3VuWmlsc2BaMDRLMFFof0BGMH98QDM1MWdNQEFEVnNzfDd9MjZwSlJERmZJSzdybnB9QWlSUkRQaH1Ma3ZTTFx9QEBkcDZKX3dQVVZqXWBqNUtyUG5dUGZyYExWXFxoMmM1NU5wQnZkMHZ3JyknY3dqaFZgd3Ngdyc%2FcXdwYCknZ2RmbmJ3anBrYUZqaWp3Jz8nJmNjY2NjYycpJ2lkfGpwcVF8dWAnPyd2bGtiaWBabHFgaCcpJ2BrZGdpYFVpZGZgbWppYWB3dic%2FcXdwYHgl','2026-08-16T16:37:35.000Z',NULL,'ready',NULL,'2026-08-15T16:37:35.543Z','2026-08-15T16:37:36.057Z');
CREATE TABLE founding_reservations (
  id TEXT PRIMARY KEY,
  checkout_request_id TEXT NOT NULL UNIQUE REFERENCES "checkout_requests_old"(id),
  stripe_checkout_session_id TEXT UNIQUE,
  status TEXT NOT NULL CHECK (status IN (
    'reserved',
    'checkout_created',
    'converted',
    'released'
  )),
  reserved_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  converted_at TEXT
);
INSERT INTO "founding_reservations" ("id","checkout_request_id","stripe_checkout_session_id","status","reserved_at","expires_at","converted_at") VALUES('541e1568-a5b9-4532-8cb2-b8b2dec050b2','97c51bb4-3b32-4005-b49d-5ecfe77b1ce5','cs_live_a1isri8s4Nu7VLSKsMJfAKLqgWUkDMYkaIZOi5SrSivvw7txNft1AqqKlM','released','2026-08-15T16:19:52.285Z','2026-08-15T16:54:52.285Z',NULL);
CREATE TABLE stripe_webhook_events (
  stripe_event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('received', 'succeeded')),
  attempts INTEGER NOT NULL DEFAULT 1 CHECK (attempts > 0),
  stripe_created_at TEXT NOT NULL,
  first_received_at TEXT NOT NULL,
  last_received_at TEXT NOT NULL,
  processed_at TEXT
);
INSERT INTO "stripe_webhook_events" ("stripe_event_id","event_type","status","attempts","stripe_created_at","first_received_at","last_received_at","processed_at") VALUES('evt_1U4knJEC5zyE604blNk5TT7S','checkout.session.expired','succeeded',1,'2026-08-15T16:50:53.000Z','2026-08-15T16:50:53.602Z','2026-08-15T16:50:53.602Z','2026-08-15T16:50:53.602Z');
INSERT INTO "stripe_webhook_events" ("stripe_event_id","event_type","status","attempts","stripe_created_at","first_received_at","last_received_at","processed_at") VALUES('evt_1U4lqMEC5zyE604bbXkt94qI','checkout.session.expired','succeeded',1,'2026-08-15T17:58:06.000Z','2026-08-15T17:58:06.859Z','2026-08-15T17:58:06.859Z','2026-08-15T17:58:06.859Z');
INSERT INTO "stripe_webhook_events" ("stripe_event_id","event_type","status","attempts","stripe_created_at","first_received_at","last_received_at","processed_at") VALUES('evt_1U56mKEC5zyE604bhcvc45l0','checkout.session.expired','succeeded',1,'2026-08-16T16:19:20.000Z','2026-08-16T16:19:20.942Z','2026-08-16T16:19:20.942Z','2026-08-16T16:19:20.942Z');
INSERT INTO "stripe_webhook_events" ("stripe_event_id","event_type","status","attempts","stripe_created_at","first_received_at","last_received_at","processed_at") VALUES('evt_1U56mLEC5zyE604broKVERee','checkout.session.expired','succeeded',1,'2026-08-16T16:19:21.000Z','2026-08-16T16:19:21.501Z','2026-08-16T16:19:21.501Z','2026-08-16T16:19:21.501Z');
INSERT INTO "stripe_webhook_events" ("stripe_event_id","event_type","status","attempts","stripe_created_at","first_received_at","last_received_at","processed_at") VALUES('evt_1U56mgEC5zyE604bjSr5Uf7s','checkout.session.expired','succeeded',1,'2026-08-16T16:19:42.000Z','2026-08-16T16:19:42.507Z','2026-08-16T16:19:42.507Z','2026-08-16T16:19:42.507Z');
INSERT INTO "stripe_webhook_events" ("stripe_event_id","event_type","status","attempts","stripe_created_at","first_received_at","last_received_at","processed_at") VALUES('evt_1U5740EC5zyE604bP8JtvScQ','checkout.session.expired','succeeded',1,'2026-08-16T16:37:36.000Z','2026-08-16T16:37:36.788Z','2026-08-16T16:37:36.788Z','2026-08-16T16:37:36.788Z');
INSERT INTO "stripe_webhook_events" ("stripe_event_id","event_type","status","attempts","stripe_created_at","first_received_at","last_received_at","processed_at") VALUES('evt_1U57TtEC5zyE604bsSHLavzs','checkout.session.expired','succeeded',1,'2026-08-16T17:04:21.000Z','2026-08-16T17:04:21.599Z','2026-08-16T17:04:21.599Z','2026-08-16T17:04:21.599Z');
INSERT INTO "stripe_webhook_events" ("stripe_event_id","event_type","status","attempts","stripe_created_at","first_received_at","last_received_at","processed_at") VALUES('evt_1U5axREC5zyE604beAYPZ6Y3','checkout.session.expired','succeeded',1,'2026-08-18T00:32:49.000Z','2026-08-18T00:32:50.029Z','2026-08-18T00:32:50.029Z','2026-08-18T00:32:50.029Z');
INSERT INTO "stripe_webhook_events" ("stripe_event_id","event_type","status","attempts","stripe_created_at","first_received_at","last_received_at","processed_at") VALUES('evt_1U5axxEC5zyE604bJcGOwgKY','checkout.session.expired','succeeded',1,'2026-08-18T00:33:21.000Z','2026-08-18T00:33:21.849Z','2026-08-18T00:33:21.849Z','2026-08-18T00:33:21.849Z');
INSERT INTO "stripe_webhook_events" ("stripe_event_id","event_type","status","attempts","stripe_created_at","first_received_at","last_received_at","processed_at") VALUES('evt_1U9C1eEC5zyE604btSGxSIIM','checkout.session.expired','succeeded',1,'2026-08-27T22:44:02.000Z','2026-08-27T22:44:02.643Z','2026-08-27T22:44:02.643Z','2026-08-27T22:44:02.643Z');
INSERT INTO "stripe_webhook_events" ("stripe_event_id","event_type","status","attempts","stripe_created_at","first_received_at","last_received_at","processed_at") VALUES('evt_1U9C2FEC5zyE604bJJKT2gqW','checkout.session.expired','succeeded',1,'2026-08-27T22:44:39.000Z','2026-08-27T22:44:39.478Z','2026-08-27T22:44:39.478Z','2026-08-27T22:44:39.478Z');
INSERT INTO "stripe_webhook_events" ("stripe_event_id","event_type","status","attempts","stripe_created_at","first_received_at","last_received_at","processed_at") VALUES('evt_1U9wVNEC5zyE604bONSFIHtM','checkout.session.expired','succeeded',1,'2026-08-30T00:21:49.000Z','2026-08-30T00:21:49.948Z','2026-08-30T00:21:49.948Z','2026-08-30T00:21:49.948Z');
INSERT INTO "stripe_webhook_events" ("stripe_event_id","event_type","status","attempts","stripe_created_at","first_received_at","last_received_at","processed_at") VALUES('evt_1UGI5rEC5zyE604bMLTknNck','checkout.session.expired','succeeded',1,'2026-09-16T12:37:43.000Z','2026-09-16T12:37:43.402Z','2026-09-16T12:37:43.402Z','2026-09-16T12:37:43.402Z');
INSERT INTO "stripe_webhook_events" ("stripe_event_id","event_type","status","attempts","stripe_created_at","first_received_at","last_received_at","processed_at") VALUES('evt_1UGI6OEC5zyE604bwnMho9qi','checkout.session.expired','succeeded',1,'2026-09-16T12:38:16.000Z','2026-09-16T12:38:16.281Z','2026-09-16T12:38:16.281Z','2026-09-16T12:38:16.281Z');
INSERT INTO "stripe_webhook_events" ("stripe_event_id","event_type","status","attempts","stripe_created_at","first_received_at","last_received_at","processed_at") VALUES('evt_1UGLFeEC5zyE604bQUM8qaST','checkout.session.expired','succeeded',1,'2026-09-16T16:00:02.000Z','2026-09-16T16:00:02.621Z','2026-09-16T16:00:02.621Z','2026-09-16T16:00:02.621Z');
INSERT INTO "stripe_webhook_events" ("stripe_event_id","event_type","status","attempts","stripe_created_at","first_received_at","last_received_at","processed_at") VALUES('evt_1UGxZNEC5zyE604b3VkFIDAh','checkout.session.expired','succeeded',1,'2026-09-18T08:54:57.000Z','2026-09-18T08:54:57.306Z','2026-09-18T08:54:57.306Z','2026-09-18T08:54:57.306Z');
INSERT INTO "stripe_webhook_events" ("stripe_event_id","event_type","status","attempts","stripe_created_at","first_received_at","last_received_at","processed_at") VALUES('evt_1UHOvCEC5zyE604bkDbtsItp','checkout.session.expired','succeeded',1,'2026-09-19T14:07:18.000Z','2026-09-19T14:07:19.186Z','2026-09-19T14:07:19.186Z','2026-09-19T14:07:19.186Z');
INSERT INTO "stripe_webhook_events" ("stripe_event_id","event_type","status","attempts","stripe_created_at","first_received_at","last_received_at","processed_at") VALUES('evt_1UHQ4dEC5zyE604baQPKt0EL','checkout.session.expired','succeeded',1,'2026-09-19T15:21:07.000Z','2026-09-19T15:21:07.258Z','2026-09-19T15:21:07.258Z','2026-09-19T15:21:07.258Z');
INSERT INTO "stripe_webhook_events" ("stripe_event_id","event_type","status","attempts","stripe_created_at","first_received_at","last_received_at","processed_at") VALUES('evt_1UMcw7EC5zyE604b6KMgvRFk','checkout.session.expired','succeeded',1,'2026-10-04T00:05:51.000Z','2026-10-04T00:05:51.487Z','2026-10-04T00:05:51.487Z','2026-10-04T00:05:51.487Z');
INSERT INTO "stripe_webhook_events" ("stripe_event_id","event_type","status","attempts","stripe_created_at","first_received_at","last_received_at","processed_at") VALUES('evt_1UMd64EC5zyE604bWJelu5E2','checkout.session.expired','succeeded',1,'2026-10-04T00:16:08.000Z','2026-10-04T00:16:08.234Z','2026-10-04T00:16:08.234Z','2026-10-04T00:16:08.234Z');
INSERT INTO "stripe_webhook_events" ("stripe_event_id","event_type","status","attempts","stripe_created_at","first_received_at","last_received_at","processed_at") VALUES('evt_1UN0VwEC5zyE604bwnuwMmJy','checkout.session.expired','succeeded',1,'2026-10-05T01:16:24.000Z','2026-10-05T01:16:25.201Z','2026-10-05T01:16:25.201Z','2026-10-05T01:16:25.201Z');
INSERT INTO "stripe_webhook_events" ("stripe_event_id","event_type","status","attempts","stripe_created_at","first_received_at","last_received_at","processed_at") VALUES('evt_1UNBm4EC5zyE604bXUgCD5g7','checkout.session.expired','succeeded',1,'2026-10-05T13:17:48.000Z','2026-10-05T13:17:48.742Z','2026-10-05T13:17:48.742Z','2026-10-05T13:17:48.742Z');
INSERT INTO "stripe_webhook_events" ("stripe_event_id","event_type","status","attempts","stripe_created_at","first_received_at","last_received_at","processed_at") VALUES('evt_1UNBoNEC5zyE604blZ6ZLQQ8','checkout.session.expired','succeeded',1,'2026-10-05T13:20:11.000Z','2026-10-05T13:20:11.188Z','2026-10-05T13:20:11.188Z','2026-10-05T13:20:11.188Z');
INSERT INTO "stripe_webhook_events" ("stripe_event_id","event_type","status","attempts","stripe_created_at","first_received_at","last_received_at","processed_at") VALUES('evt_1UNBurEC5zyE604b56JZsvcV','checkout.session.expired','succeeded',1,'2026-10-05T13:26:53.000Z','2026-10-05T13:26:53.446Z','2026-10-05T13:26:53.446Z','2026-10-05T13:26:53.446Z');
INSERT INTO "stripe_webhook_events" ("stripe_event_id","event_type","status","attempts","stripe_created_at","first_received_at","last_received_at","processed_at") VALUES('evt_1UNk0ZEC5zyE604bfQZyico5','checkout.session.expired','succeeded',1,'2026-10-07T01:51:03.000Z','2026-10-07T01:51:04.251Z','2026-10-07T01:51:04.251Z','2026-10-07T01:51:04.251Z');
INSERT INTO "stripe_webhook_events" ("stripe_event_id","event_type","status","attempts","stripe_created_at","first_received_at","last_received_at","processed_at") VALUES('evt_1UOpedEC5zyE604bJtIZHkNn','checkout.session.expired','succeeded',1,'2026-10-10T02:04:55.000Z','2026-10-10T02:04:55.348Z','2026-10-10T02:04:55.348Z','2026-10-10T02:04:55.348Z');
INSERT INTO "stripe_webhook_events" ("stripe_event_id","event_type","status","attempts","stripe_created_at","first_received_at","last_received_at","processed_at") VALUES('evt_1UOsu9EC5zyE604b0cFepXRF','checkout.session.expired','succeeded',1,'2026-10-10T05:33:09.000Z','2026-10-10T05:33:09.508Z','2026-10-10T05:33:09.508Z','2026-10-10T05:33:09.508Z');
INSERT INTO "stripe_webhook_events" ("stripe_event_id","event_type","status","attempts","stripe_created_at","first_received_at","last_received_at","processed_at") VALUES('evt_1UOsvMEC5zyE604bdNauDcnp','checkout.session.expired','succeeded',1,'2026-10-10T05:34:24.000Z','2026-10-10T05:34:24.456Z','2026-10-10T05:34:24.456Z','2026-10-10T05:34:24.456Z');
INSERT INTO "stripe_webhook_events" ("stripe_event_id","event_type","status","attempts","stripe_created_at","first_received_at","last_received_at","processed_at") VALUES('evt_1UOswKEC5zyE604bheZZzRTX','checkout.session.expired','succeeded',1,'2026-10-10T05:35:24.000Z','2026-10-10T05:35:24.370Z','2026-10-10T05:35:24.370Z','2026-10-10T05:35:24.370Z');
INSERT INTO "stripe_webhook_events" ("stripe_event_id","event_type","status","attempts","stripe_created_at","first_received_at","last_received_at","processed_at") VALUES('evt_1UTiJKEC5zyE604bvaPLwVXN','checkout.session.expired','succeeded',1,'2026-10-23T13:15:06.000Z','2026-10-23T13:15:06.677Z','2026-10-23T13:15:06.677Z','2026-10-23T13:15:06.677Z');
INSERT INTO "stripe_webhook_events" ("stripe_event_id","event_type","status","attempts","stripe_created_at","first_received_at","last_received_at","processed_at") VALUES('evt_1UWuNeEC5zyE604bjCklbul1','checkout.session.expired','succeeded',1,'2026-11-01T08:44:46.000Z','2026-11-01T08:44:47.119Z','2026-11-01T08:44:47.119Z','2026-11-01T08:44:47.119Z');
INSERT INTO "stripe_webhook_events" ("stripe_event_id","event_type","status","attempts","stripe_created_at","first_received_at","last_received_at","processed_at") VALUES('evt_1UWzMsEC5zyE604bQZAnnmtN','checkout.session.expired','succeeded',1,'2026-11-01T14:04:18.000Z','2026-11-01T14:04:19.102Z','2026-11-01T14:04:19.102Z','2026-11-01T14:04:19.102Z');
INSERT INTO "stripe_webhook_events" ("stripe_event_id","event_type","status","attempts","stripe_created_at","first_received_at","last_received_at","processed_at") VALUES('evt_1UXM9PEC5zyE604bPrVrAI8g','checkout.session.expired','succeeded',1,'2026-11-02T14:23:55.000Z','2026-11-02T14:23:55.721Z','2026-11-02T14:23:55.721Z','2026-11-02T14:23:55.721Z');
INSERT INTO "stripe_webhook_events" ("stripe_event_id","event_type","status","attempts","stripe_created_at","first_received_at","last_received_at","processed_at") VALUES('evt_1UXTP8EC5zyE604b0Fd738xw','checkout.session.expired','succeeded',1,'2026-11-02T22:08:38.000Z','2026-11-02T22:08:39.619Z','2026-11-02T22:08:39.619Z','2026-11-02T22:08:39.619Z');
INSERT INTO "stripe_webhook_events" ("stripe_event_id","event_type","status","attempts","stripe_created_at","first_received_at","last_received_at","processed_at") VALUES('evt_1UYDcgEC5zyE604biPs0SoKy','checkout.session.expired','succeeded',1,'2026-11-04T23:29:42.000Z','2026-11-04T23:29:43.267Z','2026-11-04T23:29:43.267Z','2026-11-04T23:29:43.267Z');
INSERT INTO "stripe_webhook_events" ("stripe_event_id","event_type","status","attempts","stripe_created_at","first_received_at","last_received_at","processed_at") VALUES('evt_1UYQ3aEC5zyE604bwiODXAAk','checkout.session.expired','succeeded',1,'2026-11-05T12:46:18.000Z','2026-11-05T12:46:18.226Z','2026-11-05T12:46:18.226Z','2026-11-05T12:46:18.226Z');
INSERT INTO "stripe_webhook_events" ("stripe_event_id","event_type","status","attempts","stripe_created_at","first_received_at","last_received_at","processed_at") VALUES('evt_1UYQlpEC5zyE604b8IVaxIUG','checkout.session.expired','succeeded',1,'2026-11-05T13:32:01.000Z','2026-11-05T13:32:02.182Z','2026-11-05T13:32:02.182Z','2026-11-05T13:32:02.182Z');
INSERT INTO "stripe_webhook_events" ("stripe_event_id","event_type","status","attempts","stripe_created_at","first_received_at","last_received_at","processed_at") VALUES('evt_1UYmd3EC5zyE604bjFj1DbMw','checkout.session.completed','succeeded',1,'2026-11-06T12:52:24.000Z','2026-11-06T12:52:25.605Z','2026-11-06T12:52:25.605Z','2026-11-06T12:52:25.605Z');
CREATE TABLE purchases (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  stripe_checkout_session_id TEXT NOT NULL UNIQUE,
  stripe_payment_intent_id TEXT UNIQUE,
  stripe_price_id TEXT,
  plan TEXT NOT NULL CHECK (plan IN (
    'PERSONAL_6_MONTH',
    'PERSONAL_12_MONTH',
    'FOUNDING_LIFETIME'
  )),
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  currency TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('paid', 'refunded', 'disputed')),
  last_stripe_event_created INTEGER NOT NULL,
  paid_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE entitlements (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  purchase_id TEXT NOT NULL UNIQUE REFERENCES purchases(id),
  plan TEXT NOT NULL CHECK (plan IN (
    'PERSONAL_6_MONTH',
    'PERSONAL_12_MONTH',
    'FOUNDING_LIFETIME'
  )),
  starts_at TEXT NOT NULL,
  expires_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  CHECK (
    (plan = 'FOUNDING_LIFETIME' AND expires_at IS NULL) OR
    (plan != 'FOUNDING_LIFETIME' AND expires_at IS NOT NULL)
  )
);
CREATE TABLE entitlement_restore_tokens (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE business_organisations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE business_api_keys (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES business_organisations(id),
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);
CREATE TABLE business_events (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES business_organisations(id),
  public_id TEXT NOT NULL UNIQUE,
  public_access_token_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  event_date TEXT,
  brand_name TEXT NOT NULL,
  primary_colour TEXT NOT NULL DEFAULT '#ff4f8b',
  secondary_colour TEXT NOT NULL DEFAULT '#111111',
  welcome_heading TEXT NOT NULL,
  welcome_cta TEXT NOT NULL DEFAULT 'START',
  welcome_hint TEXT NOT NULL DEFAULT 'tap to begin',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'live', 'archived')),
  allow_share INTEGER NOT NULL DEFAULT 1 CHECK (allow_share IN (0, 1)),
  allow_download INTEGER NOT NULL DEFAULT 1 CHECK (allow_download IN (0, 1)),
  delivery_mode TEXT NOT NULL DEFAULT 'immediate' CHECK (delivery_mode IN (
    'immediate',
    'email_gate',
    'configured'
  )),
  collect_email INTEGER NOT NULL DEFAULT 0 CHECK (collect_email IN (0, 1)),
  require_email_before_completion INTEGER NOT NULL DEFAULT 0 CHECK (require_email_before_completion IN (0, 1)),
  marketing_consent_enabled INTEGER NOT NULL DEFAULT 0 CHECK (marketing_consent_enabled IN (0, 1)),
  photo_use_consent_enabled INTEGER NOT NULL DEFAULT 0 CHECK (photo_use_consent_enabled IN (0, 1)),
  collect_consented_photos INTEGER NOT NULL DEFAULT 0 CHECK (collect_consented_photos IN (0, 1)),
  marketing_consent_wording TEXT,
  photo_use_consent_wording TEXT,
  consent_wording_version INTEGER NOT NULL DEFAULT 1 CHECK (consent_wording_version > 0),
  white_label INTEGER NOT NULL DEFAULT 0 CHECK (white_label IN (0, 1)),
  active_logo_asset_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (require_email_before_completion = 0 OR collect_email = 1),
  CHECK (marketing_consent_enabled = 0 OR collect_email = 1),
  CHECK (collect_consented_photos = 0 OR photo_use_consent_enabled = 1),
  CHECK (
    marketing_consent_enabled = 0 OR
    COALESCE(LENGTH(TRIM(marketing_consent_wording)), 0) > 0
  ),
  CHECK (
    photo_use_consent_enabled = 0 OR
    COALESCE(LENGTH(TRIM(photo_use_consent_wording)), 0) > 0
  ),
  CHECK (delivery_mode != 'email_gate' OR (
    collect_email = 1 AND require_email_before_completion = 1
  ))
);
CREATE TABLE event_consent_versions (
  event_id TEXT NOT NULL REFERENCES business_events(id),
  version INTEGER NOT NULL CHECK (version > 0),
  marketing_consent_enabled INTEGER NOT NULL CHECK (marketing_consent_enabled IN (0, 1)),
  photo_use_consent_enabled INTEGER NOT NULL CHECK (photo_use_consent_enabled IN (0, 1)),
  marketing_consent_wording TEXT,
  photo_use_consent_wording TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (event_id, version)
);
CREATE TABLE attendees (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES business_events(id),
  guest_session_id TEXT NOT NULL,
  email TEXT,
  email_normalized TEXT,
  email_collected_at TEXT,
  marketing_consent INTEGER CHECK (marketing_consent IN (0, 1) OR marketing_consent IS NULL),
  photo_use_consent INTEGER CHECK (photo_use_consent IN (0, 1) OR photo_use_consent IS NULL),
  consent_wording_version INTEGER,
  marketing_consent_wording TEXT,
  photo_use_consent_wording TEXT,
  consent_timestamp TEXT,
  photo_use_consent_revoked_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (event_id, guest_session_id),
  FOREIGN KEY (event_id, consent_wording_version)
    REFERENCES event_consent_versions(event_id, version),
  CHECK (email IS NOT NULL OR email_normalized IS NULL),
  CHECK (
    marketing_consent IS NULL OR (
      consent_wording_version IS NOT NULL AND
      COALESCE(LENGTH(TRIM(marketing_consent_wording)), 0) > 0 AND
      consent_timestamp IS NOT NULL
    )
  ),
  CHECK (
    photo_use_consent IS NULL OR (
      consent_wording_version IS NOT NULL AND
      COALESCE(LENGTH(TRIM(photo_use_consent_wording)), 0) > 0 AND
      consent_timestamp IS NOT NULL
    )
  )
);
CREATE TABLE upload_authorisations (
  id TEXT PRIMARY KEY,
  purpose TEXT NOT NULL CHECK (purpose IN ('brand_asset', 'guest_output')),
  organisation_id TEXT NOT NULL REFERENCES business_organisations(id),
  event_id TEXT NOT NULL REFERENCES business_events(id),
  attendee_id TEXT REFERENCES attendees(id),
  asset_kind TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  sha256_hex TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'authorised' CHECK (state IN (
    'authorised',
    'uploading',
    'stored',
    'failed'
  )),
  claim_id TEXT,
  claim_expires_at TEXT,
  last_error_code TEXT,
  r2_etag TEXT,
  used_at TEXT,
  created_at TEXT NOT NULL,
  CHECK (
    (purpose = 'brand_asset' AND attendee_id IS NULL) OR
    (purpose = 'guest_output' AND attendee_id IS NOT NULL)
  )
);
CREATE TABLE brand_assets (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES business_organisations(id),
  event_id TEXT NOT NULL REFERENCES business_events(id),
  upload_authorisation_id TEXT NOT NULL UNIQUE REFERENCES upload_authorisations(id),
  kind TEXT NOT NULL CHECK (kind IN ('logo')),
  object_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/png', 'image/jpeg')),
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  sha256_hex TEXT NOT NULL,
  r2_etag TEXT NOT NULL,
  finalization_claim_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE TABLE guest_outputs (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES business_organisations(id),
  event_id TEXT NOT NULL REFERENCES business_events(id),
  attendee_id TEXT NOT NULL REFERENCES attendees(id),
  upload_authorisation_id TEXT NOT NULL UNIQUE REFERENCES upload_authorisations(id),
  kind TEXT NOT NULL CHECK (kind IN (
    'strip_png',
    'magazine_png',
    'polaroid_png',
    'polaroid_mp4'
  )),
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/png', 'video/mp4')),
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  sha256_hex TEXT NOT NULL,
  r2_etag TEXT NOT NULL,
  finalization_claim_id TEXT NOT NULL,
  consent_wording_version INTEGER NOT NULL,
  photo_use_consent_wording TEXT NOT NULL,
  consent_timestamp TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS "checkout_requests" (id TEXT PRIMARY KEY NOT NULL, idempotency_key_hash TEXT UNIQUE NOT NULL, request_fingerprint TEXT NOT NULL, plan TEXT NOT NULL, email_normalized TEXT, stripe_price_id TEXT NOT NULL, stripe_checkout_session_id TEXT, stripe_checkout_url TEXT, stripe_checkout_expires_at TEXT, founding_reservation_id TEXT, status TEXT NOT NULL, last_error_code TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
INSERT INTO "checkout_requests" ("id","idempotency_key_hash","request_fingerprint","plan","email_normalized","stripe_price_id","stripe_checkout_session_id","stripe_checkout_url","stripe_checkout_expires_at","founding_reservation_id","status","last_error_code","created_at","updated_at") VALUES('2f8d0746-0e27-4c94-b41d-49fbffc2b095','282e94413774b123e74e6695e6c3e4fd33f5fc37f3c5b1d4e47ceb81e2ae32fa','e6e61ee8c1231b7f14935cb5e62efee7cd73cee475820d22407ca1c7eb297f9b','PERSONAL_12_MONTH',NULL,'price_1U4M3wEC5zyE604b1JBP8VZi','cs_live_a1JqeTVJDwk6MOzIvf9e1nRyJfcoU1Znylh89pAWGqMfJvIPVTW8zHdvsl','https://checkout.stripe.com/c/pay/cs_live_a1JqeTVJDwk6MOzIvf9e1nRyJfcoU1Znylh89pAWGqMfJvIPVTW8zHdvsl#fidnandhYHdWcXxpYCc%2FJ2FgY2RwaXEnKSdicGRmZGhqaWBTZHdsZGtxJz8nZmprcXdqaScpJ2R1bE5gfCc%2FJ3VuWmlsc2BaMDRLMFFof0BGMH98QDM1MWdNQEFEVnNzfDd9MjZwSlJERmZJSzdybnB9QWlSUkRQaH1Ma3ZTTFx9QEBkcDZKX3dQVVZqXWBqNUtyUG5dUGZyYExWXFxoMmM1NU5wQnZkMHZ3JyknY3dqaFZgd3Ngdyc%2FcXdwYCknZ2RmbmJ3anBrYUZqaWp3Jz8nJmNjY2NjYycpJ2lkfGpwcVF8dWAnPyd2bGtiaWBabHFgaCcpJ2BrZGdpYFVpZGZgbWppYWB3dic%2FcXdwYHgl','2026-08-16T16:19:19.000Z',NULL,'ready',NULL,'2026-08-15T16:19:18.767Z','2026-08-15T16:19:19.288Z');
INSERT INTO "checkout_requests" ("id","idempotency_key_hash","request_fingerprint","plan","email_normalized","stripe_price_id","stripe_checkout_session_id","stripe_checkout_url","stripe_checkout_expires_at","founding_reservation_id","status","last_error_code","created_at","updated_at") VALUES('d19e5214-29b6-41ac-80a7-51c69c4fb0ce','e29eed193498cf1cbddda70f43989da9e0fcfc7fd404adcd44a6efed5b015bec','953d74dc12cd7dd3ef04de5dbe33f9b89ae96bcc2b022930558dd4b4bd8abca6','PERSONAL_6_MONTH',NULL,'price_1U4M5REC5zyE604bd4TMOBUh','cs_live_a1sZwNXYGBW6B9bgEFvxO3UNeyzCsjSiL8UeVk9J4BmmW9AYaMVEhrP0dG','https://checkout.stripe.com/c/pay/cs_live_a1sZwNXYGBW6B9bgEFvxO3UNeyzCsjSiL8UeVk9J4BmmW9AYaMVEhrP0dG#fidnandhYHdWcXxpYCc%2FJ2FgY2RwaXEnKSdicGRmZGhqaWBTZHdsZGtxJz8nZmprcXdqaScpJ2R1bE5gfCc%2FJ3VuWmlsc2BaMDRLMFFof0BGMH98QDM1MWdNQEFEVnNzfDd9MjZwSlJERmZJSzdybnB9QWlSUkRQaH1Ma3ZTTFx9QEBkcDZKX3dQVVZqXWBqNUtyUG5dUGZyYExWXFxoMmM1NU5wQnZkMHZ3JyknY3dqaFZgd3Ngdyc%2FcXdwYCknZ2RmbmJ3anBrYUZqaWp3Jz8nJmNjY2NjYycpJ2lkfGpwcVF8dWAnPyd2bGtiaWBabHFgaCcpJ2BrZGdpYFVpZGZgbWppYWB3dic%2FcXdwYHgl','2026-08-16T16:19:20.000Z',NULL,'ready',NULL,'2026-08-15T16:19:20.040Z','2026-08-15T16:19:20.557Z');
INSERT INTO "checkout_requests" ("id","idempotency_key_hash","request_fingerprint","plan","email_normalized","stripe_price_id","stripe_checkout_session_id","stripe_checkout_url","stripe_checkout_expires_at","founding_reservation_id","status","last_error_code","created_at","updated_at") VALUES('26ab26c6-e2e5-423f-9dfc-a707f87792c8','6399c6341239df8db758e36ed8e4fc63505a591f7c8e8af463c39873d61d62e3','953d74dc12cd7dd3ef04de5dbe33f9b89ae96bcc2b022930558dd4b4bd8abca6','PERSONAL_6_MONTH',NULL,'price_1U4M5REC5zyE604bd4TMOBUh','cs_live_a1NLN4c4eyoQ7gTA9mFiGuy0UzF3DWPuKVehlhWADsY4AI8byqmSpcNlCU','https://checkout.stripe.com/c/pay/cs_live_a1NLN4c4eyoQ7gTA9mFiGuy0UzF3DWPuKVehlhWADsY4AI8byqmSpcNlCU#fidnandhYHdWcXxpYCc%2FJ2FgY2RwaXEnKSdicGRmZGhqaWBTZHdsZGtxJz8nZmprcXdqaScpJ2R1bE5gfCc%2FJ3VuWmlsc2BaMDRLMFFof0BGMH98QDM1MWdNQEFEVnNzfDd9MjZwSlJERmZJSzdybnB9QWlSUkRQaH1Ma3ZTTFx9QEBkcDZKX3dQVVZqXWBqNUtyUG5dUGZyYExWXFxoMmM1NU5wQnZkMHZ3JyknY3dqaFZgd3Ngdyc%2FcXdwYCknZ2RmbmJ3anBrYUZqaWp3Jz8nJmNjY2NjYycpJ2lkfGpwcVF8dWAnPyd2bGtiaWBabHFgaCcpJ2BrZGdpYFVpZGZgbWppYWB3dic%2FcXdwYHgl','2026-08-16T16:19:41.000Z',NULL,'ready',NULL,'2026-08-15T16:19:40.939Z','2026-08-15T16:19:41.382Z');
INSERT INTO "checkout_requests" ("id","idempotency_key_hash","request_fingerprint","plan","email_normalized","stripe_price_id","stripe_checkout_session_id","stripe_checkout_url","stripe_checkout_expires_at","founding_reservation_id","status","last_error_code","created_at","updated_at") VALUES('97c51bb4-3b32-4005-b49d-5ecfe77b1ce5','853460959a50dc604738873f2cbf9dcd2648347f46ebe4c7c236441240ff3ac2','c930c9fb24b6d4514ec134771b1be90de5bff69c3667e46ea318c75813bfa424','FOUNDING_LIFETIME',NULL,'price_1U4M7KEC5zyE604bHv7q8qov','cs_live_a1isri8s4Nu7VLSKsMJfAKLqgWUkDMYkaIZOi5SrSivvw7txNft1AqqKlM','https://checkout.stripe.com/c/pay/cs_live_a1isri8s4Nu7VLSKsMJfAKLqgWUkDMYkaIZOi5SrSivvw7txNft1AqqKlM#fidnandhYHdWcXxpYCc%2FJ2FgY2RwaXEnKSdicGRmZGhqaWBTZHdsZGtxJz8nZmprcXdqaScpJ2R1bE5gfCc%2FJ3VuWmlsc2BaMDRLMFFof0BGMH98QDM1MWdNQEFEVnNzfDd9MjZwSlJERmZJSzdybnB9QWlSUkRQaH1Ma3ZTTFx9QEBkcDZKX3dQVVZqXWBqNUtyUG5dUGZyYExWXFxoMmM1NU5wQnZkMHZ3JyknY3dqaFZgd3Ngdyc%2FcXdwYCknZ2RmbmJ3anBrYUZqaWp3Jz8nJmNjY2NjYycpJ2lkfGpwcVF8dWAnPyd2bGtiaWBabHFgaCcpJ2BrZGdpYFVpZGZgbWppYWB3dic%2FcXdwYHgl','2026-08-15T16:50:52.000Z','541e1568-a5b9-4532-8cb2-b8b2dec050b2','expired',NULL,'2026-08-15T16:19:52.285Z','2026-08-15T16:50:53.602Z');
INSERT INTO "checkout_requests" ("id","idempotency_key_hash","request_fingerprint","plan","email_normalized","stripe_price_id","stripe_checkout_session_id","stripe_checkout_url","stripe_checkout_expires_at","founding_reservation_id","status","last_error_code","created_at","updated_at") VALUES('3585dd1a-25c4-4de0-8c86-294a9984703e','5f6591a781b9ebab17589ee8d603f3974ae653dd5c8ad53af082df93f4ed1e09','e6e61ee8c1231b7f14935cb5e62efee7cd73cee475820d22407ca1c7eb297f9b','PERSONAL_12_MONTH',NULL,'price_1U4M3wEC5zyE604b1JBP8VZi','cs_live_a1FGSMeHxg2DF3t7pifDutjy2aAltNVhruma8JE12xdn0Htp3Yr627d4UR','https://checkout.stripe.com/c/pay/cs_live_a1FGSMeHxg2DF3t7pifDutjy2aAltNVhruma8JE12xdn0Htp3Yr627d4UR#fidnandhYHdWcXxpYCc%2FJ2FgY2RwaXEnKSdicGRmZGhqaWBTZHdsZGtxJz8nZmprcXdqaScpJ2R1bE5gfCc%2FJ3VuWmlsc2BaMDRLMFFof0BGMH98QDM1MWdNQEFEVnNzfDd9MjZwSlJERmZJSzdybnB9QWlSUkRQaH1Ma3ZTTFx9QEBkcDZKX3dQVVZqXWBqNUtyUG5dUGZyYExWXFxoMmM1NU5wQnZkMHZ3JyknY3dqaFZgd3Ngdyc%2FcXdwYCknZ2RmbmJ3anBrYUZqaWp3Jz8nJmNjY2NjYycpJ2lkfGpwcVF8dWAnPyd2bGtiaWBabHFgaCcpJ2BrZGdpYFVpZGZgbWppYWB3dic%2FcXdwYHgl','2026-08-16T16:37:35.000Z',NULL,'ready',NULL,'2026-08-15T16:37:35.543Z','2026-08-15T16:37:36.057Z');
INSERT INTO "checkout_requests" ("id","idempotency_key_hash","request_fingerprint","plan","email_normalized","stripe_price_id","stripe_checkout_session_id","stripe_checkout_url","stripe_checkout_expires_at","founding_reservation_id","status","last_error_code","created_at","updated_at") VALUES('fdb12345-146e-4ae1-8121-cffebd05c085','c5fd83ebef41d5539ccf41041717d7f12521b3207fa3f0210d09ef51081fa531','89b2ce333209ffc6bb74f043c3abdc511e2b897e2abccdf76120290a7f3af96f','ONE_EVENT',NULL,'price_1U4LyxEC5zyE604beksBIHq6','cs_live_a1dupKK5xUgTfJehr4RHzbvhDl1DFc1vFKmmZnEHJ7JFESCxbTaIzyk832','https://checkout.stripe.com/c/pay/cs_live_a1dupKK5xUgTfJehr4RHzbvhDl1DFc1vFKmmZnEHJ7JFESCxbTaIzyk832#fidnandhYHdWcXxpYCc%2FJ2FgY2RwaXEnKSdicGRmZGhqaWBTZHdsZGtxJz8nZmprcXdqaScpJ2R1bE5gfCc%2FJ3VuWmlsc2BaMDRLMFFof0BGMH98QDM1MWdNQEFEVnNzfDd9MjZwSlJERmZJSzdybnB9QWlSUkRQaH1Ma3ZTTFx9QEBkcDZKX3dQVVZqXWBqNUtyUG5dUGZyYExWXFxoMmM1NU5wQnZkMHZ3JyknY3dqaFZgd3Ngdyc%2FcXdwYCknZ2RmbmJ3anBrYUZqaWp3Jz8nJmNjY2NjYycpJ2lkfGpwcVF8dWAnPyd2bGtiaWBabHFgaCcpJ2BrZGdpYFVpZGZgbWppYWB3dic%2FcXdwYHgl','2026-08-16T17:04:20.000Z',NULL,'ready',NULL,'2026-08-15T17:04:20.204Z','2026-08-15T17:04:20.821Z');
INSERT INTO "checkout_requests" ("id","idempotency_key_hash","request_fingerprint","plan","email_normalized","stripe_price_id","stripe_checkout_session_id","stripe_checkout_url","stripe_checkout_expires_at","founding_reservation_id","status","last_error_code","created_at","updated_at") VALUES('cc931950-8872-4bc8-942d-01cbf558ba0c','9e4eefb425d28f66e31094cd914725dee054bf9d167978b3a55799c9d023dd20','89b2ce333209ffc6bb74f043c3abdc511e2b897e2abccdf76120290a7f3af96f','ONE_EVENT',NULL,'price_1U4LyxEC5zyE604beksBIHq6','cs_live_a1jqtSxth1O7VaGsvVbzuD2aannMnJwVSHzN9d6PJwPOnXUE9POdtIGHDc','https://checkout.stripe.com/c/pay/cs_live_a1jqtSxth1O7VaGsvVbzuD2aannMnJwVSHzN9d6PJwPOnXUE9POdtIGHDc#fidnandhYHdWcXxpYCc%2FJ2FgY2RwaXEnKSdicyc%2FNSknZHVsTmB8Jz8ndW5aaWxzYFowNEswUWh%2FQEYwf3xAMzUxZ01AQURWc3N8N30yNnBKUkRGZklLN3JucH1BaVJSRFBofUxrdlNMXH1AQGRwNkpfd1BVVmpdYGo1S3JQbl1QZnJgTFZcXGgyYzU1TnBCdmQwdncnKSdjd2poVmB3c2B3Jz9xd3BgKSdnZGZuYndqcGthRmppancnPycmY2NjY2NjJyknaWR8anBxUXx1YCc%2FJ3Zsa2JpYFpscWBoJ3gl','2026-11-07T12:51:42.000Z',NULL,'completed',NULL,'2026-11-06T12:51:42.344Z','2026-11-06T12:52:25.605Z');
DELETE FROM sqlite_sequence;
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('d1_migrations',1);
CREATE INDEX founding_reservations_capacity_idx
  ON founding_reservations(status, expires_at);
CREATE INDEX purchases_customer_idx ON purchases(customer_id, status);
CREATE INDEX purchases_founding_count_idx ON purchases(plan, status);
CREATE INDEX entitlements_active_customer_idx
  ON entitlements(customer_id, revoked_at, expires_at);
CREATE INDEX entitlement_restore_lookup_idx
  ON entitlement_restore_tokens(token_hash, expires_at, consumed_at);
CREATE INDEX business_api_keys_org_idx
  ON business_api_keys(organisation_id, revoked_at);
CREATE INDEX business_events_org_idx
  ON business_events(organisation_id, status);
CREATE INDEX attendees_event_idx ON attendees(event_id, created_at);
CREATE INDEX attendees_event_email_idx ON attendees(event_id, email_normalized);
CREATE INDEX attendees_photo_consent_idx
  ON attendees(event_id, photo_use_consent, photo_use_consent_revoked_at);
CREATE INDEX upload_authorisations_lookup_idx
  ON upload_authorisations(id, purpose, expires_at, used_at);
CREATE INDEX brand_assets_event_idx ON brand_assets(event_id, deleted_at);
CREATE INDEX guest_outputs_event_idx ON guest_outputs(event_id, created_at);
CREATE INDEX guest_outputs_attendee_idx ON guest_outputs(attendee_id, deleted_at);
CREATE TRIGGER purchases_founding_requires_reservation
BEFORE INSERT ON purchases
WHEN NEW.plan = 'FOUNDING_LIFETIME'
  AND NOT EXISTS (
    SELECT 1 FROM purchases p
     WHERE p.stripe_checkout_session_id = NEW.stripe_checkout_session_id
  )
  AND NOT EXISTS (
    SELECT 1
      FROM "checkout_requests_old" cr
      JOIN founding_reservations fr ON fr.checkout_request_id = cr.id
     WHERE cr.stripe_checkout_session_id = NEW.stripe_checkout_session_id
       AND fr.stripe_checkout_session_id = NEW.stripe_checkout_session_id
       AND fr.status IN ('checkout_created', 'converted')
  )
BEGIN
  SELECT RAISE(ABORT, 'founding_reservation_required');
END;
CREATE TRIGGER purchases_founding_limit
BEFORE INSERT ON purchases
WHEN NEW.plan = 'FOUNDING_LIFETIME'
  AND NOT EXISTS (
    SELECT 1 FROM purchases p
     WHERE p.stripe_checkout_session_id = NEW.stripe_checkout_session_id
  )
  AND (
    SELECT COUNT(*)
      FROM purchases
     WHERE plan = 'FOUNDING_LIFETIME' AND status = 'paid'
  ) >= 500
BEGIN
  SELECT RAISE(ABORT, 'founding_limit_reached');
END;
CREATE TRIGGER attendees_consent_snapshot_guard
BEFORE INSERT ON attendees
WHEN (NEW.marketing_consent IS NOT NULL OR NEW.photo_use_consent IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1
      FROM event_consent_versions v
     WHERE v.event_id = NEW.event_id
       AND v.version = NEW.consent_wording_version
       AND (
         NEW.marketing_consent IS NULL OR (
           v.marketing_consent_enabled = 1 AND
           v.marketing_consent_wording = NEW.marketing_consent_wording
         )
       )
       AND (
         NEW.photo_use_consent IS NULL OR (
           v.photo_use_consent_enabled = 1 AND
           v.photo_use_consent_wording = NEW.photo_use_consent_wording
         )
       )
  )
BEGIN
  SELECT RAISE(ABORT, 'consent_snapshot_mismatch');
END;
CREATE TRIGGER brand_assets_active_scope_guard
BEFORE INSERT ON brand_assets
WHEN NOT EXISTS (
  SELECT 1
    FROM business_events e
    JOIN business_organisations o ON o.id = e.organisation_id
    JOIN upload_authorisations ua ON ua.id = NEW.upload_authorisation_id
   WHERE e.id = NEW.event_id
     AND e.organisation_id = NEW.organisation_id
     AND e.status != 'archived'
     AND o.status = 'active'
     AND ua.state = 'uploading'
     AND ua.claim_id = NEW.finalization_claim_id
     AND ua.claim_expires_at > NEW.created_at
)
BEGIN
  SELECT RAISE(ABORT, 'brand_asset_scope_not_active');
END;
CREATE TRIGGER guest_outputs_collection_guard
BEFORE INSERT ON guest_outputs
WHEN NOT EXISTS (
  SELECT 1
    FROM attendees a
    JOIN business_events e ON e.id = a.event_id
    JOIN business_organisations o ON o.id = e.organisation_id
    JOIN upload_authorisations ua ON ua.id = NEW.upload_authorisation_id
   WHERE a.id = NEW.attendee_id
     AND a.event_id = NEW.event_id
     AND e.organisation_id = NEW.organisation_id
     AND e.status = 'live'
     AND o.status = 'active'
     AND e.collect_consented_photos = 1
     AND e.photo_use_consent_enabled = 1
     AND a.photo_use_consent = 1
     AND a.photo_use_consent_revoked_at IS NULL
     AND a.consent_wording_version = NEW.consent_wording_version
     AND a.photo_use_consent_wording = NEW.photo_use_consent_wording
     AND a.consent_timestamp = NEW.consent_timestamp
     AND ua.state = 'uploading'
     AND ua.claim_id = NEW.finalization_claim_id
     AND ua.claim_expires_at > NEW.created_at
)
BEGIN
  SELECT RAISE(ABORT, 'guest_output_collection_not_allowed');
END;
