import { LiteElement, html, css, property } from '@vandeurenglenn/lite'
import '@material/web/textfield/outlined-text-field.js'
import { Job, MaterialLine, Prestation, User } from '../../types/index.js'
import { api } from '../api/client.js'
import './../elements/view/header.js'

function msToTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '-'

  let seconds = (ms / 1000).toFixed(1)
  let minutes = (ms / (1000 * 60)).toFixed(1)
  let hours = (ms / (1000 * 60 * 60)).toFixed(1)
  let days = (ms / (1000 * 60 * 60 * 24)).toFixed(1)
  if (Number(seconds) < 60) return seconds + ' s'
  else if (Number(minutes) < 60) return minutes + 'm'
  else if (Number(hours) < 24) return hours + ' h'
  else return days + ' Days'
}

const getPrestationDuration = (prestation: Prestation): number => {
  if (typeof prestation.duration === 'number' && Number.isFinite(prestation.duration)) {
    return prestation.duration
  }

  const checkin = Number(prestation.checkin)
  const checkout = prestation.checkout !== undefined ? Number(prestation.checkout) : Number.NaN

  if (Number.isFinite(checkin) && Number.isFinite(checkout)) {
    return Math.max(0, checkout - checkin)
  }

  return Number.NaN
}

const formatDateTime = (value?: number): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-'
  return new Date(value).toLocaleString('nl-BE')
}

type HoursByUser = Record<string, Prestation[]>

type MaterialDraft = {
  name: string
  quantity: number
  unit: string
  unitPrice?: number
  articleNumber?: string
  productNumber?: string
  packagingQuantity?: number
}

export class JobView extends LiteElement {
  @property({ type: Object, consumes: true }) accessor user: User | undefined = undefined
  @property({ type: Object }) accessor hours: HoursByUser = {}
  @property({ type: Object }) accessor users: { [userId: string]: User } = {}
  @property({ type: Object }) accessor openUsers: Record<string, boolean> = {}
  @property({ type: Boolean }) accessor openMaterials = false
  @property({ type: Array }) accessor materialSuggestions: MaterialLine[] = []
  @property({ type: Array }) accessor materials: MaterialDraft[] = []
  @property({ type: String }) accessor selectedJobId = ''

  favoriteNames: Set<string> = new Set()

