import { LiteElement, html, css, property, query } from '@vandeurenglenn/lite'
import '@material/web/fab/fab.js'
import '@vandeurenglenn/lite-elements/icon-button.js'
import '@material/web/textfield/outlined-text-field.js'
import '@vandeurenglenn/flex-elements/container.js'
import './../elements/chip/field.js'
import { JobsMixin } from '../mixins/jobs.js'
import { CompaniesMixin } from '../mixins/companies.js'
import { Invoice, User } from './../../types/index.js'
import { ChipField } from './../elements/chip/field.js'
import mimes from 'mime'
import './../elements/list/item.js'
import './../elements/view/header.js'
import '@vandeurenglenn/lite-elements/icon.js'

let debounceTimeout: ReturnType<typeof setTimeout>
function debounce(fn: (...args: any[]) => void, delay = 300) {
  clearTimeout(debounceTimeout)
  debounceTimeout = setTimeout(fn, delay)
}

export class InvoicesView extends JobsMixin(CompaniesMixin(LiteElement)) {
  @property({ type: Array, consumes: true }) accessor invoices = []
  @property({ type: Boolean }) accessor takingPicture = false
  @property({ type: Boolean }) accessor addingInvoice = false
  @property({ type: String }) accessor facingMode = 'environment'
  @property({ type: Object, consumes: true }) accessor user: User
  @property({ type: Object, consumes: true }) accessor companies
  @property({ type: String }) accessor notes: string

  @query('chip-field[label="jobs"]') accessor jobChips: ChipField
  @query('chip-field[label="companies"]') accessor companyChips: ChipField

  currentStream: MediaStream

