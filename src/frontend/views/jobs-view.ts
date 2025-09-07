import { LiteElement, html, css, property, query } from '@vandeurenglenn/lite'
import '@material/web/textfield/outlined-text-field.js'
import '@material/web/fab/fab.js'
import '@vandeurenglenn/lite-elements/icon.js'
import '@vandeurenglenn/lite-elements/icon-button.js'
import './../elements/list/item.js'
import { JobsMixin } from '../mixins/jobs.js'
import './../elements/view/header.js'
import { Job, Jobs } from '../../types/index.js'

const jobsMixin = JobsMixin(LiteElement)
export class JobsView extends jobsMixin {
  static styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
      }
      md-fab {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 1000;
      }
      /* Add your styles here */
    `
  ]

  render() {
    return html`
      <view-header
        title="Jobs"
        description="Manage your jobs"
        icon="inventory2"></view-header>

      ${Object.entries((this.jobs as Jobs) || {}).map(
        ([key, job]) => html`
          <list-item
            .href=${`#!/job?selected=${key}`}
            .headline=${job.name}
            .subheadline=${job.place?.formattedAddress}
            .key=${key}
            .delete=${this._deleteJob ? this._deleteJob.bind(this, key) : undefined}></list-item>
        `
      )}
      <md-fab
        icon="add"
        @click=${() => this._createJob()}
        @keyup=${(event) => this._handleFabKeyUp(event)}>
        <custom-icon
          icon="add"
          slot="icon"></custom-icon
      ></md-fab>
    `
  }
}

customElements.define('jobs-view', JobsView)
