import { LiteElement, html, css, property } from '@vandeurenglenn/lite'
import '../elements/view/header.js'
import '@material/web/fab/fab.js'
import '@vandeurenglenn/lite-elements/icon.js'
import '@vandeurenglenn/flex-elements/row.js'

export class HomeView extends LiteElement {
  @property({ type: Object, consumes: true }) accessor user

  static styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        width: 100%;
        max-width: 720px;
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
        description="Log your start hours!"
        icon="arrow_downward"
        href="#!/checkin"
        ?disabled=${this.user?.currentJob}></view-header>

      <view-header
        title="Checkout"
        description="Log your end hours!"
        icon="arrow_upward"
        href="#!/checkout"
        ?disabled=${!this.user?.currentJob}></view-header>
    `
  }
}

customElements.define('home-view', HomeView)
