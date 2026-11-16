import { identity } from '../../../lib/auth';
import { json,fail } from '../../../lib/server';
export const dynamic='force-dynamic';
export async function GET(){const a=await identity();return a&&a.state==='active'?json({id:a.id,name:a.name,role:a.role,email:a.email}):fail('Please log in.',401);}
