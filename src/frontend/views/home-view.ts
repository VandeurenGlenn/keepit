import { LiteElement, html, css, property } from '@vandeurenglenn/lite'
import '../elements/view/header.js'
import '@material/web/fab/fab.js'
import '@vandeurenglenn/lite-elements/icon.js'
import '@vandeurenglenn/flex-elements/row.js'

export class HomeView extends LiteElement {
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
      view-header {
        margin-bottom: 16px;
        cursor: pointer;
      }
    `
  ]

  render() {
    return html`
      <view-header
        title="Checkin"
        description="Log your start hours! (only do this for the first job)"
        icon="arrow_downward"
        href="#!/checkin"></view-header>

      <view-header
        title="Checkout"
        description="Log your end hours! (do this for every job)"
        icon="arrow_upward"
        href="#!/checkout"></view-header>
    `
  }
}

customElements.define('home-view', HomeView)
