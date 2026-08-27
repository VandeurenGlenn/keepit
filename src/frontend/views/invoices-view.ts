import { LiteElement, html, css, property, query } from '@vandeurenglenn/lite'
import '@material/web/fab/fab.js'
import '@vandeurenglenn/lite-elements/icon-button.js'
import '@material/web/textfield/outlined-text-field.js'
import '@vandeurenglenn/flex-elements/container.js'
import './../elements/chip/field.js'
import { JobsMixin } from '../mixins/jobs.js'
import { CompaniesMixin } from '../mixins/companies.js'
import { Invoice, Job, MaterialLine, Prestation, User } from './../../types/index.js'
import { ChipField } from './../elements/chip/field.js'
import { api } from '../api/client.js'
import mimes from 'mime'
import './../elements/list/item.js'
import './../elements/view/header.js'
import '@vandeurenglenn/lite-elements/icon.js'
import { showToast } from '../helpers/toast.js'
import { confirmAction } from '../helpers/confirmation.js'

let debounceTimeout: ReturnType<typeof setTimeout>
function debounce(fn: (...args: any[]) => void, delay = 300) {
  clearTimeout(debounceTimeout)
  debounceTimeout = setTimeout(fn, delay)
}

type MaterialDraft = {
  name: string
  quantity: number
  unit: string
  unitPrice?: number
  articleNumber?: string
  productNumber?: string
  packagingQuantity?: number
}

type HoursByUser = Record<string, Prestation[]>

const durationToHours = (durationMs: number): string => {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return '0.00 h'
  return `${(durationMs / (1000 * 60 * 60)).toFixed(2)} h`
}

const prestationDuration = (prestation: Prestation): number => {
  if (typeof prestation.duration === 'number' && Number.isFinite(prestation.duration)) return prestation.duration
  if (typeof prestation.checkin !== 'number' || typeof prestation.checkout !== 'number') return 0
  return Math.max(0, prestation.checkout - prestation.checkin)
}

const formatDateTime = (value?: number): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-'
  return new Date(value).toLocaleString('nl-BE')
}

export class InvoicesView extends JobsMixin(CompaniesMixin(LiteElement)) {
  @property({ type: Object, consumes: true }) accessor invoices: Record<string, Invoice> = {}
  @property({ type: Boolean }) accessor takingPicture = false
  @property({ type: Boolean }) accessor addingInvoice = false
  @property({ type: String }) accessor facingMode = 'environment'
  @property({ type: Object, consumes: true }) accessor user: User | undefined = undefined
  @property({ type: Object, consumes: true }) accessor companies: Record<string, unknown> = {}
  @property({ type: String }) accessor notes = ''
  @property({ type: Array }) accessor materialSuggestions: MaterialLine[] = []
  @property({ type: Array }) accessor materials: MaterialDraft[] = []
  @property({ type: Object }) accessor billableHours: HoursByUser = {}
  @property({ type: Object }) accessor hourUsers: Record<string, User> = {}
  @property({ type: Object }) accessor openHourUsers: Record<string, boolean> = {}
  @property({ type: Boolean }) accessor openMaterials = false

  @query('chip-field[label="jobs"]') accessor jobChips!: ChipField
  @query('chip-field[label="companies"]') accessor companyChips!: ChipField

  currentStream: MediaStream | null = null
  favoriteNames: Set<string> = new Set()

