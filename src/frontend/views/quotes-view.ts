import { LiteElement, html, css, property } from '@vandeurenglenn/lite'
import '@vandeurenglenn/lite-elements/icon.js'
import type { Jobs, Quote, Quotes, QuoteStatus } from '../../types/index.js'
import { api } from '../api/client.js'

const statusLabels: Record<QuoteStatus, string> = {
  draft: 'Concept', sent: 'Verzonden', approved: 'Goedgekeurd', rejected: 'Afgewezen'
}

export class QuotesView extends LiteElement {
  @property({ type: Object, consumes: true }) accessor quotes: Quotes = {}
  @property({ type: Object, consumes: true }) accessor jobs: Jobs = {}
  @property({ type: String }) accessor searchQuery = ''
  @property({ type: String }) accessor statusFilter = 'all'
  @property({ type: String }) accessor busyId = ''

  static styles = [css`
    :host{display:flex;flex-direction:column;width:100%;max-width:1180px;min-height:100%;gap:16px;padding:22px;box-sizing:border-box}h1,h2,h3,p{margin:0}button,input,select{font:inherit}.page-header{position:relative;display:flex;align-items:center;justify-content:space-between;gap:20px;padding:22px 24px;overflow:hidden;border:1px solid var(--app-border);border-radius:22px;background:radial-gradient(circle at 92% 10%,var(--app-accent-soft),transparent 32%),linear-gradient(145deg,var(--app-panel-strong),var(--app-panel));box-shadow:var(--app-shadow-soft)}.page-header::before{content:'';position:absolute;inset:0 auto 0 0;width:4px;background:var(--app-accent)}.heading{display:flex;align-items:center;gap:15px}.page-icon{display:grid;place-items:center;width:52px;height:52px;border-radius:15px;background:var(--app-accent-soft);color:var(--app-accent);--custom-icon-color:currentColor;--custom-icon-size:27px}.eyebrow{color:var(--app-accent);font-size:.72rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase}h1{margin-top:3px;font-size:clamp(1.65rem,3vw,2.3rem);line-height:1.05}.subtitle{margin-top:6px;color:var(--md-sys-color-on-surface-variant);font-size:.86rem}.primary{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 16px;border:1px solid var(--app-accent-strong);border-radius:12px;background:var(--app-accent);color:var(--md-sys-color-on-primary);font-weight:750;text-decoration:none}.primary custom-icon{--custom-icon-color:currentColor;--custom-icon-size:19px}.toolbar{display:grid;grid-template-columns:minmax(0,1fr) 190px;gap:10px}.search-wrap{position:relative}.search-wrap custom-icon{position:absolute;left:13px;top:50%;transform:translateY(-50%);--custom-icon-size:19px;--custom-icon-color:var(--md-sys-color-on-surface-variant)}input,select{width:100%;height:44px;box-sizing:border-box;border:1px solid var(--app-border);border-radius:13px;background:var(--app-panel);color:var(--md-sys-color-on-surface)}input{padding:0 13px 0 42px}select{padding:0 12px}.list-heading{display:flex;align-items:end;justify-content:space-between}.list-heading h2{font-size:1rem}.count{color:var(--md-sys-color-on-surface-variant);font-size:.8rem}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.card{position:relative;display:grid;grid-template-columns:44px minmax(0,1fr) auto;align-items:center;gap:12px;min-height:96px;padding:14px;border:1px solid var(--app-border);border-radius:17px;background:linear-gradient(145deg,var(--app-panel-strong),var(--app-panel));box-shadow:var(--app-shadow-soft)}.card-link{position:absolute;inset:0;border-radius:inherit}.card-icon{display:grid;place-items:center;width:44px;height:44px;border-radius:13px;background:var(--app-accent-soft);color:var(--app-accent);--custom-icon-color:currentColor;--custom-icon-size:22px}.copy{min-width:0}.copy h3,.copy p{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.copy h3{font-size:.94rem}.copy p{margin-top:5px;color:var(--md-sys-color-on-surface-variant);font-size:.75rem}.meta{display:flex;align-items:center;justify-content:flex-end;gap:8px}.amount{font-size:.94rem;font-weight:850}.status{display:inline-flex;margin-top:7px;padding:4px 8px;border-radius:999px;background:var(--app-accent-soft);color:var(--app-accent);font-size:.66rem;font-weight:800}.actions{position:relative;z-index:1;display:flex;gap:5px}.icon-button{display:grid;place-items:center;width:34px;height:34px;padding:0;border:1px solid var(--app-border);border-radius:10px;background:var(--app-panel);color:var(--md-sys-color-on-surface-variant);cursor:pointer}.icon-button custom-icon{--custom-icon-color:currentColor;--custom-icon-size:17px}.icon-button.danger:hover{color:var(--md-sys-color-error)}.empty{padding:48px 20px;border:1px dashed var(--app-border);border-radius:18px;color:var(--md-sys-color-on-surface-variant);text-align:center}@media(max-width:760px){:host{padding:12px}.page-header{padding:18px;border-radius:19px}.page-icon{display:none}.primary{width:44px;padding:0}.primary span{display:none}.toolbar,.grid{grid-template-columns:1fr}.card{grid-template-columns:40px minmax(0,1fr);padding-right:12px}.card-icon{width:40px;height:40px}.meta{grid-column:2;justify-content:space-between}.actions{margin-left:auto}}
  `]

