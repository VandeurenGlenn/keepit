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
        align-items: center;
        height: 100%;
        width: 100%;
      }
      md-fab {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 1000;
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
        height: 100%;
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
      }

      .invoices-list {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 16px;
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
        height: 50%;
      }

      span {
        width: 100%;
        display: block;
      }

      video {
        width: 100%;
        height: 100%;
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

    const _date = new Date()
    const date = _date.toISOString()
    const formattedDate = _date.toLocaleDateString().replace(/\//g, '-')

    const minutes = _date.getMinutes()
    const formattedTime = `${_date.getHours()}:${minutes < 10 ? '0' : ''}${minutes}`

    const invoiceId = crypto.randomUUID()
    const invoiceImage = this.dataURLtoFile(this.dataUrl, invoiceId)
    const invoiceName = `${this.companies[selectedCompany].name} ${formattedDate} ${formattedTime}`

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

    if (!this.notes && !selectedJob) return alert('Please select a job or add notes')
    if (!this.notes) this.notes = 'No notes'
    if (!selectedCompany) return alert('Please select a company')

    const invoice: Invoice = {
      name: invoiceName,
      description: 'Invoice description',
      invoiceImages,
      company: selectedCompany,
      job: selectedJob,
      user: this.user.id,
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
    this.invoices[data.uuid] = data.content
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
        <span class="camera-wrapper"
          ><video></video>
          <span class="camera-bar">
            <custom-icon-button
              icon="photo_camera"
              @click=${() => this._takePicture()}></custom-icon-button>
            <custom-icon-button
              icon="cameraswitch"
              @click=${() => this._switchcamera()}></custom-icon-button>
          </span>
        </span>
      `
    }
    return html`<md-fab
        icon="add"
        @click=${() => this._saveInvoice()}
        @keyup=${(event) => this._handleFabKeyUp(event)}>
        <custom-icon
          icon="save"
          slot="icon"></custom-icon
      ></md-fab>
      <img
        src=${this.dataUrl}
        adding-invoice-image />
      <span>
        <chip-field
          label="jobs"
          customEvent
          multi
          @add-chip=${(event) => {
            this._createJob()
          }}
          .chips=${Object.entries(this.jobs || {}).map(([uuid, data]) => {
            return {
              label: data.name,
              value: uuid
            }
          })}></chip-field>

        <chip-field
          label="companies"
          customEvent
          @add-chip=${(event) => {
            this._addCompany()
          }}
          .chips=${Object.entries(this.companies || {}).map(([uuid, data]) => ({
            label: data.name,
            value: uuid
          }))}></chip-field
      ></span>

      <md-outlined-text-field
        label="Notes"
        @input=${(e) =>
          debounce(() => {
            this.notes = e.target.value
          }, 500)}
        style="width: 100%; margin-top: 16px;">
      </md-outlined-text-field>`
  }
  render() {
    return this.addingInvoice
      ? this.renderAddInvoice()
      : html`
          <view-header
            title="Invoices"
            description="Manage your invoices"
            icon="receipt"></view-header>

          <md-fab
            icon="add"
            @click=${() => this._addInvoice()}
            @keyup=${(event) => this._handleFabKeyUp(event)}>
            <custom-icon
              icon="add"
              slot="icon"></custom-icon
          ></md-fab>
          ${Object.entries(this.invoices || {}).map(
            ([key, invoice]) => html`
              <list-item
                .href=${`#!/job?selected=${key}`}
                .headline=${invoice.name}
                .subheadline=${invoice.place?.formattedAddress}
                .key=${key}>
              </list-item>
            `
          )}
        `
  }
}

customElements.define('invoices-view', InvoicesView)
