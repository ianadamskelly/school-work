import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { env } from 'work-journal-runtime';
import { headers } from 'next/headers';
import { getDb } from '../db';
import { authUser,authSession,authAccount,authVerification,authRateLimit } from '../db/auth-schema';
import { database } from './database';
export function appOrigin(){const origin=env.APP_ORIGIN;if(!origin)throw Error('APP_ORIGIN is not configured.');return new URL(origin).origin;}
export function getAuth(){
 if(!env.BETTER_AUTH_SECRET||env.BETTER_AUTH_SECRET.length<32)throw Error('Authentication secret is not configured.');
 const origin=appOrigin();
 return betterAuth({appName:'Work Journal',baseURL:origin,secret:env.BETTER_AUTH_SECRET,
  database:drizzleAdapter(getDb(),{provider:'sqlite',schema:{user:authUser,session:authSession,account:authAccount,verification:authVerification,rateLimit:authRateLimit}}),
  emailAndPassword:{enabled:true,disableSignUp:true,minPasswordLength:12,maxPasswordLength:128,requireEmailVerification:true},
  user:{changeEmail:{enabled:false},deleteUser:{enabled:false}},
  session:{expiresIn:8*60*60,updateAge:60*60,cookieCache:{enabled:false}},
  trustedOrigins:[origin],advanced:{useSecureCookies:origin.startsWith('https:'),cookiePrefix:'work-journal',ipAddress:{ipAddressHeaders:(process.env.NODE_ENV==='development')?[]:['cf-connecting-ip']}},
  rateLimit:{enabled:true,storage:'database',window:60,max:100,customRules:{'/sign-in/email':{window:60,max:40}}},
  databaseHooks:{session:{create:{before:async session=>{const a=await database().prepare("SELECT user_id FROM journal_access WHERE user_id=? AND state='active'").bind(session.userId).first();if(!a)throw new APIError('FORBIDDEN',{message:'This account is not available. Contact your line manager or administrator.'});return {data:session};}}}},
  telemetry:{enabled:false},
 });
}
export async function identity(){const session=await getAuth().api.getSession({headers:await headers()});if(!session)return null;return await database().prepare('SELECT a.user_id AS id,a.role,a.state,a.revision,u.name,u.email FROM journal_access a JOIN auth_user u ON u.id=a.user_id WHERE a.user_id=?').bind(session.user.id).first<any>();}