  static styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        max-width: 860px;
        padding: 16px;
        box-sizing: border-box;
        gap: 18px;
      }

      .details-panel,
      .section-panel {
        display: flex;
        flex-direction: column;
        gap: 14px;
        width: 100%;
        padding: 18px;
        border-radius: 24px;
        background: linear-gradient(180deg, color-mix(in srgb, var(--app-panel) 96%, white 4%), var(--app-panel));
        border: 1px solid var(--app-border);
        box-shadow: var(--app-shadow-strong);
        box-sizing: border-box;
      }

      .section-title,
      .hours-group strong,
      .note-meta,
      h4 {
        margin: 0;
      }

      .section-title {
        font-size: 1.15rem;
      }

      .hours-list,
      .notes-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .hours-group,
      .note-item {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 14px;
        border-radius: 18px;
        background: color-mix(in srgb, var(--app-panel-strong) 95%, white 5%);
        border: 1px solid color-mix(in srgb, var(--app-border) 84%, transparent 16%);
      }

      .materials-panel {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .materials-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }

      .materials-header-meta {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }

      .materials-total-inline {
        color: var(--muted-color, var(--md-sys-color-on-surface-variant));
        font-size: 0.92rem;
      }

      .materials-toggle,
      .materials-add,
      .materials-save {
        border: 1px solid color-mix(in srgb, var(--app-border) 84%, transparent 16%);
        background: color-mix(in srgb, var(--md-sys-color-surface) 94%, white 6%);
        color: var(--md-sys-color-on-surface);
        border-radius: 999px;
        padding: 8px 12px;
        font: inherit;
        cursor: pointer;
      }

      .materials-save {
        background: linear-gradient(
          135deg,
          color-mix(in srgb, var(--app-accent) 88%, white 12%),
          var(--app-accent-strong)
        );
        color: var(--md-sys-color-on-primary);
      }

      .materials-row {
        display: grid;
        grid-template-columns: minmax(180px, 1fr) 100px 120px 120px auto;
        gap: 8px;
        align-items: center;
      }

      .material-input-wrap {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .materials-row input {
        width: 100%;
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid color-mix(in srgb, var(--app-border) 84%, transparent 16%);
        background: color-mix(in srgb, var(--app-panel-strong) 95%, white 5%);
        color: var(--md-sys-color-on-surface);
        box-sizing: border-box;
      }

      .material-meta {
        min-height: 1em;
        font-size: 0.75rem;
        color: var(--md-sys-color-on-surface-variant);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .hours-user-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }

      .hours-user-title {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }

      .hours-user-total {
        color: var(--muted-color, var(--md-sys-color-on-surface-variant));
        font-size: 0.92rem;
      }

      .hours-user-toggle {
        border: 1px solid color-mix(in srgb, var(--app-border) 84%, transparent 16%);
        background: color-mix(in srgb, var(--md-sys-color-surface) 94%, white 6%);
        color: var(--md-sys-color-on-surface);
        border-radius: 999px;
        padding: 8px 12px;
        font: inherit;
        cursor: pointer;
      }

      .hours-total {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 14px;
        border-radius: 14px;
        background: color-mix(in srgb, var(--app-accent) 12%, var(--app-panel-strong) 88%);
        border: 1px solid color-mix(in srgb, var(--app-accent) 28%, var(--app-border) 72%);
        font-weight: 600;
      }

      .hour-entry {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
      }

      .note-meta {
        font-size: 12px;
        color: var(--muted-color, var(--md-sys-color-on-surface-variant));
      }

      button.primary {
        border: 1px solid color-mix(in srgb, var(--app-accent) 82%, white 18%);
        background: linear-gradient(
          135deg,
          color-mix(in srgb, var(--app-accent) 88%, white 12%),
          var(--app-accent-strong)
        );
        color: var(--md-sys-color-on-primary);
        border-radius: 999px;
        padding: 12px 18px;
        font: inherit;
        cursor: pointer;
        width: fit-content;
      }

      @media (max-width: 720px) {
        :host {
          padding: 12px;
        }

        .details-panel,
        .section-panel {
          padding: 16px;
          border-radius: 20px;
        }

        .hour-entry {
          flex-direction: column;
        }

        .materials-row {
          grid-template-columns: 1fr 1fr;
        }

        .materials-row button {
          grid-column: span 2;
        }

        button.primary {
          width: 100%;
        }
      }
    `
  ]

  async onChange(propertyKey: string): Promise<void> {
    if (propertyKey === 'job') {
      const params = new URLSearchParams(globalThis.location.href.split('?')[1] || '')
      const selected = params.get('selected')
      if (!selected) {
        this.hours = {}
        this.users = {}
        this.openUsers = {}
        return
      }
      this.selectedJobId = selected
      this.materials = this.normalizeMaterials(this.job?.materials)
      this.openMaterials = false
      await this.loadMaterialSuggestions()

      try {
        this.hours = await api.getJobHours(selected)

        const nextUsers: Record<string, User> = {}
        const userIds = Object.keys(this.hours)

        for (const userId of userIds) {
          try {
            nextUsers[userId] = await api.getUser(userId)
          } catch (error) {
            console.error(`Failed to load user ${userId}:`, error)
          }
        }

        this.users = nextUsers
        this.openUsers = {}
      } catch (error) {
        console.error('Failed to load hours:', error)
        this.hours = {}
        this.users = {}
        this.openUsers = {}
      }
    }
  }

  normalizeMaterials(value: MaterialLine[] | undefined): MaterialDraft[] {
    if (!Array.isArray(value)) return [{ name: '', quantity: 1, unit: '', unitPrice: undefined }]

    const normalized = value
      .map((material) => ({
        name: material.name || '',
        quantity: Number(material.quantity) > 0 ? Number(material.quantity) : 1,
        unit: material.unit || '',
        unitPrice: material.unitPrice !== undefined ? Number(material.unitPrice) : undefined,
        articleNumber: material.articleNumber,
        productNumber: material.productNumber,
        packagingQuantity: material.packagingQuantity
      }))
      .filter((material) => material.name.trim().length > 0)

    return normalized.length > 0 ? normalized : [{ name: '', quantity: 1, unit: '', unitPrice: undefined }]
  }

  resetMaterials() {
    this.materials = [{ name: '', quantity: 1, unit: '', unitPrice: undefined }]
  }

  addMaterialRow = () => {
    this.materials = [...this.materials, { name: '', quantity: 1, unit: '', unitPrice: undefined }]
  }

  removeMaterialRow = (index: number) => {
    this.materials = this.materials.filter((_, currentIndex) => currentIndex !== index)
    if (this.materials.length === 0) this.resetMaterials()
  }

  updateMaterialField<K extends keyof MaterialDraft>(index: number, key: K, value: MaterialDraft[K]) {
    this.materials = this.materials.map((material, currentIndex) =>
      currentIndex === index ? { ...material, [key]: value } : material
    )

    // Track to history when a complete material is added
    if (key === 'name' && typeof value === 'string' && value.trim()) {
      const updatedMaterial = this.materials[index]
      if (updatedMaterial) {
        void api.addToHistory({
          name: updatedMaterial.name,
          quantity: updatedMaterial.quantity,
          unit: updatedMaterial.unit,
          unitPrice: updatedMaterial.unitPrice,
          articleNumber: updatedMaterial.articleNumber,
          productNumber: updatedMaterial.productNumber,
          packagingQuantity: updatedMaterial.packagingQuantity
        })
      }
    }
  }

  get sanitizedMaterials(): MaterialLine[] {
    const normalized: MaterialLine[] = []

    for (const material of this.materials) {
      const name = material.name.trim()
      if (!name) continue

      const quantity = Number(material.quantity)
      const unitPrice = material.unitPrice === undefined ? undefined : Number(material.unitPrice)

      normalized.push({
        name,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        unit: material.unit.trim() || undefined,
        unitPrice: unitPrice !== undefined && Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : undefined,
        articleNumber: material.articleNumber,
        productNumber: material.productNumber,
        packagingQuantity: material.packagingQuantity
      })
    }

    return normalized
  }

  get materialsTotal(): number {
    return this.sanitizedMaterials.reduce((sum, material) => {
      const unitPrice = material.unitPrice || 0
      return sum + unitPrice * material.quantity
    }, 0)
  }

  getMaterialSuggestion(name: string): MaterialLine | undefined {
    const normalized = name.trim().toLowerCase()
    if (!normalized) return undefined
    return this.materialSuggestions.find((suggestion) => suggestion.name.trim().toLowerCase() === normalized)
  }

  getMaterialSuggestionLabel(suggestion: MaterialLine): string {
    const details: string[] = []
    if (suggestion.articleNumber) details.push(`ART: ${suggestion.articleNumber}`)
    if (suggestion.productNumber) details.push(`PROD: ${suggestion.productNumber}`)
    if (typeof suggestion.packagingQuantity === 'number') details.push(`VPH: ${suggestion.packagingQuantity}`)
    if (typeof suggestion.unitPrice === 'number') {
      const unit = suggestion.unit?.trim() ? `/${suggestion.unit.trim()}` : ''
      details.push(`€${suggestion.unitPrice.toFixed(2)}${unit}`)
    }
    return details.join(' | ')
  }

  applyMaterialSuggestion(index: number, name: string) {
    const suggestion = this.getMaterialSuggestion(name)
    if (!suggestion) return

    this.materials = this.materials.map((material, currentIndex) => {
      if (currentIndex !== index) return material
      return {
        ...material,
        name: suggestion.name,
        unit: suggestion.unit || material.unit,
        unitPrice: suggestion.unitPrice ?? material.unitPrice,
        articleNumber: suggestion.articleNumber,
        productNumber: suggestion.productNumber,
        packagingQuantity: suggestion.packagingQuantity
      }
    })
  }

  async loadMaterialSuggestions() {
    try {
      const suggestions = await api.getInvoiceMaterials()
      const allMaterials = Array.isArray(suggestions) ? suggestions : []

      // Get favorites and history
      const favorites = await api.getFavorites()
      const history = await api.getHistory()

      // Cache favorite names for template use
      this.favoriteNames = new Set(favorites.map((m) => m.name))

      // Create a map for quick lookups
      const favoriteNames = new Set(favorites.map((m) => m.name))
      const historyNames = new Set(history.map((m) => m.name))

      // Separate materials
      const favoriteMats = allMaterials.filter((m) => favoriteNames.has(m.name))
      const historyMats = allMaterials.filter((m) => historyNames.has(m.name) && !favoriteNames.has(m.name))
      const otherMats = allMaterials.filter((m) => !favoriteNames.has(m.name) && !historyNames.has(m.name))

      // Combine: favorites first, then recently used, then others
      this.materialSuggestions = [...favoriteMats, ...historyMats, ...otherMats]
    } catch (error) {
      console.error('Failed to load material suggestions:', error)
      this.materialSuggestions = []
    }
  }

  private async refreshFavorites(): Promise<void> {
    try {
      const favorites = await api.getFavorites()
      this.favoriteNames = new Set(favorites.map((m) => m.name))
      this.requestUpdate()
    } catch (error) {
      console.error('Failed to refresh favorites:', error)
    }
  }

  toggleMaterials() {
    this.openMaterials = !this.openMaterials
  }

  async saveMaterials() {
    if (!this.selectedJobId) return alert('Unable to determine job id')

    try {
      const updated = await api.updateJob(this.selectedJobId, { materials: this.sanitizedMaterials })
      this.job = updated
      this.requestRender()
    } catch (error) {
      console.error('Failed to save materials:', error)
      alert('Failed to save materials')
    }
  }

  toggleUserHours(userId: string) {
    this.openUsers = {
      ...this.openUsers,
      [userId]: !this.openUsers[userId]
    }
  }

  @property({ type: Object, consumes: true }) accessor job: Job | undefined = undefined

  @property({ type: String }) accessor newNoteText = ''

  async _addNote() {
    if (!this.job) return

    const text = (this.newNoteText || '').trim()
    if (!text) return alert('Please enter a note')

    const note = {
      id: crypto.randomUUID(),
      text,
      createdAt: new Date().toISOString(),
      author: (this.user as User & { id?: string })?.id || undefined
    }

    const updatedNotes = [...(this.job.notes || []), note]

    // try to determine job uuid key; shell provides this.job from consuming context and may include uuid elsewhere
    const jobId = this.selectedJobId
    if (!jobId) {
      return alert('Unable to determine job id')
    }

    try {
      const updated = await api.updateJob(jobId, { notes: updatedNotes })
      this.job = updated
      this.newNoteText = ''
      this.requestRender()
    } catch (error) {
      console.error('Failed to save note:', error)
      alert('Failed to save note')
    }
  }

  render() {
    if (!this.job) return html`<loading-view></loading-view>`
    const job = this.job
    const totalDurationMs = Object.values(this.hours)
      .flatMap((prestations) => prestations)
      .reduce((sum, prestation) => {
        const duration = getPrestationDuration(prestation)
        return Number.isFinite(duration) ? sum + duration : sum
      }, 0)

    return html`
      <view-header
        .title=${job.name}
        .description=${job.description || job.createdAt}
        icon="inventory2"></view-header>

      <section class="details-panel">
        <md-outlined-text-field
          label="Job Name"
          .value=${job.name}
          @input=${(event: Event) => {
            const input = event.target as HTMLInputElement
            job.name = input.value
          }}></md-outlined-text-field>

        <md-outlined-text-field
          label="Job Description"
          .value=${job.description || ''}
          @input=${(event: Event) => {
            const input = event.target as HTMLInputElement
            job.description = input.value
          }}></md-outlined-text-field>
      </section>

      <section class="section-panel">
        <h4 class="section-title">Hours</h4>
        <div class="hours-total">
          <span>Total hours</span>
          <span>${msToTime(totalDurationMs)}</span>
        </div>
        <div class="hours-list">
          ${Object.keys(this.hours).length
            ? Object.entries(this.hours).map(([userId, prestations]) => {
                const userTotal = prestations.reduce((sum, prestation) => {
                  const duration = getPrestationDuration(prestation)
                  return Number.isFinite(duration) ? sum + duration : sum
                }, 0)
                const isOpen = Boolean(this.openUsers[userId])

                return html`<div class="hours-group">
                  <div class="hours-user-header">
                    <div class="hours-user-title">
                      <strong>${this.users[userId]?.name || userId}</strong>
                      <span class="hours-user-total">${msToTime(userTotal)}</span>
                    </div>
                    <button
                      type="button"
                      class="hours-user-toggle"
                      @click=${() => this.toggleUserHours(userId)}>
                      ${isOpen ? 'Verberg uren' : 'Toon uren'}
                    </button>
                  </div>
                  ${isOpen
                    ? html`<div class="hours-list">
                        ${prestations.map(
                          (prestation) =>
                            html`<div class="hour-entry">
                              <span
                                >${formatDateTime(Number(prestation.checkin))} -
                                ${formatDateTime(Number(prestation.checkout))}</span
                              >
                              <span>${msToTime(getPrestationDuration(prestation))}</span>
                            </div>`
                        )}
                      </div>`
                    : null}
                </div>`
              })
            : html`<div class="hours-group">Nog geen geregistreerde uren.</div>`}
        </div>
      </section>

      <section class="section-panel">
        <div class="materials-header">
          <div class="materials-header-meta">
            <h4 class="section-title">Verbruiksmaterialen</h4>
            <span class="materials-total-inline">Totaal € ${this.materialsTotal.toFixed(2)}</span>
          </div>
          <button
            type="button"
            class="materials-toggle"
            @click=${() => this.toggleMaterials()}>
            ${this.openMaterials ? 'Verberg materialen' : 'Toon materialen'}
          </button>
        </div>

        ${this.openMaterials
          ? html`
              <button
                type="button"
                class="materials-add"
                @click=${this.addMaterialRow}>
                Materiaal toevoegen
              </button>

              <datalist id="job-material-suggestions">
                ${this.materialSuggestions.map(
                  (suggestion) =>
                    html`<option
                      value=${suggestion.name}
                      label=${this.getMaterialSuggestionLabel(suggestion)}></option>`
                )}
              </datalist>

              ${this.materials.map(
                (material, index) => html`
                  <div class="materials-row">
                    <div class="material-input-wrap">
                      <input
                        type="text"
                        list="job-material-suggestions"
                        placeholder="Materiaal"
                        .value=${material.name}
                        @input=${(event: Event) => {
                          const input = event.target as HTMLInputElement
                          this.updateMaterialField(index, 'name', input.value)
                          this.applyMaterialSuggestion(index, input.value)
                        }} />
                      <div class="material-meta">
                        ${material.name
                          ? this.getMaterialSuggestionLabel(this.getMaterialSuggestion(material.name) || material)
                          : ''}
                      </div>
                    </div>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="Aantal"
                      .value=${String(material.quantity)}
                      @input=${(event: Event) => {
                        const input = event.target as HTMLInputElement
                        this.updateMaterialField(index, 'quantity', Number(input.value || 0))
                      }} />
                    <input
                      type="text"
                      placeholder="Eenheid"
                      .value=${material.unit}
                      @input=${(event: Event) => {
                        const input = event.target as HTMLInputElement
                        this.updateMaterialField(index, 'unit', input.value)
                      }} />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="€/stuk"
                      .value=${material.unitPrice === undefined ? '' : String(material.unitPrice)}
                      @input=${(event: Event) => {
                        const input = event.target as HTMLInputElement
                        this.updateMaterialField(
                          index,
                          'unitPrice',
                          input.value === '' ? undefined : Number(input.value)
                        )
                      }} />
                    <button
                      type="button"
                      title=${this.favoriteNames.has(material.name)
                        ? 'Uit favorieten verwijderen'
                        : 'Toevoegen aan favorieten'}
                      @click=${() => {
                        if (material.name.trim()) {
                          if (this.favoriteNames.has(material.name)) {
                            void api.removeFromFavorites(material.name).then(() => this.refreshFavorites())
                          } else {
                            void api
                              .addToFavorites(this.getMaterialSuggestion(material.name) || material)
                              .then(() => this.refreshFavorites())
                          }
                        }
                      }}>
                      ${this.favoriteNames.has(material.name) ? '★' : '☆'}
                    </button>
                    <button
                      type="button"
                      @click=${() => this.removeMaterialRow(index)}>
                      Verwijder
                    </button>
                  </div>
                `
              )}

              <button
                type="button"
                class="materials-save"
                @click=${() => this.saveMaterials()}>
                Materialen opslaan
              </button>
            `
          : null}
      </section>

      <section class="section-panel">
        <h4 class="section-title">Notes</h4>
        <div class="notes-list">
          ${(job.notes || []).length === 0
            ? html`<div class="note-item">No notes</div>`
            : html`${(job.notes || []).map(
                (n) =>
                  html`<div class="note-item">
                    <div class="note-meta">${n.createdAt}${n.author ? ' — ' + n.author : ''}</div>
                    <div>${n.text}</div>
                  </div>`
              )}`}
        </div>

        <md-outlined-text-field
          label="New note"
          .value=${this.newNoteText}
          @input=${(e: Event) => {
            const input = e.target as HTMLInputElement
            this.newNoteText = input.value
          }}></md-outlined-text-field>

        <button
          class="primary"
          @click=${this._addNote.bind(this)}>
          Add note
        </button>
      </section>
    `
  }
}

customElements.define('job-view', JobView)