  total(quote: Quote) { return quote.materials.reduce((sum, item) => sum + item.quantity * (item.unitPrice || 0), 0) }

  duplicate = async (event: Event, id: string) => {
    event.preventDefault(); event.stopPropagation(); this.busyId = id
    try { const quote = await api.duplicateQuote(id); this.quotes = { ...this.quotes, [quote.id]: quote } }
    catch (error) { console.error(error); alert('De offerte kon niet gedupliceerd worden.') }
    finally { this.busyId = '' }
  }

  removeQuote = async (event: Event, id: string) => {
    event.preventDefault(); event.stopPropagation()
    if (!confirm('Deze offerte verwijderen?')) return
    this.busyId = id
    try { await api.deleteQuote(id); const next = { ...this.quotes }; delete next[id]; this.quotes = next }
    catch (error) { console.error(error); alert('De offerte kon niet verwijderd worden.') }
    finally { this.busyId = '' }
  }

  render() {
    const query = this.searchQuery.trim().toLowerCase()
    const entries = Object.values(this.quotes || {}).filter((quote) => {
      const job = this.jobs?.[quote.jobId]
      return (this.statusFilter === 'all' || quote.status === this.statusFilter) && (!query || `${quote.name} ${job?.name || ''}`.toLowerCase().includes(query))
    }).sort((a,b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    return html`<header class="page-header"><div class="heading"><span class="page-icon"><custom-icon icon="request_quote"></custom-icon></span><div><span class="eyebrow">Verkoop</span><h1>Offertes</h1><p class="subtitle">Bewaar, verstuur en volg prijsvoorstellen op.</p></div></div><a class="primary" href="#!/quote"><custom-icon icon="add"></custom-icon><span>Nieuwe offerte</span></a></header><div class="toolbar"><div class="search-wrap"><custom-icon icon="search"></custom-icon><input type="search" placeholder="Zoek offerte of job…" .value=${this.searchQuery} @input=${(event:Event)=>(this.searchQuery=(event.target as HTMLInputElement).value)} /></div><select aria-label="Filter op status" .value=${this.statusFilter} @change=${(event:Event)=>(this.statusFilter=(event.target as HTMLSelectElement).value)}><option value="all">Alle statussen</option>${Object.entries(statusLabels).map(([value,label])=>html`<option value=${value}>${label}</option>`)}</select></div><div class="list-heading"><h2>Opgeslagen offertes</h2><span class="count">${entries.length} resultaten</span></div>${entries.length?html`<section class="grid">${entries.map((quote)=>{const job=this.jobs?.[quote.jobId];return html`<article class="card"><a class="card-link" href=${`#!/quote?selected=${quote.id}`} aria-label=${quote.name}></a><span class="card-icon"><custom-icon icon="description"></custom-icon></span><div class="copy"><h3>${quote.name}</h3><p>${job?.name||'Onbekende job'} · bijgewerkt ${new Date(quote.updatedAt).toLocaleDateString('nl-BE')}</p><span class="status">${statusLabels[quote.status]}</span></div><div class="meta"><strong class="amount">€ ${this.total(quote).toFixed(2)}</strong><div class="actions"><button class="icon-button" ?disabled=${this.busyId===quote.id} title="Dupliceren" @click=${(event:Event)=>this.duplicate(event,quote.id)}><custom-icon icon="content_copy"></custom-icon></button><button class="icon-button danger" ?disabled=${this.busyId===quote.id} title="Verwijderen" @click=${(event:Event)=>this.removeQuote(event,quote.id)}><custom-icon icon="delete"></custom-icon></button></div></div></article>`})}</section>`:html`<div class="empty">Nog geen offertes gevonden. Maak je eerste offerte aan.</div>`}`
  }
}

customElements.define('quotes-view', QuotesView)