  dataUrl: string
  static styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        gap: 18px;
        padding: 16px;
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
        border-radius: 24px;
        background: linear-gradient(180deg, color-mix(in srgb, var(--app-panel) 96%, white 4%), var(--app-panel));
        border: 1px solid var(--app-border);
        box-shadow: var(--app-shadow-strong);
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
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
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
        border-radius: 999px;
        padding: 10px 16px;
        font: inherit;
        cursor: pointer;
      }

      button.primary {
        background: linear-gradient(
          135deg,
          color-mix(in srgb, var(--app-accent) 88%, white 12%),
          var(--app-accent-strong)
        );
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
        border-radius: 20px;
        overflow: hidden;
        background: color-mix(in srgb, var(--md-sys-color-surface-container) 86%, black 14%);
      }

      .list-stack {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
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

      @media (max-width: 720px) {
        :host {
          padding: 12px;
        }

        .workspace-panel,
        .capture-panel,
        .list-panel {
          padding: 16px;
          border-radius: 20px;
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
      }
    `
  ]

  _addInvoice = async () => {
    console.log('Adding a new invoice...')
    // make sure to set the takingPicture to true before setting the addingInvoice to true
    // to avoid flickering/seeing the final invoice step
    this.takingPicture = true
    this.addingInvoice = true

    // Logic to add a new invoice
    this.currentStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: this.facingMode,
        width: { ideal: 2480 },
        height: { ideal: 3508 }
      }
    })

    const video = this.shadowRoot.querySelector('video')
    video.srcObject = this.currentStream
    video.setAttribute('playsinline', '')
    video.setAttribute('autoplay', '')
    video.setAttribute('muted', '')

    video.play()
    // You can add your logic here to add a new invoice
  }
  _handleFabKeyUp = (event) => {
    if (event.key === 'Enter' || event.key === 'Space') {
      event.preventDefault()
      this._addInvoice()
    }
  }

  _takePicture = async () => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas')
      const video = this.shadowRoot.querySelector('video')

      const { height, width } = this.currentStream.getVideoTracks()[0].getSettings()
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')

      context.drawImage(video, 0, 0)

      const data = canvas.toDataURL('image/png', 1.0)
      this.dataUrl = data
      this.takingPicture = false

      //  photo.setAttribute('src', data)
    })
  }

  dataURLtoFile(dataurl: string, filename: string) {
    var arr = dataurl.split(','),
      mime = arr[0].match(/:(.*?);/)[1],
      bstr = atob(arr[arr.length - 1]),
      n = bstr.length,
      u8arr = new Uint8Array(n)
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

    if (!this.notes && !selectedJob) return alert('Please select a job or add notes')
    if (!this.notes) this.notes = 'No notes'
    if (!selectedCompany) return alert('Please select a company')

    const _date = new Date()
    const date = _date.toISOString()
    const formattedDate = _date.toLocaleDateString().replace(/\//g, '-')

    const minutes = _date.getMinutes()
    const formattedTime = `${_date.getHours()}:${minutes < 10 ? '0' : ''}${minutes}`

    const invoiceId = crypto.randomUUID()
    const invoiceImage = this.dataURLtoFile(this.dataUrl, invoiceId)
    const invoiceName = `${companies[selectedCompany]?.name || 'Invoice'} ${formattedDate} ${formattedTime}`

    const formData = new FormData()
    formData.append('files', invoiceImage)

    let response = await fetch(`/api/invoices/upload`, {
      method: 'POST',
      headers: {
        Authorization: localStorage.getItem('token')
      },
      body: formData
    })

    if (response.status !== 200) {
      console.error('Error uploading invoice image:', response.statusText)
      this.takingPicture = false
      this.addingInvoice = false
      this.currentStream.getTracks().forEach((track) => track.stop())
      this.dataUrl = null
    }
    const invoiceImages = await response.json()
    console.log(invoiceImages)

    const invoice: Invoice & { notes: string } = {
      name: invoiceName,
      description: 'Invoice description',
      invoiceImages,
      company: selectedCompany,
      job: selectedJob,
      user: userId,
      createdAt: date,
      updatedAt: date,
      notes: this.notes
    }

    response = await fetch('/api/invoices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: localStorage.getItem('token')
      },

      body: JSON.stringify(invoice)
    })

    const data = await response.json()
    console.log(data)

    this.invoices[data.uuid] = data
    this.addingInvoice = false
    this.takingPicture = false
    this.currentStream.getTracks().forEach((track) => track.stop())
    this.dataUrl = null

    this.requestRender()
  }

  _switchcamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: this.facingMode === 'user' ? 'environment' : 'user'
      }
    })

    const video = this.shadowRoot.querySelector('video')
    video.srcObject = stream
    video.play()
  }

  renderAddInvoice() {
    if (this.takingPicture) {
      return html`
        <section class="capture-panel">
          <div class="workspace-head">
            <span class="panel-kicker">Capture</span>
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
          <span class="panel-kicker">Review</span>
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
          src=${this.dataUrl}
          adding-invoice-image />

        <div class="capture-form">
          <chip-field
            label="jobs"
            customEvent
            multi
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
            .chips=${(
              Object.entries(((this as any).companies || {}) as Record<string, any>) as Array<[string, any]>
            ).map(([uuid, data]) => ({
              label: data.name,
              value: uuid
            }))}></chip-field>

          <md-outlined-text-field
            class="notes-field"
            label="Notes"
            @input=${(e) =>
              debounce(() => {
                this.notes = e.target.value
              }, 500)}>
          </md-outlined-text-field>
        </div>
      </section>
    `
  }

  _deleteInvoice = async (key: string) => {
    if (!confirm('Are you sure you want to delete this invoice?')) return
    const response = await fetch(`/api/invoices/${key}`, {
      method: 'DELETE',
      headers: {
        Authorization: localStorage.getItem('token')
      }
    })

    if (response.status === 204) {
      delete this.invoices[key]
      this.requestRender()
    } else {
      const data = await response.json()
      alert(data.error || 'Failed to delete invoice')
    }
  }
  render() {
    return this.addingInvoice
      ? this.renderAddInvoice()
      : html`
          <section class="workspace-panel">
            <div class="workspace-head">
              <span class="panel-kicker">Finance workspace</span>
              <div class="panel-title-row">
                <div class="panel-title-wrap">
                  <h2 class="panel-title">Invoices</h2>
                  <p class="panel-description">
                    Beheer inkomende facturen en voeg nieuwe beelden of notities toe vanuit dezelfde workspace.
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
            <div class="list-stack">
              ${Object.entries(this.invoices || {}).map(
                ([key, invoice]) => html`
                  <list-item
                    .href=${`#!/invoice?selected=${key}`}
                    .headline=${invoice?.name}
                    .subheadline=${invoice?.place?.formattedAddress}
                    .key=${key}
                    .delete=${this._deleteInvoice ? this._deleteInvoice.bind(this, key) : undefined}></list-item>
                `
              )}
            </div>
          </section>
        `
  }
}

customElements.define('invoices-view', InvoicesView)
