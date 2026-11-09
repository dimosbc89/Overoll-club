// Entry for the Supabase CLI and local runs: `npm run functions:build` first.
// (Deploys from this workspace use the same dist/app.js, see scripts/build-functions.ts.)
import postgres from 'npm:postgres@3.4.9';
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { start } from './dist/app.js';

start({ postgres, createClient });
