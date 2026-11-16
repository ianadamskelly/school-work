import Journal from './journal';
import { identity } from '../lib/auth';
import { redirect } from 'next/navigation';
export const dynamic='force-dynamic';
export default async function Home(){const a=await identity();if(!a||a.state!=='active')redirect('/login');if(a.role==='admin')redirect('/admin');return <Journal/>;}
