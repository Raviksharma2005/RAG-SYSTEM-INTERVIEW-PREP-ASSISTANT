import dotenv from 'dotenv';
import path from 'path';

// Explicitly load env vars from .env.local relative to workspace root
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
