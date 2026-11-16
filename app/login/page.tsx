import Login from './screen';
import { identity } from '../../lib/auth';
import { redirect } from 'next/navigation';
export const dynamic='force-dynamic';
export default async function Page(){const a=await identity();if(a?.state==='active')redirect(a.role==='admin'?'/admin':'/');return <Login/>;}
