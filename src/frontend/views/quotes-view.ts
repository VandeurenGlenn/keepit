import { LiteElement, html, css, property } from '@vandeurenglenn/lite'
import '@vandeurenglenn/lite-elements/icon.js'
import type { Companies, Jobs, Quote, Quotes, QuoteStatus, User } from '../../types/index.js'
import { api } from '../api/client.js'
import { showToast } from '../helpers/toast.js'
import { confirmAction } from '../helpers/confirmation.js'

const statusLabels: Record<QuoteStatus,string>={draft:'Concept',sent:'Verzonden',approved:'Goedgekeurd',rejected:'Afgewezen'}
const euro=new Intl.NumberFormat('nl-BE',{style:'currency',currency:'EUR'})
export class QuotesView extends LiteElement{
 @property({type:Object,consumes:true}) accessor quotes:Quotes={}
 @property({type:Object,consumes:true}) accessor jobs:Jobs={}
 @property({type:Object,consumes:true}) accessor companies:Companies={}
 @property({type:Object,consumes:true}) accessor user:User|undefined
 @property({type:String}) accessor searchQuery=''
 @property({type:String}) accessor statusFilter='all'
 @property({type:String}) accessor busyId=''
 @property({type:String}) accessor convertQuoteId=''
 @property({type:String}) accessor convertCompany=''
 @property({type:Boolean}) accessor converting=false
 static styles=[css`:host{display:flex;flex-direction:column;width:100%;max-width:1180px;min-height:100%;gap:16px;padding:22px;box-sizing:border-box}h1,h2,h3,p{margin:0}button,input,select{font:inherit}.page-header{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:18px 20px;border:1px solid var(--app-border);border-radius:var(--app-radius-panel);background:var(--app-panel);box-shadow:var(--app-shadow-soft)}.heading{display:flex;align-items:center;gap:13px}.page-icon{display:grid;place-items:center;width:44px;height:44px;border-radius:var(--app-radius-control);background:var(--app-accent-soft);color:var(--app-accent)}.eyebrow{color:var(--app-accent);font-size:.72rem;font-weight:500}h1{margin-top:3px;font-size:1.65rem;font-weight:600}.subtitle{margin-top:5px;color:var(--md-sys-color-on-surface-variant);font-size:.8rem}.primary,.button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:42px;padding:0 14px;border:1px solid var(--app-border);border-radius:var(--app-radius-control);background:var(--app-panel-strong);color:inherit;font-weight:600;text-decoration:none;cursor:pointer}.primary{border-color:var(--app-accent-strong);background:var(--app-accent);color:var(--md-sys-color-on-primary)}.toolbar{display:grid;grid-template-columns:minmax(0,1fr) 190px;gap:10px}.search-wrap{position:relative}.search-wrap custom-icon{position:absolute;left:13px;top:50%;transform:translateY(-50%)}input,select{width:100%;height:44px;box-sizing:border-box;border:1px solid var(--app-border);border-radius:var(--app-radius-control);background:var(--app-panel);color:inherit}input{padding:0 13px 0 42px}select{padding:0 12px}.list-heading{display:flex;justify-content:space-between}.list-heading h2{font-size:.95rem}.count{color:var(--md-sys-color-on-surface-variant);font-size:.76rem}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.card{position:relative;display:grid;grid-template-columns:42px minmax(0,1fr) auto;align-items:center;gap:12px;min-height:88px;padding:14px;border:1px solid var(--app-border);border-radius:var(--app-radius-panel);background:var(--app-panel);box-shadow:var(--app-shadow-soft)}.card-link{position:absolute;inset:0}.card-icon{display:grid;place-items:center;width:42px;height:42px;border-radius:var(--app-radius-control);background:var(--app-accent-soft);color:var(--app-accent)}.copy{min-width:0}.copy h3,.copy p{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.copy h3{font-size:.9rem}.copy p{margin-top:5px;color:var(--md-sys-color-on-surface-variant);font-size:.72rem}.status{display:inline-flex;margin-top:7px;padding:4px 8px;border-radius:999px;background:var(--app-accent-soft);color:var(--app-accent);font-size:.64rem}.meta{display:flex;align-items:center;gap:8px}.amount{font-size:.9rem}.actions{position:relative;z-index:1;display:flex;gap:5px}.icon-button{display:grid;place-items:center;width:34px;height:34px;padding:0;border:1px solid var(--app-border);border-radius:10px;background:var(--app-panel-strong);color:var(--md-sys-color-on-surface-variant);cursor:pointer}.icon-button:hover{color:var(--app-accent)}.empty{padding:48px;border:1px dashed var(--app-border);border-radius:var(--app-radius-panel);text-align:center;color:var(--md-sys-color-on-surface-variant)}.layer{position:fixed;z-index:1200;inset:0;display:grid;place-items:center;padding:18px;background:rgb(0 0 0/.5)}.dialog{display:flex;flex-direction:column;gap:14px;width:min(440px,100%);padding:20px;border:1px solid var(--app-border);border-radius:var(--app-radius-dialog);background:var(--md-sys-color-surface);box-shadow:var(--app-shadow-strong)}.dialog h2{font-size:1.1rem}.dialog p{color:var(--md-sys-color-on-surface-variant);font-size:.78rem}.dialog label{display:flex;flex-direction:column;gap:6px;font-size:.72rem}.dialog-actions{display:flex;justify-content:flex-end;gap:8px}.converted{color:var(--app-success)}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--app-accent);outline-offset:2px}@media(max-width:760px){:host{padding:12px}.page-header{padding:14px}.page-icon{display:none}.page-header>.primary{width:42px;padding:0}.page-header>.primary span{display:none}.toolbar,.grid{grid-template-columns:1fr}.card{grid-template-columns:40px minmax(0,1fr)}.meta{grid-column:2;justify-content:space-between}}`]
 total(quote:Quote){const materials=quote.materials.reduce((sum,item)=>sum+item.quantity*(item.unitPrice||0),0);const net=Math.max(0,materials+(quote.laborAmount||0)-(quote.discountAmount||0));return net+net*(quote.vatRate||0)/100}
 duplicate=async(event:Event,id:string)=>{event.preventDefault();event.stopPropagation();this.busyId=id;try{const quote=await api.duplicateQuote(id);this.quotes={...this.quotes,[quote.id]:quote};showToast('Offerte gedupliceerd.')}catch(error){console.error(error);showToast('Dupliceren mislukt.')}finally{this.busyId=''}}
 removeQuote=async(event:Event,id:string)=>{event.preventDefault();event.stopPropagation();if(!(await confirmAction({title:'Offerte verwijderen?',message:'De opgeslagen offerte wordt definitief verwijderd.',confirmLabel:'Offerte verwijderen'})))return;this.busyId=id;try{await api.deleteQuote(id);const next={...this.quotes};delete next[id];this.quotes=next;showToast('Offerte verwijderd.')}catch(error){console.error(error);showToast('Verwijderen mislukt.')}finally{this.busyId=''}}
 openConversion(event:Event,quote:Quote){event.preventDefault();event.stopPropagation();this.convertQuoteId=quote.id;this.convertCompany='';requestAnimationFrame(()=>this.shadowRoot?.querySelector<HTMLSelectElement>('.dialog select')?.focus())}
 closeConversion(){this.convertQuoteId='';this.convertCompany=''}
 async convert(){
   if(this.converting)return
   const quote=this.quotes[this.convertQuoteId]
   if(!quote||!this.convertCompany)return showToast('Kies een klant.')
   this.converting=true
   try{
     const result=await api.convertQuoteToInvoice(quote.id,this.convertCompany)
     if(!this.isConnected)return
     this.quotes={...this.quotes,[quote.id]:{...quote,convertedInvoiceId:result.uuid}}
     this.closeConversion()
     showToast(result.reused?'Bestaande factuur geopend.':'Factuur aangemaakt.')
     location.hash=`#!/invoice?selected=${encodeURIComponent(result.uuid)}`
   }catch(error){
     if(this.isConnected)showToast(error instanceof Error?error.message:'Factuur aanmaken mislukt.')
   }finally{this.converting=false}
 }
 render() {
   const all = Object.values(this.quotes || {})
   const query = this.searchQuery.trim().toLocaleLowerCase('nl-BE')
   const clear = () => { this.searchQuery = ''; this.statusFilter = 'all' }
   const entries = all.filter(quote => {
     const job = this.jobs?.[quote.jobId]
     const customer = job?.customerId ? this.companies?.[job.customerId] : undefined
     return (this.statusFilter === 'all' || quote.status === this.statusFilter) &&
       (!query || `${quote.name} ${job?.name || ''} ${customer?.name || ''}`.toLocaleLowerCase('nl-BE').includes(query))
   }).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
   const customers = Object.entries(this.companies || {}).filter(([, company]) => company.relationshipType !== 'supplier')
   return html`
     <header class="page-header">
       <div class="heading"><span class="page-icon"><custom-icon icon="request_quote"></custom-icon></span>
         <div><span class="eyebrow">Facturatie</span><h1>Offertes</h1><p class="subtitle">Van prijsvoorstel naar factuur.</p></div>
       </div>
       <a class="primary" href="#!/quote" aria-label="Nieuwe offerte"><custom-icon icon="add"></custom-icon><span>Nieuwe offerte</span></a>
     </header>
     <div class="toolbar">
       <div class="search-wrap"><custom-icon icon="search"></custom-icon>
         <input type="search" aria-label="Offertes zoeken" placeholder="Zoek offerte, job of klant…" .value=${this.searchQuery}
           @input=${(event: Event) => { this.searchQuery = (event.target as HTMLInputElement).value }}>
       </div>
       <div class="status-filters" role="group" aria-label="Filter op status">
         ${[['all', 'Alles'], ...Object.entries(statusLabels)].map(([value, label]) => html`
           <button type="button" aria-pressed=${this.statusFilter === value ? 'true' : 'false'} @click=${() => { this.statusFilter = value }}>
             ${label} <span>${value === 'all' ? all.length : all.filter(quote => quote.status === value).length}</span>
           </button>`)}
       </div>
     </div>
     <div class="list-heading"><h2>Opgeslagen offertes</h2><span class="count" aria-live="polite">${entries.length} ${entries.length === 1 ? 'offerte' : 'offertes'}</span></div>
     ${entries.length ? html`<section class="grid" aria-label="Opgeslagen offertes">${entries.map(quote => {
       const job = this.jobs?.[quote.jobId]
       const customer = job?.customerId ? this.companies?.[job.customerId] : undefined
       return html`<article class="card">
         <a class="quote-link" href=${`#!/quote?selected=${encodeURIComponent(quote.id)}`}>
           <span class="card-icon"><custom-icon icon="description"></custom-icon></span>
           <div class="copy"><h3>${quote.name}</h3>
             <p>${[job?.name, customer?.name].filter(Boolean).join(' · ') || 'Geen job gekoppeld'}</p>
             <span class="status" data-status=${quote.status}>${statusLabels[quote.status]}</span>
             <time datetime=${quote.updatedAt}>${new Date(quote.updatedAt).toLocaleDateString('nl-BE')}</time>
           </div>
           <div class="price"><strong class="amount">${euro.format(this.total(quote))}</strong><small>incl. btw</small></div>
         </a>
         <div class="actions">
           ${quote.convertedInvoiceId ? html`<a class="button converted" href=${`#!/invoice?selected=${encodeURIComponent(quote.convertedInvoiceId)}`}><custom-icon icon="receipt"></custom-icon>Factuur openen</a>`
           : quote.status === 'approved' ? html`<button class="button" @click=${(event: Event) => this.openConversion(event, quote)}><custom-icon icon="receipt_long"></custom-icon>Maak factuur</button>` : ''}
           <button class="icon-button" title="Dupliceren" aria-label=${`Offerte ${quote.name} dupliceren`} ?disabled=${this.busyId === quote.id} @click=${(event: Event) => this.duplicate(event, quote.id)}><custom-icon icon="content_copy"></custom-icon></button>
           <button class="icon-button" title="Verwijderen" aria-label=${`Offerte ${quote.name} verwijderen`} ?disabled=${this.busyId === quote.id} @click=${(event: Event) => this.removeQuote(event, quote.id)}><custom-icon icon="delete"></custom-icon></button>
         </div>
       </article>`
     })}</section>` : html`<div class="empty"><h3>${all.length ? 'Geen overeenkomende offertes' : 'Nog geen offertes'}</h3>
       <p>${all.length ? 'Pas je zoekopdracht of statusfilter aan.' : 'Maak je eerste prijsvoorstel voor een job.'}</p>
       ${all.length ? html`<button class="button" @click=${clear}>Filters wissen</button>` : html`<a class="button" href="#!/quote">Nieuwe offerte</a>`}
     </div>`}
     ${this.convertQuoteId ? html`<div class="layer" @click=${(event: Event) => { if (event.target === event.currentTarget && !this.converting) this.closeConversion() }}>
       <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="convert-title" @keydown=${(event: KeyboardEvent) => { if (event.key === 'Escape' && !this.converting) this.closeConversion() }}>
         <h2 id="convert-title">Offerte omzetten naar factuur</h2>
         <p>Materiaal, werkbedrag, korting, btw en nog niet gefactureerde uren worden overgenomen.</p>
         <label>Klant<select .value=${this.convertCompany} ?disabled=${this.converting} @change=${(event: Event) => { this.convertCompany = (event.target as HTMLSelectElement).value }}>
           <option value="">Kies een klant</option>${customers.map(([id, company]) => html`<option value=${id}>${company.name}</option>`)}</select>
         </label>
         <div class="dialog-actions"><button class="button" ?disabled=${this.converting} @click=${() => this.closeConversion()}>Annuleren</button><button class="primary" ?disabled=${this.converting || !this.convertCompany} @click=${() => this.convert()}>${this.converting ? 'Aanmaken…' : 'Factuur aanmaken'}</button></div>
       </section></div>` : ''}
   `
 }
}
QuotesView.styles = [...QuotesView.styles, css`
  .page-header,.card { box-shadow:none; }
  .eyebrow { color:var(--app-accent-label); }
  .toolbar { display:flex; flex-direction:column; gap:10px; }
  .status-filters { display:flex; flex-wrap:wrap; gap:6px; }
  .status-filters button { min-height:42px; padding:0 10px; border:1px solid var(--app-border); border-radius:9px; background:var(--app-panel); color:inherit; cursor:pointer; font-size:.78rem; }
  .status-filters button[aria-pressed=true] { background:var(--app-accent-soft); color:var(--app-accent-label); border-color:currentColor; }
  .status-filters span { margin-left:4px; font-variant-numeric:tabular-nums; opacity:.8; }
  .card { display:flex; flex-direction:column; align-items:stretch; gap:0; padding:0; overflow:hidden; }
  .quote-link { display:grid; grid-template-columns:42px minmax(0,1fr) auto;align-items:start;gap:12px; flex:1; padding:14px; color:inherit; text-decoration:none; }
  .quote-link:hover { background:var(--app-panel-strong); }
  .quote-link:focus-visible { outline-offset:-3px; }
  .copy h3,.copy p { white-space:normal; overflow-wrap:anywhere; }
  .copy time { margin-left:6px; color:var(--md-sys-color-on-surface-variant); font-size:.68rem; font-variant-numeric:tabular-nums; }
  .status { color:var(--app-accent-label); }
  .status[data-status=approved] { color:color-mix(in srgb,var(--app-success) 70%,var(--md-sys-color-on-surface) 30%); background:var(--app-success-soft); }
  .status[data-status=rejected] { color:var(--md-sys-color-error); background:color-mix(in srgb,currentColor 12%,transparent); }
  .price { display:grid; justify-items:end; gap:3px; text-align:right; font-variant-numeric:tabular-nums; }
  .price small { color:var(--md-sys-color-on-surface-variant); font-size:.68rem; }
  .actions { justify-content:flex-end; align-items:center; flex-wrap:wrap; padding:7px 12px; border-top:1px solid var(--app-border); }
  .actions :is(.button,.icon-button) { min-height:40px; font-size:.75rem; }
  .actions .icon-button { width:40px; }
  .empty { display:grid; justify-items:center; gap:10px; padding:28px 14px; }
  .empty h3 { color:var(--md-sys-color-on-surface); }
  @media(max-width:760px) { .quote-link { grid-template-columns:minmax(0,1fr) auto; padding:12px; } .card-icon { display:none; } }
  @media(max-width:360px) { .status-filters button { padding:0 8px; } .copy time { display:block; margin:5px 0 0; } }
`]
customElements.define('quotes-view',QuotesView)