  dataUrl: string | null = null
  static styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        max-width: 1180px;
        gap: 16px;
        padding: 22px;
        box-sizing: border-box;
      }

      .workspace-panel,
      .capture-panel,
      .list-panel {
        display: flex;
        flex-direction: column;
        gap: 16px;
        width: 100%;
        padding: 18px;
        border-radius: var(--app-radius-panel);
        background: var(--app-panel);
        border: 1px solid var(--app-border);
        box-shadow: var(--app-shadow-soft);
        box-sizing: border-box;
      }

      .workspace-head,
      .panel-title-wrap,
      .top-actions,
      .capture-form,
      .list-stack {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .panel-kicker {
        display: inline-flex;
        width: fit-content;
        padding: 6px 10px;
        border-radius: 999px;
        background: var(--app-accent-soft);
        color: var(--app-accent);
        font-size: 0.76rem;
        font-weight: 500;
        letter-spacing: 0;
      }

      .panel-title-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        flex-wrap: wrap;
      }

      .panel-title,
      .panel-description {
        margin: 0;
      }

      .panel-title {
        font-size: 1.5rem;
        line-height: 1.08;
      }

      .panel-description {
        color: var(--md-sys-color-on-surface-variant);
        max-width: 62ch;
        line-height: 1.55;
      }

      button {
        border: 1px solid color-mix(in srgb, var(--app-border) 84%, transparent 16%);
        background: color-mix(in srgb, var(--md-sys-color-surface) 94%, white 6%);
        color: var(--md-sys-color-on-surface);
        min-height: 40px;
        border-radius: 11px;
        padding: 0 14px;
        font: inherit;
        cursor: pointer;
      }

      button.primary {
        background: var(--app-accent);
        color: var(--md-sys-color-on-primary);
        border-color: color-mix(in srgb, var(--app-accent) 82%, white 18%);
      }

      .camera-bar {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 16px;
        position: absolute;
        bottom: 16px;
        left: 0;
        width: 100%;
        background-color: rgba(0, 0, 0, 0.2);
        padding: 16px;
        box-sizing: border-box;
      }

      .camera-wrapper {
        position: relative;
        width: 100%;
        min-height: 420px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        color: var(--md-sys-color-on-background);
        font-size: 2rem;
        text-align: center;
        padding: 16px;
        box-sizing: border-box;
        backdrop-filter: blur(5px);
        transition: opacity 0.3s ease-in-out;
        border-radius: var(--app-radius-panel);
        overflow: hidden;
        background: color-mix(in srgb, var(--md-sys-color-surface-container) 86%, black 14%);
      }

      .list-stack {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .invoice-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .invoice-card {
        position: relative;
        display: flex;
        min-width: 0;
        min-height: 92px;
        border: 1px solid var(--app-border);
        border-radius: 17px;
        background: linear-gradient(145deg, var(--app-panel-strong), var(--app-panel));
        box-shadow: var(--app-shadow-soft);
      }
      .invoice-link {
        display: grid;
        grid-template-columns: 44px minmax(0, 1fr);
        align-items: center;
        gap: 12px;
        width: 100%;
        padding: 15px 54px 15px 15px;
        box-sizing: border-box;
        color: inherit;
        text-decoration: none;
      }
      .invoice-icon {
        display: grid;
        place-items: center;
        width: 44px;
        height: 44px;
        border-radius: 13px;
        background: var(--app-accent-soft);
        color: var(--app-accent);
        --custom-icon-color: currentColor;
        --custom-icon-size: 22px;
      }
      .invoice-copy { min-width: 0; }
      .invoice-copy strong,.invoice-copy span { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .invoice-copy strong { font-size:.94rem; }
      .invoice-copy span { margin-top:5px; color:var(--md-sys-color-on-surface-variant); font-size:.76rem; }
      .invoice-delete {
        position:absolute;
        top:50%;
        right:12px;
        width:34px;
        height:34px;
        min-height:34px;
        padding:0;
        transform:translateY(-50%);
        color:var(--md-sys-color-on-surface-variant);
        background:transparent;
      }
      .invoice-delete:hover { color:var(--md-sys-color-error); }
      .invoice-delete custom-icon { --custom-icon-color:currentColor; --custom-icon-size:18px; }
      .invoice-item {
        border: 1px solid var(--md-sys-color-outline);
        border-radius: 8px;
        padding: 16px;
        background-color: var(--md-sys-color-surface);
        color: var(--md-sys-color-on-surface);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        transition: box-shadow 0.3s;
      }
      .invoice-item:hover {
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
        cursor: pointer;
      }
      .invoice-item h3 {
        margin: 0;
        font-size: 1.5rem;
        color: var(--md-sys-color-primary);
      }
      .invoice-item p {
        margin: 0;
        font-size: 1rem;
        color: var(--md-sys-color-on-surface-variant);
      }

      img[adding-invoice-image] {
        width: min(100%, 520px);
        height: auto;
        border-radius: 18px;
        border: 1px solid color-mix(in srgb, var(--app-border) 84%, transparent 16%);
        box-shadow: var(--app-shadow-soft);
      }

      span {
        width: 100%;
        display: block;
      }

      video {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .notes-field {
        width: 100%;
        margin-top: 4px;
      }

      .materials-panel {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .hours-user-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
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
        color: var(--md-sys-color-on-surface-variant);
        font-size: 0.92rem;
      }

      .hours-user-toggle {
        padding: 8px 12px;
      }

      .materials-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }

      .materials-header h3 {
        margin: 0;
        font-size: 1rem;
      }

      .materials-header-meta {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }

      .materials-total-inline {
        color: var(--md-sys-color-on-surface-variant);
        font-size: 0.92rem;
      }

      .materials-toggle {
        padding: 8px 12px;
      }

      .material-row {
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

      .material-row input {
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

      .material-row button {
        padding: 8px 12px;
      }

      .material-summary {
        display: flex;
        justify-content: flex-end;
        color: var(--md-sys-color-on-surface-variant);
        font-size: 0.92rem;
      }

      @media (max-width: 720px) {
        :host {
          padding: 12px;
        }

        .workspace-panel,
        .capture-panel,
        .list-panel {
          padding: 16px;
          border-radius: var(--app-radius-panel);
        }

        .panel-title-row,
        .top-actions,
        .camera-bar {
          flex-direction: column;
          align-items: stretch;
        }

        button.primary,
        .camera-bar custom-icon-button {
          width: 100%;
        }

        .camera-wrapper {
          min-height: 320px;
        }

        .material-row {
          grid-template-columns: 1fr 1fr;
        }

        .material-row button {
          grid-column: span 2;
        }
      }
      @media (max-width: 780px) { .invoice-grid { grid-template-columns:1fr; } }
    `
  ]

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

  toggleMaterials() {
    this.openMaterials = !this.openMaterials
  }

  loadJobMaterials() {
    const selectedJobId = this.jobChips?.selected?.[0]
    if (!selectedJobId) return

    const selectedJob = this.jobs?.[selectedJobId] as Job | undefined
    const materials = Array.isArray(selectedJob?.materials) ? selectedJob.materials : []

    this.materials = materials.length
      ? materials.map((material) => ({
          name: material.name,
          quantity: Number(material.quantity) > 0 ? Number(material.quantity) : 1,
          unit: material.unit || '',
          unitPrice: material.unitPrice !== undefined ? Number(material.unitPrice) : undefined,
          articleNumber: material.articleNumber,
          productNumber: material.productNumber,
          packagingQuantity: material.packagingQuantity
        }))
      : [{ name: '', quantity: 1, unit: '', unitPrice: undefined }]
    this.openMaterials = true
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

  async loadMaterialSuggestions(company?: string) {
    try {
      const suggestions = await api.getInvoiceMaterials(company)
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
      this.materialSuggestions = [...this.materialSuggestions]
    } catch (error) {
      console.error('Failed to refresh favorites:', error)
    }
  }

  async loadBillableHours(jobId?: string) {
    if (!jobId) {
      this.billableHours = {}
      this.hourUsers = {}
      this.openHourUsers = {}
      return
    }

    try {
      this.billableHours = await api.getJobHours(jobId, true)

      const nextUsers: Record<string, User> = {}
      const userIds = Object.keys(this.billableHours)

      await Promise.all(
        userIds.map(async (userId) => {
          try {
            nextUsers[userId] = await api.getUser(userId)
          } catch (error) {
            console.error(`Failed to load user ${userId}:`, error)
          }
        })
      )

      this.hourUsers = nextUsers
      this.openHourUsers = {}
    } catch (error) {
      console.error('Failed to load billable hours:', error)
      this.billableHours = {}
      this.hourUsers = {}
      this.openHourUsers = {}
    }
  }

  toggleBillableHours(userId: string) {
    this.openHourUsers = {
      ...this.openHourUsers,
      [userId]: !this.openHourUsers[userId]
    }
  }

  get totalBillableDuration(): number {
    return Object.values(this.billableHours)
      .flatMap((prestations) => prestations)
      .reduce((sum, prestation) => sum + prestationDuration(prestation), 0)
  }

  _addInvoice = async () => {
    console.log('Adding a new invoice...')
    // make sure to set the takingPicture to true before setting the addingInvoice to true
    // to avoid flickering/seeing the final invoice step
    this.takingPicture = true
    this.addingInvoice = true
    this.notes = ''
    this.resetMaterials()
    this.openMaterials = false
    this.billableHours = {}
    this.hourUsers = {}
    this.openHourUsers = {}
    await this.loadMaterialSuggestions()

    // Logic to add a new invoice
    this.currentStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: this.facingMode,
        width: { ideal: 2480 },
        height: { ideal: 3508 }
      }
    })

    const video = this.shadowRoot?.querySelector('video')
    if (!video) return
    video.srcObject = this.currentStream
    video.setAttribute('playsinline', '')
    video.setAttribute('autoplay', '')
    video.setAttribute('muted', '')

    video.play()
    // You can add your logic here to add a new invoice
  }
  _handleFabKeyUp = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === 'Space') {
      event.preventDefault()
      this._addInvoice()
    }
  }

  _takePicture = async () => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas')
      const video = this.shadowRoot?.querySelector('video')
      if (!video || !this.currentStream) {
        resolve(undefined)
        return
      }

      const { height, width } = this.currentStream.getVideoTracks()[0].getSettings()
      canvas.width = width || video.videoWidth || 1920
      canvas.height = height || video.videoHeight || 1080
      const context = canvas.getContext('2d')
      if (!context) {
        resolve(undefined)
        return
      }

      context.drawImage(video, 0, 0)

      const data = canvas.toDataURL('image/png', 1.0)
      this.dataUrl = data
      this.takingPicture = false

      //  photo.setAttribute('src', data)
    })
  }

  dataURLtoFile(dataurl: string, filename: string) {
    const arr = dataurl.split(',')
    const mimeMatch = arr[0]?.match(/:(.*?);/)
    if (!mimeMatch) throw new Error('Invalid data url')
    const mime = mimeMatch[1]
    const bstr = atob(arr[arr.length - 1])
    let n = bstr.length
    const u8arr = new Uint8Array(n)
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n)
    }
    return new File([u8arr], `${filename}.${mimes.getExtension(mime)}`, { type: mime })
  }

  _saveInvoice = async () => {
    const selectedCompany = this.companyChips.selected[0]
    const selectedJob = this.jobChips.selected[0]
    const companies = ((this as any).companies || {}) as Record<string, any>
    const userId = (this.user as User & { id?: string })?.id || this.user?.email
    const materials = this.sanitizedMaterials
    if (!userId) return showToast('Er is geen actieve gebruiker gevonden.')

    if (!this.notes && !selectedJob) return showToast('Kies een job of voeg een notitie toe.')
    if (!this.notes) this.notes = 'No notes'
    if (!selectedCompany) return showToast('Kies een klant of leverancier.')

    const _date = new Date()
    const date = _date.toISOString()
    const formattedDate = _date.toLocaleDateString().replace(/\//g, '-')

    const minutes = _date.getMinutes()
    const formattedTime = `${_date.getHours()}:${minutes < 10 ? '0' : ''}${minutes}`

    const invoiceId = crypto.randomUUID()
    if (!this.dataUrl) return showToast('Maak eerst een foto van de factuur.')
    const invoiceImage = this.dataURLtoFile(this.dataUrl, invoiceId)
    const invoiceName = `${companies[selectedCompany]?.name || 'Invoice'} ${formattedDate} ${formattedTime}`

    const formData = new FormData()
    formData.append('files', invoiceImage)

    try {
      const uploadResult = await api.uploadInvoiceFile(formData)
      const invoiceImages = uploadResult

      const invoice: Invoice & { notes: string } = {
        name: invoiceName,
        description: 'Invoice description',
        invoiceImages,
        company: selectedCompany,
        job: selectedJob,
        user: userId,
        createdAt: date,
        updatedAt: date,
        notes: this.notes,
        materials
      }

      const data = await api.createInvoice(invoice)

      this.invoices[data.uuid] = data.content
      this.addingInvoice = false
      this.takingPicture = false
      this.currentStream?.getTracks().forEach((track) => track.stop())
      this.dataUrl = null

      this.requestRender()
    } catch (error) {
      console.error('Error saving invoice:', error)
      showToast('De factuur kon niet bewaard worden.')
      this.takingPicture = false
      this.addingInvoice = false
      this.currentStream?.getTracks().forEach((track) => track.stop())
      this.dataUrl = null
    }
  }

  _switchcamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: this.facingMode === 'user' ? 'environment' : 'user'
      }
    })

    const video = this.shadowRoot?.querySelector('video')
    if (!video) return
    video.srcObject = stream
    video.play()
  }

  renderAddInvoice() {
    if (this.takingPicture) {
      return html`
        <section class="capture-panel">
          <div class="workspace-head">
          <span class="panel-kicker">Opname</span>
            <div class="panel-title-wrap">
              <h2 class="panel-title">Factuur vastleggen</h2>
              <p class="panel-description">Maak een scherpe opname en werk daarna metadata en notities bij.</p>
            </div>
          </div>
          <span class="camera-wrapper"
            ><video></video>
            <span class="camera-bar">
              <button
                class="primary"
                @click=${() => this._takePicture()}>
                Neem foto
              </button>
              <button @click=${() => this._switchcamera()}>Wissel camera</button>
            </span>
          </span>
        </section>
      `
    }
    return html`
      <section class="capture-panel">
        <div class="workspace-head">
        <span class="panel-kicker">Controle</span>
          <div class="panel-title-row">
            <div class="panel-title-wrap">
              <h2 class="panel-title">Factuur bewaren</h2>
              <p class="panel-description">Koppel de opname aan een job of company en voeg context toe voor later.</p>
            </div>
            <button
              class="primary"
              @click=${() => this._saveInvoice()}>
              Bewaar factuur
            </button>
          </div>
        </div>

        <img
          src=${this.dataUrl || ''}
          adding-invoice-image />

        <div class="capture-form">
          <chip-field
            label="jobs"
            customEvent
            multi
            @selected=${() => {
              const selectedJob = this.jobChips?.selected?.[0]
              void this.loadBillableHours(selectedJob)
            }}
            @selection-changed=${() => {
              const selectedJob = this.jobChips?.selected?.[0]
              void this.loadBillableHours(selectedJob)
            }}
            @add-chip=${() => {
              this._createJob()
            }}
            .chips=${(Object.entries(this.jobs || {}) as Array<[string, any]>).map(([uuid, data]) => {
              return {
                label: data.name,
                value: uuid
              }
            })}></chip-field>

          <chip-field
            label="companies"
            customEvent
            @add-chip=${() => {
              ;(this as any)._addCompany()
            }}
            @selected=${() => {
              const selectedCompany = this.companyChips?.selected?.[0]
              void this.loadMaterialSuggestions(selectedCompany)
            }}
            .chips=${(
              Object.entries(((this as any).companies || {}) as Record<string, any>) as Array<[string, any]>
            )
              .filter(([, data]) => (data.relationshipType || 'customer') === 'customer')
              .map(([uuid, data]) => ({
                label: data.name,
                value: uuid
              }))}
            @selection-changed=${() => {
              const selectedCompany = this.companyChips?.selected?.[0]
              void this.loadMaterialSuggestions(selectedCompany)
            }}></chip-field>

          <div class="materials-panel">
            <div class="materials-header">
              <div class="materials-header-meta">
                <h3>Gebruikte materialen</h3>
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
                  ${this.jobChips?.selected?.[0] &&
                  (this.jobs?.[this.jobChips.selected[0]] as Job | undefined)?.materials?.length
                    ? html`
                        <button
                          type="button"
                          @click=${() => this.loadJobMaterials()}>
                          Jobmaterialen laden
                        </button>
                      `
                    : null}

                  <button
                    type="button"
                    @click=${this.addMaterialRow}>
                    Materiaal toevoegen
                  </button>

                  <datalist id="material-suggestions-list">
                    ${this.materialSuggestions.map(
                      (suggestion) =>
                        html`<option
                          value=${suggestion.name}
                          label=${this.getMaterialSuggestionLabel(suggestion)}></option>`
                    )}
                  </datalist>

                  ${this.materials.map(
                    (material, index) => html`
                      <div class="material-row">
                        <div class="material-input-wrap">
                          <input
                            type="text"
                            list="material-suggestions-list"
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
                `
              : null}
          </div>

          <div class="materials-panel">
            <div class="materials-header">
              <h3>Factureerbare uren</h3>
            </div>

            ${Object.keys(this.billableHours).length === 0
              ? html`<div class="material-summary">Geen factureerbare uren voor deze job.</div>`
              : html`
                  ${Object.entries(this.billableHours).map(([userId, prestations]) => {
                    const personTotal = prestations.reduce((sum, prestation) => sum + prestationDuration(prestation), 0)
                    const isOpen = Boolean(this.openHourUsers[userId])

                    return html`
                      <div class="materials-panel">
                        <div class="hours-user-header">
                          <div class="hours-user-title">
                            <strong>${this.hourUsers[userId]?.name || userId}</strong>
                            <span class="hours-user-total">${durationToHours(personTotal)}</span>
                          </div>
                          <button
                            type="button"
                            class="hours-user-toggle"
                            @click=${() => this.toggleBillableHours(userId)}>
                            ${isOpen ? 'Verberg uren' : 'Toon uren'}
                          </button>
                        </div>
                        ${isOpen
                          ? html`${prestations.map(
                              (prestation) => html`
                                <div class="material-row">
                                  <div>${formatDateTime(Number(prestation.checkin))}</div>
                                  <div>${formatDateTime(Number(prestation.checkout))}</div>
                                  <div>${durationToHours(prestationDuration(prestation))}</div>
                                </div>
                              `
                            )}`
                          : null}
                      </div>
                    `
                  })}

                  <div class="material-summary">Totaal uren: ${durationToHours(this.totalBillableDuration)}</div>
                `}
          </div>

          <md-outlined-text-field
            class="notes-field"
            label="Notes"
            @input=${(e: Event) =>
              debounce(() => {
                const input = e.target as HTMLInputElement
                this.notes = input.value
              }, 500)}>
          </md-outlined-text-field>
        </div>
      </section>
    `
  }

  _deleteInvoice = async (key: string) => {
    if (!(await confirmAction({ title: 'Factuur verwijderen?', message: 'Deze factuur verdwijnt uit Keepit. Deze actie kan niet ongedaan gemaakt worden.', confirmLabel: 'Factuur verwijderen' }))) return

    try {
      await api.deleteInvoice(key)
      delete this.invoices[key]
      this.requestRender()
      showToast('Factuur verwijderd.')
    } catch (error) {
      console.error('Failed to delete invoice:', error)
      showToast('De factuur kon niet verwijderd worden.')
    }
  }

  render() {
    const invoiceEntries = Object.entries(this.invoices || {}).sort(([, left], [, right]) =>
      String(right?.createdAt || '').localeCompare(String(left?.createdAt || ''))
    )
    return this.addingInvoice
      ? this.renderAddInvoice()
      : html`
          <section class="workspace-panel">
            <div class="workspace-head">
              <span class="panel-kicker">Administratie</span>
              <div class="panel-title-row">
                <div class="panel-title-wrap">
                  <h2 class="panel-title">Facturen</h2>
                  <p class="panel-description">
                    Bewaar facturen, koppel ze aan jobs en houd alle details samen.
                  </p>
                </div>
                <button
                  class="primary"
                  @click=${() => this._addInvoice()}>
                  Nieuwe factuur
                </button>
              </div>
            </div>
          </section>

          <section class="list-panel">
            ${invoiceEntries.length ? html`<div class="invoice-grid">${invoiceEntries.map(([key,invoice])=>html`<article class="invoice-card"><a class="invoice-link" href=${`#!/invoice?selected=${key}`}><span class="invoice-icon"><custom-icon icon="receipt"></custom-icon></span><span class="invoice-copy"><strong>${invoice?.name || 'Naamloze factuur'}</strong><span>${invoice?.description || new Date(invoice?.createdAt).toLocaleDateString('nl-BE')}</span></span></a><button class="invoice-delete" aria-label="Factuur verwijderen" @click=${()=>this._deleteInvoice(key)}><custom-icon icon="delete"></custom-icon></button></article>`)}</div>` : html`<div class="material-summary">Nog geen facturen toegevoegd.</div>`}
          </section>
        `
  }
}

customElements.define('invoices-view', InvoicesView)
