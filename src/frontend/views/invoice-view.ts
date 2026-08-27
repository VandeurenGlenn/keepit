import { LiteElement, html, css, property } from '@vandeurenglenn/lite'
import '@vandeurenglenn/lite-elements/icon.js'
import type { Companies, Invoice, Jobs } from '../../types/index.js'
import { api } from '../api/client.js'
import { showToast } from '../helpers/toast.js'
import { setUnsavedChanges } from '../helpers/unsaved-changes.js'

const euro = new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' })

export class InvoiceView extends LiteElement {
  @property({ type: Object, consumes: true }) accessor invoice: Invoice
  @property({ type: Object, consumes: true }) accessor jobs: Jobs = {}
  @property({ type: Object, consumes: true }) accessor companies: Companies = {}
  @property({ type: String }) accessor name = ''
  @property({ type: String }) accessor description = ''
  @property({ type: String }) accessor notes = ''
  @property({ type: Boolean }) accessor saving = false
  @property({ type: String }) accessor status = ''
  syncedInvoice = ''

  static styles = [css`
    :host{display:flex;flex-direction:column;width:100%;max-width:1100px;min-height:100%;gap:16px;padding:22px;box-sizing:border-box}h1,h2,h3,p{margin:0}button,input,textarea{font:inherit}.page-header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 20px;border:1px solid var(--app-border);border-radius:var(--app-radius-panel);background:var(--app-panel);box-shadow:var(--app-shadow-soft)}.heading{display:flex;align-items:center;gap:13px;min-width:0}.back{display:grid;place-items:center;width:40px;height:40px;flex:none;border:1px solid var(--app-border);border-radius:var(--app-radius-control);color:var(--md-sys-color-on-surface);text-decoration:none}.back custom-icon{--custom-icon-color:currentColor;--custom-icon-size:20px}.eyebrow{color:var(--app-accent);font-size:.72rem;font-weight:500}.title-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}h1{margin-top:3px;overflow:hidden;font-size:1.65rem;font-weight:600;line-height:1.12;text-overflow:ellipsis;white-space:nowrap}.subtitle{margin-top:5px;color:var(--md-sys-color-on-surface-variant);font-size:.8rem}.dirty{display:inline-flex;padding:4px 8px;border-radius:999px;background:color-mix(in srgb,#f0a13a 13%,transparent);color:#d98b2e;font-size:.66rem;font-weight:650}.primary{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:42px;padding:0 14px;border:1px solid var(--app-accent-strong);border-radius:var(--app-radius-control);background:var(--app-accent);color:var(--md-sys-color-on-primary);font-weight:600;cursor:pointer}.primary:disabled{opacity:.55;cursor:default}.primary custom-icon{--custom-icon-color:currentColor;--custom-icon-size:18px}.layout{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(280px,.75fr);gap:16px;align-items:start}.panel{display:flex;flex-direction:column;gap:15px;padding:18px;border:1px solid var(--app-border);border-radius:var(--app-radius-panel);background:var(--app-panel);box-shadow:var(--app-shadow-soft)}.panel h2{font-size:.95rem;font-weight:600}.fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}.field{display:flex;flex-direction:column;gap:6px;color:var(--md-sys-color-on-surface-variant);font-size:.72rem;font-weight:600}.field.wide{grid-column:1/-1}input,textarea{width:100%;box-sizing:border-box;border:1px solid var(--app-border);border-radius:var(--app-radius-control);background:var(--app-panel-strong);color:var(--md-sys-color-on-surface)}input{height:43px;padding:0 11px}textarea{min-height:90px;padding:11px;resize:vertical}.actions{display:flex;align-items:center;justify-content:flex-end;gap:10px}.status{margin-right:auto;color:var(--app-success);font-size:.75rem;font-weight:600}.meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.meta{padding:11px;border:1px solid var(--app-border);border-radius:var(--app-radius-control);background:var(--app-panel-strong)}.meta span,.meta strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.meta span{color:var(--md-sys-color-on-surface-variant);font-size:.66rem}.meta strong{margin-top:4px;font-size:.78rem;font-weight:600}.summary{display:flex;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid var(--app-border);font-size:.78rem}.summary:last-child{border-bottom:0}.summary span{color:var(--md-sys-color-on-surface-variant)}.summary strong{font-weight:600}.gallery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.gallery img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:var(--app-radius-control);border:1px solid var(--app-border)}.empty{padding:24px;border:1px dashed var(--app-border);border-radius:var(--app-radius-control);color:var(--md-sys-color-on-surface-variant);font-size:.78rem;text-align:center}button:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid var(--app-accent);outline-offset:2px}@media(max-width:760px){:host{padding:12px}.page-header{padding:14px}.layout{grid-template-columns:1fr}.fields{grid-template-columns:1fr}.field.wide{grid-column:auto}.primary .label{display:none}.page-header>.primary{width:42px;padding:0}}@media(max-width:420px){.meta-grid{grid-template-columns:1fr}.title-row{display:block}.dirty{margin-top:6px}}
  `]

