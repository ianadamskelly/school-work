'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {CalendarDays,ChevronDown,ChevronLeft,ChevronRight,Info} from 'lucide-react';
import {Logout} from './accounts';

function usePopover(){
 const [open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),id=useId();
 useEffect(()=>{if(!open)return;function outside(e:PointerEvent){if(!root.current?.contains(e.target as Node))setOpen(false);}function key(e:KeyboardEvent){if(e.key==='Escape'){e.preventDefault();setOpen(false);trigger.current?.focus();}}document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key);};},[open]);
 return {open,setOpen,root,trigger,id};
}
export function AccountMenu({name,email,detail}:{name:string;email:string;detail:string}){
 const p=usePopover();
 return <div className="account-menu" ref={p.root}><button ref={p.trigger} className="account-trigger" aria-label={`Account menu for ${name}`} aria-haspopup="dialog" aria-expanded={p.open} aria-controls={p.id} onClick={()=>p.setOpen(!p.open)}><span className="avatar mini" aria-hidden="true">{name.split(/\s+/).map(s=>s[0]).slice(0,2).join('').toUpperCase()}</span><span className="account-trigger-name">{name}</span><ChevronDown size={14}/></button>{p.open&&<div className="account-popover" id={p.id} role="dialog" aria-label="Your account"><b>{name}</b><p>{email}</p><small>{detail}</small><Logout/></div>}</div>;
}
export function Help({text,label='How this is calculated'}:{text:string;label?:string}){const p=usePopover();return <div className="metric-help" ref={p.root}><button className="help-trigger" ref={p.trigger} aria-label={label} aria-expanded={p.open} aria-controls={p.id} onClick={()=>p.setOpen(!p.open)}><Info size={15}/></button>{p.open&&<div role="note" id={p.id} className="help-popover">{text}</div>}</div>;}
export function MonthPicker({value,onChange,label='Select month'}:{value:string;onChange:(month:string)=>void;label?:string}){
 const p=usePopover(),[year,setYear]=useState(Number(value.slice(0,4)));
 const display=new Date(value+'-01T12:00Z').toLocaleDateString('en-GB',{month:'long',year:'numeric',timeZone:'UTC'});
 function step(n:number){const d=new Date(value+'-01T12:00Z');d.setUTCMonth(d.getUTCMonth()+n);const next=d.toISOString().slice(0,7);onChange(next);setYear(Number(next.slice(0,4)));p.setOpen(false);}
 return <div className="month-picker" ref={p.root}><button className="month-step" aria-label="Previous month" onClick={()=>step(-1)}><ChevronLeft size={16}/></button><button ref={p.trigger} className="month-trigger" aria-label={`${label}: ${display}`} aria-haspopup="dialog" aria-expanded={p.open} aria-controls={p.id} onClick={()=>{setYear(Number(value.slice(0,4)));p.setOpen(!p.open);}}><CalendarDays size={16}/>{display}<ChevronDown size={13}/></button><button className="month-step" aria-label="Next month" onClick={()=>step(1)}><ChevronRight size={16}/></button>{p.open&&<div className="month-popover" role="dialog" aria-label={label} id={p.id}><div className="month-year"><button aria-label="Previous year" onClick={()=>setYear(y=>y-1)}><ChevronLeft size={16}/></button><b aria-live="polite">{year}</b><button aria-label="Next year" onClick={()=>setYear(y=>y+1)}><ChevronRight size={16}/></button></div><div className="month-grid">{Array.from({length:12},(_,i)=>{const key=`${year}-${String(i+1).padStart(2,'0')}`,name=new Date(key+'-01T12:00Z').toLocaleDateString('en-GB',{month:'short',timeZone:'UTC'});return <button key={key} aria-label={`${name} ${year}`} aria-pressed={key===value} className={key===value?'selected':''} onClick={()=>{onChange(key);p.setOpen(false);p.trigger.current?.focus();}}>{name}</button>;})}</div></div>}</div>;
}
