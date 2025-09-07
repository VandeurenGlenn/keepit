import { LiteElement, html, css, property, query } from '@vandeurenglenn/lite'
import '@material/web/textfield/outlined-text-field.js'
import { Job, User } from '../../types/index.js'
import './../elements/view/header.js'

function msToTime(ms) {
  let seconds = (ms / 1000).toFixed(1)
  let minutes = (ms / (1000 * 60)).toFixed(1)
  let hours = (ms / (1000 * 60 * 60)).toFixed(1)
  let days = (ms / (1000 * 60 * 60 * 24)).toFixed(1)
  if (seconds < 60) return seconds + ' s'
  else if (minutes < 60) return minutes + 'm'
  else if (hours < 24) return hours + ' h'
  else return days + ' Days'
}

export class JobView extends LiteElement {
  @property({ type: Object, consumes: true }) accessor user: User

  static styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
      }
    `
  ]

  @property({ type: Object, consumes: true }) accessor job: Job

  @property({ type: String }) accessor newNoteText = ''

  async _addNote() {
    const text = (this.newNoteText || '').trim()
    if (!text) return alert('Please enter a note')

    const note = {
      id:
        typeof crypto !== 'undefined' && (crypto as any).randomUUID ? (crypto as any).randomUUID() : String(Date.now()),
      text,
      createdAt: new Date().toISOString(),
      author: this.user.id || undefined
    }

    const updatedNotes = [...(this.job.notes || []), note]

    // try to determine job uuid key; shell provides this.job from consuming context and may include uuid elsewhere
    const jobId = (this.job as any).uuid || (this.job as any).id || (this.job as any).jobId
    const response = await fetch(`/api/job/${jobId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('token') },
      body: JSON.stringify({ notes: updatedNotes })
    })
    if (!response.ok) {
      return alert('Failed to save note')
    }
    const data = await response.json()
    this.job = data.content
    this.newNoteText = ''
    this.requestRender()
  }

  render() {
    if (!this.job) return html`<loading-view></loading-view>`

    return html`
      <view-header
        .title=${this.job.name}
        .description=${this.job.description || this.job.createdAt}
        icon="inventory2"></view-header>

      <md-outlined-text-field
        label="Job Name"
        .value=${this.job.name}
        @input=${(event: Event) => {
          const input = event.target as HTMLInputElement
          this.job.name = input.value
        }}></md-outlined-text-field>

      <md-outlined-text-field
        label="Job Description"
        .value=${this.job.description}
        @input=${(event: Event) => {
          const input = event.target as HTMLInputElement
          this.job.description = input.value
        }}></md-outlined-text-field>

      <h4>hours</h4>
      ${Object.entries(this.job.hours || {}).map(
        ([key, value]) =>
          html`<div>
            <strong>${key}</strong>
            <div>
              ${Object.entries(value).map(
                ([userId, user]) =>
                  html`<div>${userId} ${msToTime((user as any).checkout - (user as any).checkin)}</div>`
              )}
            </div>
          </div>`
      )}

      <h4>Notes</h4>
      <div>
        ${(this.job.notes || []).length === 0
          ? html`<div>No notes</div>`
          : html`${(this.job.notes || []).map(
              (n) => html`<div style="padding:6px;border-bottom:1px solid rgba(0,0,0,0.06);">
                <div style="font-size:12px;color:var(--muted-color,#666)">
                  ${n.createdAt}${n.author ? ' — ' + n.author : ''}
                </div>
                <div>${n.text}</div>
              </div>`
            )}`}

        <md-outlined-text-field
          label="New note"
          .value=${this.newNoteText}
          @input=${(e: Event) => {
            const input = e.target as HTMLInputElement
            this.newNoteText = input.value
          }}></md-outlined-text-field>

        <button @click=${this._addNote.bind(this)}>Add note</button>
      </div>
    `
  }
}

customElements.define('job-view', JobView)
