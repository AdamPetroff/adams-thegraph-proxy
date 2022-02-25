CREATE TABLE IF NOT EXISTS public.events 
(
    id SERIAL PRIMARY KEY,
    event_id character varying(255) NOT NULL,
    app_id character varying(50) NOT NULL,
    block_number integer NOT NULL,
    transaction_hash character varying(255) NOT NULL,
    success boolean DEFAULT true NOT NULL,
    tries smallint DEFAULT '1' NOT NULL,
    event_data json NOT NULL,
    last_try_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
);