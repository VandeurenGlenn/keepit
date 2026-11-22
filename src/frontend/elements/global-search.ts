import { LiteElement, css, html, property } from '@vandeurenglenn/lite'
import { api } from '../api/client.js'
import { LatestOperation } from '../helpers/latest-operation.js'

type Result = { id: string; type: string; title: string; subtitle?: string; href: string; icon: string }

export class GlobalSearch extends LiteElement {
  @property({ type: Boolean, reflect: true }) accessor open = false
  @property({ type: String }) accessor query = ''
  @property({ type: Array }) accessor results: Result[] = []
  @property({ type: Boolean }) accessor loading = false
  timer?: ReturnType<typeof setTimeout>
  private readonly operation = new LatestOperation()
  @property({ type: Number }) accessor failures = 0
  @property({ type: Boolean }) accessor enabled = false
  previouslyFocused?: HTMLElement

  static styles = [css`
    :host{display:none}:host([open]){display:block;position:fixed;z-index:1500;inset:0}.backdrop{position:absolute;inset:0;background:rgb(0 0 0/.54);backdrop-filter:blur(3px)}.dialog{position:relative;width:min(680px,calc(100vw - 28px));max-height:min(720px,calc(100vh - 40px));margin:9vh auto 0;overflow:hidden;border:1px solid var(--app-border);border-radius:var(--app-radius-dialog);background:var(--md-sys-color-surface);box-shadow:var(--app-shadow-strong)}.search{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--app-border)}.search custom-icon{--custom-icon-size:22px;--custom-icon-color:var(--app-accent)}input{width:100%;height:42px;border:0;outline:0;background:transparent;color:var(--md-sys-color-on-surface);font:inherit;font-size:1rem}.key{padding:4px 7px;border:1px solid var(--app-border);border-radius:7px;color:var(--md-sys-color-on-surface-variant);font-size:.68rem}.results{display:flex;flex-direction:column;gap:5px;max-height:540px;overflow:auto;padding:9px}.result{display:grid;grid-template-columns:40px minmax(0,1fr) auto;align-items:center;gap:11px;padding:10px;border-radius:12px;color:inherit;text-decoration:none}.result:hover,.result:focus-visible{background:var(--app-accent-soft);outline:0}.icon{display:grid;place-items:center;width:40px;height:40px;border-radius:11px;background:var(--app-panel-strong);color:var(--app-accent)}.icon custom-icon{--custom-icon-color:currentColor;--custom-icon-size:20px}.copy{min-width:0}.copy strong,.copy span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.copy strong{font-size:.86rem}.copy span,.type{margin-top:3px;color:var(--md-sys-color-on-surface-variant);font-size:.71rem}.empty{padding:38px 18px;color:var(--md-sys-color-on-surface-variant);text-align:center;font-size:.84rem}@media(max-width:600px){.dialog{position:absolute;inset:auto 0 0;width:100%;max-height:86vh;margin:0;border-radius:var(--app-radius-dialog) var(--app-radius-dialog) 0 0}.key{display:none}}
  `]

