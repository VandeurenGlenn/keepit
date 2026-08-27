import type { WorkLocation } from '../../types/index.js'
import { api } from '../api/client.js'

export type OfflineAction = { id:string; type:'checkin'|'checkout'; job:string; timestamp:number; location?:WorkLocation; prestationId?:string; createdAt:number; attempts?:number; lastError?:string }
const key='keepit.offlineActions'
const read=():OfflineAction[]=>{try{return JSON.parse(localStorage.getItem(key)||'[]')}catch{return[]}}
const write=(actions:OfflineAction[])=>{localStorage.setItem(key,JSON.stringify(actions));window.dispatchEvent(new CustomEvent('keepit-sync-status',{detail:{pending:actions.length,actions}}))}
export const getOfflineActions=()=>read()
export const isNetworkFailure=(error:unknown)=>!navigator.onLine||error instanceof TypeError||`${(error as Error)?.message||''}`.toLowerCase().includes('failed to fetch')
export const enqueueOfflineAction=(action:Omit<OfflineAction,'id'|'createdAt'>)=>{const id=crypto.randomUUID();write([...read(),{...action,id,createdAt:Date.now()}]);return id}
export const getPendingWorkState=()=>{const actions=read();let currentJob:string|undefined;let currentPrestationId:string|undefined;for(const action of actions){if(action.type==='checkin'){currentJob=action.job;currentPrestationId=`pending:${action.id}`}else if(action.type==='checkout'&&action.job===currentJob){currentJob=undefined;currentPrestationId=undefined}}return{currentJob,currentPrestationId,pending:actions.length}}
let flushing=false
export const flushOfflineActions=async()=>{if(flushing||!navigator.onLine)return;flushing=true;let actions=read();try{for(const action of [...actions]){try{if(action.type==='checkin'){const result=await api.checkIn(action.job,action.timestamp,action.location,{source:'offline-sync',clientRequestId:action.id});actions=actions.map(item=>item.prestationId===`pending:${action.id}`?{...item,prestationId:result.id}:item)}else await api.checkOut(action.job,action.timestamp,action.location,{prestationId:action.prestationId,clientRequestId:action.id});actions=actions.filter(item=>item.id!==action.id);write(actions)}catch(error){const message=isNetworkFailure(error)?'Geen verbinding':((error as Error)?.message||'Synchronisatie mislukt');actions=actions.map(item=>item.id===action.id?{...item,attempts:(item.attempts||0)+1,lastError:message}:item);write(actions);break}}}finally{flushing=false}}
export const retryOfflineActions=flushOfflineActions
export const initializeOfflineSync=()=>{window.addEventListener('online',()=>void flushOfflineActions());if(navigator.onLine)void flushOfflineActions()}
