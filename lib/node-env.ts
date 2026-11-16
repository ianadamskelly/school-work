import {createDatabase} from './sqlite-d1.mjs';
let db:D1Database|undefined;
export const env={
 get DB(){return db??=(createDatabase(process.env.DATABASE_PATH||'/data/work-journal.sqlite') as unknown as D1Database);},
 get APP_ORIGIN(){return process.env.APP_ORIGIN;},
 get BETTER_AUTH_SECRET(){return process.env.BETTER_AUTH_SECRET;},
};
