import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';

// A small D1-compatible interface keeps journal queries unchanged on the VPS.
// Every batch runs synchronously in one SQLite transaction, including rollback.
export function createDatabase(filename){
 mkdirSync(dirname(filename),{recursive:true});
 const sqlite=new DatabaseSync(filename);sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
 class Prepared {
  constructor(sql,values=[]){this.sql=sql;this.values=values;}
  bind(...values){return new Prepared(this.sql,values);}
  result(){const statement=sqlite.prepare(this.sql);const hasRows=statement.columns().length>0;const rows=hasRows?statement.all(...this.values):[];const outcome=hasRows?sqlite.prepare('SELECT changes() AS changes,last_insert_rowid() AS id').get():statement.run(...this.values);return {success:true,results:rows,meta:{changes:Number(outcome.changes),last_row_id:Number(outcome.lastInsertRowid??outcome.id??0),duration:0,rows_read:rows.length,rows_written:Number(outcome.changes)}};}
  async all(){return this.result();}
  async run(){return this.result();}
  async first(column){const row=this.result().results[0];return row?(column?row[column]:row):null;}
  async raw(options){const statement=sqlite.prepare(this.sql);statement.setReturnArrays(true);const rows=statement.all(...this.values);return options?.columnNames?[statement.columns().map(c=>c.name),...rows]:rows;}
 }
 return {prepare:sql=>new Prepared(sql),batch:async statements=>{sqlite.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>s.result());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}},exec:async sql=>{sqlite.exec(sql);return {count:0,duration:0}},close:()=>sqlite.close(),sqlite};
}
