import { LiteElement, html, css, property } from '@vandeurenglenn/lite'
import '@material/web/fab/fab.js'
import '@vandeurenglenn/lite-elements/icon-button.js'
import '@material/web/textfield/outlined-text-field.js'
import '@vandeurenglenn/flex-elements/container.js'
import './../elements/chip/field.js'

export class InvoicesView extends LiteElement {
  @property({ type: Array, consumes: true }) accessor invoices = []
  @property({ type: Boolean }) accessor takingPicture = false
  @property({ type: Boolean }) accessor addingInvoice = false
  @property({ type: String }) accessor facingMode = 'environment'

  dataUrl: string
  static styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
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
        width: 100%;
        left: 0;
        background-color: rgba(0, 0, 0, 0.5);
        padding: 16px;
        box-sizing: border-box;
      }

      .camera-wrapper {
        position: relative;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.8);
        display: column;
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

      flex-container {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
        width: fit-content;
        --flex-display-max-width: 960px;
      }
      img[adding-invoice-image] {
        height: 50%;
      }

      span {
        width: 100%;
        display: block;
      }
    `
  ]

  _addInvoice = async () => {
    console.log('Adding a new invoice...')
    console.log(this.facingMode)
    // make sure to set the takingPicture to true before setting the addingInvoice to true
    // to avoid flickering/seeing the final invoice step
    this.takingPicture = true
    this.addingInvoice = true

    // Logic to add a new invoice
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: this.facingMode,
        width: { ideal: 595 },
        height: { ideal: 842 }
      }
    })

    const video = this.shadowRoot.querySelector('video')
    video.srcObject = stream
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
      canvas.width = 595
      canvas.height = 842
      const context = canvas.getContext('2d')

      context.drawImage(this.shadowRoot.querySelector('video'), 0, 0)

      const data = canvas.toDataURL('image/png', 1.0)
      this.dataUrl = data
      this.takingPicture = false

      //  photo.setAttribute('src', data)
    })
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
      return html`<flex-container
        ><span class="camera-wrapper"
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
      </flex-container>`
    }
    return html`<md-fab
        icon="add"
        @click=${() => this._addInvoice()}
        @keyup=${(event) => this._handleFabKeyUp(event)}>
        <custom-icon
          icon="save"
          slot="icon"></custom-icon></md-fab
      ><flex-container>
        <img
          src=${this.dataUrl}
          adding-invoice-image />
        <span>
          <h4>jobs</h4>

          <chip-field
            .chips=${[
              'Benno',
              'herent',
              'whatever',
              'com. neykenslaan',
              'Benno',
              'herent',
              'whatever',
              'com. neykenslaan',
              'Benno',
              'herent',
              'whatever',
              'com. neykenslaan'
            ]}></chip-field>

          <h4>companies</h4>
          <chip-field .chips=${['Fabi Sucks']}></chip-field></span
      ></flex-container>`
  }
  render() {
    return this.addingInvoice
      ? this.renderAddInvoice()
      : html`
          <md-fab
            icon="add"
            @click=${() => this._addInvoice()}
            @keyup=${(event) => this._handleFabKeyUp(event)}>
            <custom-icon
              icon="add"
              slot="icon"></custom-icon
          ></md-fab>
          <flex-container>
            <div class="invoices-list">
              ${this.invoices?.map(
                (invoice) => html`
                  <div class="invoice-item">
                    <h3>${invoice.title}</h3>
                    <p>${invoice.description}</p>
                  </div>
                `
              )}
            </div>
          </flex-container>
        `
  }
}

customElements.define('invoices-view', InvoicesView)
