import { Router } from '@koa/router'
import { hours, users } from '../database/database.js'
import type { WorkReport } from '../../types/index.js'

const router = new Router({ prefix: '/api/reports' })
router.get('/hours', (ctx) => {
  if (!users[ctx.state.userid]?.roles?.includes('admin')) { ctx.status=403;ctx.body={error:'Alleen admins kunnen rapporten bekijken.'};return }
  const from=Date.parse(String(ctx.query.from||'')),to=Date.parse(String(ctx.query.to||''))
  if(!Number.isFinite(from)||!Number.isFinite(to)||to<=from||to-from>366*86_400_000){ctx.status=400;ctx.body={error:'Kies een geldige periode van maximaal één jaar.'};return}
  const rows:WorkReport['rows']=[]
  for(const [userId,userHours] of Object.entries(hours))for(const [prestationId,item] of Object.entries(userHours||{})){const checkin=Number(item.checkin),checkout=item.checkout===undefined?undefined:Number(item.checkout);if(!Number.isFinite(checkin)||checkin>=to||(checkout!==undefined&&checkout<from))continue;const duration=checkout===undefined?0:Math.max(0,checkout-checkin);rows.push({userId,jobId:item.jobId||'',prestationId,checkin,checkout,duration,unusual:duration>12*3_600_000,future:checkin>Number(item.serverCheckin)||(checkout!==undefined&&checkout>Number(item.serverCheckout))})}
  rows.sort((a,b)=>b.checkin-a.checkin);ctx.body={from:new Date(from).toISOString(),to:new Date(to).toISOString(),rows}
})
export default router.routes()
