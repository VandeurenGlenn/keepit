import { Router } from '@koa/router'
import { hours, invoices, jobs, planning, quotes, users } from '../database/database.js'
import { hasRole } from '../helpers/roles.js'

const router = new Router({ prefix: '/api/control' })
router.use(async(ctx,next)=>{if(!hasRole(ctx.state.userid,'admin')){ctx.status=403;ctx.body={error:'Alleen admins kunnen het controlecentrum bekijken'};return}await next()})

router.get('/',(ctx)=>{
  const now=Date.now();const limit=12*60*60*1000
  const alerts:Array<{id:string;kind:'long'|'future'|'open';title:string;detail:string;href:string;severity:'warning'|'critical'}>=[]
  for(const [userId,userHours] of Object.entries(hours))for(const [id,item] of Object.entries(userHours)){
    const end=typeof item.checkout==='number'?item.checkout:now
    const duration=Math.max(0,end-Number(item.checkin))
    const jobName=item.jobId?jobs[item.jobId]?.name:'Onbekende job'
    const person=users[userId]?.name||users[userId]?.email||userId
    const href=item.jobId?`#!/job?selected=${item.jobId}`:'#!/timeline'
    if(duration>limit)alerts.push({id:`long-${id}`,kind:'long',title:`Meer dan 12 uur · ${jobName}`,detail:`${person} · ${(duration/3_600_000).toFixed(1)} uur`,href,severity:duration>24*3_600_000?'critical':'warning'})
    if(Number(item.checkin)>Number(item.serverCheckin)||Number(item.checkout)>Number(item.serverCheckout))alerts.push({id:`future-${id}`,kind:'future',title:`Tijdstip na indiening · ${jobName}`,detail:person,href,severity:'warning'})
    if(!item.checkout&&now-Number(item.serverCheckin)>limit)alerts.push({id:`open-${id}`,kind:'open',title:`Nog steeds ingecheckt · ${jobName}`,detail:person,href,severity:'critical'})
  }
  const today=new Date();today.setHours(0,0,0,0);const tomorrow=today.getTime()+86_400_000
  ctx.body={summary:{activeJobs:Object.values(jobs).filter(job=>job.status!=='completed').length,todayPlanning:Object.values(planning).filter(item=>Date.parse(item.start)<tomorrow&&Date.parse(item.end)>=today.getTime()).length,draftQuotes:Object.values(quotes).filter(item=>item.status==='draft').length,invoices:Object.keys(invoices).length},alerts:alerts.sort((a,b)=>a.severity==='critical'&&b.severity!=='critical'?-1:1).slice(0,30)}
})
export default router.routes()