  onChange(propertyKey: string, value: unknown) {
    if (propertyKey === 'invoice' && value) this.syncInvoice(value as Invoice)
    queueMicrotask(() => setUnsavedChanges('invoice', this.dirty))
  }

  disconnectedCallback() { setUnsavedChanges('invoice', false); super.disconnectedCallback() }

  syncInvoice(invoice: Invoice) {
    const marker = `${invoice.createdAt}:${invoice.updatedAt}`
    if (marker === this.syncedInvoice) return
    this.syncedInvoice = marker
    this.name = invoice.name || ''
    this.description = invoice.description || ''
    this.notes = invoice.notes || ''
    this.status = ''
  }

  get dirty() {
    if (!this.invoice) return false
    return this.name.trim() !== (this.invoice.name || '') ||
      this.description !== (this.invoice.description || '') ||
      this.notes !== (this.invoice.notes || '')
  }

  async save() {
    const id = new URLSearchParams(location.hash.split('?')[1] || '').get('selected')
    if (!id) return
    if (!this.name.trim()) {
      showToast('Geef de factuur een naam.')
      return
    }
    this.saving = true
    this.status = ''
    try {
      await api.updateInvoice(id, { name: this.name.trim(), description: this.description, notes: this.notes })
      this.invoice = { ...this.invoice, name: this.name.trim(), description: this.description, notes: this.notes, updatedAt: new Date().toISOString() }
      this.syncInvoice(this.invoice)
      setUnsavedChanges('invoice', false)
      this.status = 'Wijzigingen opgeslagen'
      showToast('Factuur opgeslagen.')
    } catch (error) {
      console.error(error)
      this.status = 'Opslaan mislukt'
      showToast('De factuur kon niet opgeslagen worden.')
    } finally {
      this.saving = false
    }
  }

  render() {
    if (!this.invoice) return html`<loading-view></loading-view>`
    if (!this.syncedInvoice) this.syncInvoice(this.invoice)
    const job = this.jobs?.[this.invoice.job]
    const company = this.companies?.[this.invoice.company]
    const materials = this.invoice.materials || []
    const materialTotal = materials.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0)
    const images = this.invoice.invoiceImages || []
    return html`
      <header class="page-header"><div class="heading"><a class="back" href="#!/invoices" aria-label="Terug naar facturen"><custom-icon icon="arrow_back"></custom-icon></a><div><span class="eyebrow">Factuurdetail</span><div class="title-row"><h1>${this.name || 'Naamloze factuur'}</h1>${this.dirty ? html`<span class="dirty">Niet opgeslagen</span>` : ''}</div><p class="subtitle">${this.invoice.createdAt ? new Date(this.invoice.createdAt).toLocaleDateString('nl-BE') : 'Datum onbekend'}</p></div></div><button class="primary" aria-label="Factuur opslaan" ?disabled=${this.saving || !this.dirty} @click=${() => this.save()}><custom-icon icon="save"></custom-icon><span class="label">${this.saving ? 'Opslaan…' : 'Opslaan'}</span></button></header>
      <section class="layout"><div class="panel"><h2>Gegevens</h2><div class="fields"><label class="field">Naam<input .value=${this.name} @input=${(event: Event) => (this.name = (event.target as HTMLInputElement).value)} /></label><label class="field wide">Omschrijving<textarea placeholder="Omschrijving van de factuur…" .value=${this.description} @input=${(event: Event) => (this.description = (event.target as HTMLTextAreaElement).value)}></textarea></label><label class="field wide">Interne notities<textarea placeholder="Notities voor intern gebruik…" .value=${this.notes} @input=${(event: Event) => (this.notes = (event.target as HTMLTextAreaElement).value)}></textarea></label></div><div class="actions"><span class="status" role="status">${this.status}</span><button class="primary" ?disabled=${this.saving || !this.dirty} @click=${() => this.save()}>${this.saving ? 'Opslaan…' : 'Wijzigingen opslaan'}</button></div></div><aside class="panel"><h2>Overzicht</h2><div class="meta-grid"><div class="meta"><span>Job</span><strong>${job?.name || 'Niet gekoppeld'}</strong></div><div class="meta"><span>Klant</span><strong>${company?.name || 'Niet gekoppeld'}</strong></div></div><div><div class="summary"><span>Materialen</span><strong>${materials.length} ${materials.length === 1 ? 'regel' : 'regels'}</strong></div><div class="summary"><span>Materiaalwaarde</span><strong>${euro.format(materialTotal)}</strong></div><div class="summary"><span>Beelden</span><strong>${images.length}</strong></div></div>${images.length ? html`<div class="gallery">${images.map((image, index) => html`<img src=${image} alt=${`Factuurbeeld ${index + 1}`} loading="lazy" />`)}</div>` : html`<div class="empty">Geen beelden bij deze factuur.</div>`}</aside></section>`
  }
}

customElements.define('invoice-view', InvoiceView)
