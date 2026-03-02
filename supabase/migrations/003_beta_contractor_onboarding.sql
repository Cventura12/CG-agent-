-- Day 22 beta contractor onboarding seed data.
-- Creates three contractor accounts in gc_users and matching contractor_profile rows.
-- API keys are not stored in Supabase; set them through GC_AGENT_API_KEYS in your runtime env.

insert into public.gc_users (id, phone_number, name)
values
    (
        '00000000-0000-0000-0000-000000000101',
        '+14235550101',
        'Micah Lawson'
    ),
    (
        '00000000-0000-0000-0000-000000000102',
        '+14235550102',
        'Jordan Hale'
    ),
    (
        '00000000-0000-0000-0000-000000000103',
        '+14235550103',
        'Avery Brooks'
    )
on conflict (id)
do update set
    phone_number = excluded.phone_number,
    name = excluded.name;

insert into public.contractor_profile (
    contractor_id,
    company_name,
    preferred_scope_language,
    pricing_signals,
    material_preferences,
    notes
)
values
    (
        '00000000-0000-0000-0000-000000000101',
        'Scenic City Roofing',
        '[
            "Remove existing roofing in the affected work area and install new laminated architectural shingles to restore a watertight roof assembly.",
            "Install synthetic underlayment, starter, and ridge accessories as needed for a complete Chattanooga-area replacement scope."
        ]'::jsonb,
        '{
            "tear_off_per_square": 72.0,
            "laminated_shingles_per_square": 158.0,
            "synthetic_underlayment_per_square": 21.0,
            "ice_water_per_square": 48.0,
            "ridge_cap_per_square": 31.0,
            "starter_strip_per_square": 18.0
        }'::jsonb,
        '{
            "shingle_brand": "Owens Corning Duration",
            "underlayment": "Synthetic felt",
            "market": "Chattanooga, TN"
        }'::jsonb,
        'Beta contractor seeded for roofing quote testing. Matching API key label: beta_gc_1.'
    ),
    (
        '00000000-0000-0000-0000-000000000102',
        'Ridgeline Exteriors',
        '[
            "Tear off existing shingles, inspect the deck, and install upgraded laminated shingles with Chattanooga baseline pricing until custom rates are entered."
        ]'::jsonb,
        '{
            "tear_off_per_square": 72.0,
            "laminated_shingles_per_square": 158.0,
            "synthetic_underlayment_per_square": 21.0,
            "ice_water_per_square": 48.0,
            "ridge_cap_per_square": 31.0,
            "starter_strip_per_square": 18.0
        }'::jsonb,
        '{
            "shingle_brand": "CertainTeed Landmark",
            "underlayment": "Synthetic felt",
            "market": "Chattanooga, TN"
        }'::jsonb,
        'Beta contractor seeded for roofing quote testing. Matching API key label: beta_gc_2.'
    ),
    (
        '00000000-0000-0000-0000-000000000103',
        'Signal Mountain Painting',
        '[
            "Prep walls and trim, protect floors and furniture, and apply finish coats for a clean residential paint scope."
        ]'::jsonb,
        '{
            "labor_day_rate": 450.0,
            "interior_wall_paint_per_gallon": 42.0,
            "primer_per_gallon": 28.0,
            "masking_materials_per_room": 18.0
        }'::jsonb,
        '{
            "paint_brand": "Sherwin-Williams Duration",
            "finish_default": "eggshell",
            "market": "Chattanooga, TN"
        }'::jsonb,
        'Beta contractor seeded for non-roofing beta testing. Use this painting account to expose roofing-specific prompt gaps. Matching API key label: beta_gc_3.'
    )
on conflict (contractor_id)
do update set
    company_name = excluded.company_name,
    preferred_scope_language = excluded.preferred_scope_language,
    pricing_signals = excluded.pricing_signals,
    material_preferences = excluded.material_preferences,
    notes = excluded.notes,
    updated_at = now();
