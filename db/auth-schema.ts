import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const authUser=sqliteTable('auth_user',{
 id:text('id').primaryKey(),name:text('name').notNull(),email:text('email').notNull().unique(),emailVerified:integer('email_verified',{mode:'boolean'}).notNull().default(false),image:text('image'),createdAt:integer('created_at',{mode:'timestamp_ms'}).notNull(),updatedAt:integer('updated_at',{mode:'timestamp_ms'}).notNull(),
});
export const authSession=sqliteTable('auth_session',{
 id:text('id').primaryKey(),token:text('token').notNull().unique(),expiresAt:integer('expires_at',{mode:'timestamp_ms'}).notNull(),createdAt:integer('created_at',{mode:'timestamp_ms'}).notNull(),updatedAt:integer('updated_at',{mode:'timestamp_ms'}).notNull(),ipAddress:text('ip_address'),userAgent:text('user_agent'),userId:text('user_id').notNull().references(()=>authUser.id,{onDelete:'cascade'}),
},t=>[index('auth_session_user').on(t.userId)]);
export const authAccount=sqliteTable('auth_account',{
 id:text('id').primaryKey(),accountId:text('account_id').notNull(),providerId:text('provider_id').notNull(),userId:text('user_id').notNull().references(()=>authUser.id,{onDelete:'cascade'}),accessToken:text('access_token'),refreshToken:text('refresh_token'),idToken:text('id_token'),accessTokenExpiresAt:integer('access_token_expires_at',{mode:'timestamp_ms'}),refreshTokenExpiresAt:integer('refresh_token_expires_at',{mode:'timestamp_ms'}),scope:text('scope'),password:text('password'),createdAt:integer('created_at',{mode:'timestamp_ms'}).notNull(),updatedAt:integer('updated_at',{mode:'timestamp_ms'}).notNull(),
},t=>[index('auth_account_user').on(t.userId),uniqueIndex('auth_account_provider').on(t.providerId,t.accountId)]);
export const authVerification=sqliteTable('auth_verification',{
 id:text('id').primaryKey(),identifier:text('identifier').notNull(),value:text('value').notNull(),expiresAt:integer('expires_at',{mode:'timestamp_ms'}).notNull(),createdAt:integer('created_at',{mode:'timestamp_ms'}).notNull(),updatedAt:integer('updated_at',{mode:'timestamp_ms'}).notNull(),
},t=>[index('auth_verification_identifier').on(t.identifier)]);
export const authRateLimit=sqliteTable('auth_rate_limit',{
 id:text('id').primaryKey(),key:text('key').notNull().unique(),count:integer('count').notNull(),lastRequest:integer('last_request').notNull(),
});
export const access=sqliteTable('journal_access',{
 userId:text('user_id').primaryKey().references(()=>authUser.id,{onDelete:'cascade'}),role:text('role').notNull(),state:text('state').notNull(),createdBy:text('created_by'),createdAt:integer('created_at').notNull(),revision:text('revision').notNull(),
});
export const invitations=sqliteTable('journal_invitations',{
 id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>authUser.id,{onDelete:'cascade'}),tokenHash:text('token_hash').notNull().unique(),expiresAt:integer('expires_at').notNull(),usedAt:integer('used_at'),claim:text('claim'),createdBy:text('created_by'),
},t=>[index('invitations_user').on(t.userId)]);
export const audit=sqliteTable('journal_account_audit',{
 id:text('id').primaryKey(),actorId:text('actor_id').notNull(),action:text('action').notNull(),targetId:text('target_id').notNull(),detail:text('detail').notNull(),at:integer('at').notNull(),
});
export const securityLimits=sqliteTable('journal_security_limits',{
 key:text('key').primaryKey(),count:integer('count').notNull(),windowStart:integer('window_start').notNull(),
});