  connectedCallback(){super.connectedCallback();window.addEventListener('keepit-open-search',this.show);window.addEventListener('keydown',this.keydown)}
  disconnectedCallback(){this.operation.cancel();clearTimeout(this.timer);window.removeEventListener('keepit-open-search',this.show);window.removeEventListener('keydown',this.keydown);super.disconnectedCallback()}
  show=()=>{if(!this.enabled)return;if(!this.open){this.previouslyFocused=(this.getRootNode() as ShadowRoot).activeElement as HTMLElement;this.query='';this.results=[];this.failures=0;this.loading=false;this.open=true}requestAnimationFrame(()=>this.shadowRoot?.querySelector<HTMLInputElement>('input')?.focus())}
  close=()=>{this.open=false;this.operation.cancel();clearTimeout(this.timer);requestAnimationFrame(()=>this.previouslyFocused?.focus())}
  keydown=(event:KeyboardEvent)=>{if(!this.enabled)return;if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();this.show()}else if(event.key==='Escape'&&this.open)this.close()}
  search(event: Event) {
    this.query = (event.target as HTMLInputElement).value
    clearTimeout(this.timer)
    const signal = this.operation.begin()
    const query = this.query.trim().slice(0, 120)
    this.results = []
    this.failures = 0
    this.loading = query.length >= 2
    if (!this.loading) return
    this.timer = setTimeout(() => {
      let remaining = 2
      let core: Result[] = []
      let shop: Result[] = []
      const run = async (load: () => Promise<void>) => {
        try { await load() } catch { if (!signal.aborted) this.failures++ }
        finally {
          if (!signal.aborted) {
            this.results = [...core, ...shop]
            this.loading = --remaining > 0
          }
        }
      }
      void run(async () => { core = (await api.globalSearch(query, signal)).results })
      void run(async () => {
        const response = await api.getShopProducts(query, { limit: 5 }, signal)
        shop = response.products.map((product) => ({
          id: product.id, type: 'Materiaal', title: product.name, subtitle: product.articleNumber || product.source,
          href: `#!/shop?${new URLSearchParams({ search: query, selected: product.id })}`, icon: 'inventory2'
        }))
      })
    }, 220)
  }
  dialogKeydown(event:KeyboardEvent){const input=this.shadowRoot?.querySelector<HTMLInputElement>('input');const results=Array.from(this.shadowRoot?.querySelectorAll<HTMLElement>('.result')||[]);if(event.key==='ArrowDown'){event.preventDefault();const index=results.indexOf(this.shadowRoot?.activeElement as HTMLElement);(results[index+1]||results[0])?.focus();return}if(event.key==='ArrowUp'){event.preventDefault();const index=results.indexOf(this.shadowRoot?.activeElement as HTMLElement);(index>0?results[index-1]:input)?.focus();return}if(event.key==='Tab'){const focusable=[input,...results].filter(Boolean) as HTMLElement[];const first=focusable[0],last=focusable[focusable.length-1];if(event.shiftKey&&this.shadowRoot?.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&this.shadowRoot?.activeElement===last){event.preventDefault();first?.focus()}}}
  render(){return html`<button class="backdrop" tabindex="-1" aria-label="Zoeken sluiten" @click=${this.close}></button><section class="dialog" role="dialog" aria-modal="true" aria-label="Zoeken in Keepit" @keydown=${(event:KeyboardEvent)=>this.dialogKeydown(event)}><div class="search"><custom-icon icon="search"></custom-icon><input type="search" aria-label="Zoeken in Keepit" placeholder="Zoek jobs, klanten, materiaal…" .value=${this.query} @input=${(event:Event)=>this.search(event)} /><span class="key">ESC</span></div><div class="results" aria-live="polite">${this.query.trim().length<2?html`<div class="empty">Typ minstens twee tekens. Gebruik ⌘K om overal te zoeken.</div>`:this.results.length?this.results.map((item)=>html`<a class="result" href=${item.href} @click=${this.close}><span class="icon"><custom-icon icon=${item.icon}></custom-icon></span><span class="copy"><strong>${item.title}</strong><span>${item.subtitle||item.type}</span></span><span class="type">${item.type}</span></a>`):this.loading?html`<div class="empty">Zoeken…</div>`:this.failures===2?html`<div class="empty" role="alert">Zoeken lukt momenteel niet. Probeer het opnieuw.</div>`:this.failures?html`<div class="empty">Een deel van de zoekresultaten is niet beschikbaar.</div>`:html`<div class="empty">Geen resultaten voor “${this.query}”.</div>`}${this.results.length && this.failures ? html`<div class="empty">Een deel van de zoekresultaten kon niet geladen worden.</div>` : ''}</div></section>`}
}
customElements.define('global-search',GlobalSearch)
