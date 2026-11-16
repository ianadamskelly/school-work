import { env } from 'work-journal-runtime';
export function database(){if(!env.DB)throw new Error('Database is unavailable.');return env.DB;}
