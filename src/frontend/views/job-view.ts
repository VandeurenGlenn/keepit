import { LiteElement, html, css, property, query } from '@vandeurenglenn/lite'
import '@material/web/textfield/outlined-text-field.js'
import { Job, User } from '../../types/index.js'
import './../elements/view/header.js'

function msToTime(ms) {
  console.log(ms)

  let seconds = (ms / 1000).toFixed(1)
  let minutes = (ms / (1000 * 60)).toFixed(1)
  let hours = (ms / (1000 * 60 * 60)).toFixed(1)
  let days = (ms / (1000 * 60 * 60 * 24)).toFixed(1)
  if (Number(seconds) < 60) return seconds + ' s'
  else if (Number(minutes) < 60) return minutes + 'm'
  else if (Number(hours) < 24) return hours + ' h'
  else return days + ' Days'
}

export class JobView extends LiteElement {
  @property({ type: Object, consumes: true }) accessor user: User
  @property({ type: Object }) accessor hours: any
  @property({ type: Object }) accessor users: { [userId: string]: User } = {}
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

        button.primary {
          width: 100%;
        }
      }
    `
  ]

  async onChange(propertyKey: string, value: any): Promise<void> {
    console.log('property changed', propertyKey, value)

    if (propertyKey === 'job') {
      const params = new URLSearchParams(globalThis.location.href.split('?')[1] || '')
      const selected = params.get('selected')

      const response = await fetch(`/api/hours/job/${selected}`, {
        headers: { Authorization: localStorage.getItem('token') || '' }
      })
      if (!response.ok) {
        this.hours = null
        return
      }
      this.hours = await response.json()
      const userIds = new Set<string>()
      for (const prestation of Object.values(this.hours || {})) {
        for (const userId of Object.keys(prestation as Record<string, unknown>)) {
          userIds.add(userId)
        }
      }

      for (const userId of userIds) {
        const res = await fetch(`/api/user/${userId}`, {
          headers: { Authorization: localStorage.getItem('token') || '' }
        })
        if (res.ok) {
          const user = await res.json()
          console.log(user)
          if (!this.users)
            this.users = {
              [userId]: user as User
            }
          else this.users[userId] = user as User
        }
      }
    }
  }

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
      author: (this.user as User & { id?: string })?.id || undefined
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

      <section class="details-panel">
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
      </section>

      <section class="section-panel">
        <h4 class="section-title">Hours</h4>
        <div class="hours-list">
          ${this.users
            ? Object.entries(this.hours || {}).map(
                ([key, value]) =>
                  html`<div class="hours-group">
                    <strong>${key}</strong>
                    <div class="hours-list">
                      ${Object.entries(value).map(
                        ([userId, user]) =>
                          html`<div class="hour-entry">
                            <span>${this.users[userId].name}</span>
                            <span>${msToTime((user as any).checkout - (user as any).checkin)}</span>
                          </div>`
                      )}
                    </div>
                  </div>`
              )
            : html`<div class="hours-group">Nog geen geregistreerde uren.</div>`}
        </div>
      </section>

      <section class="section-panel">
        <h4 class="section-title">Notes</h4>
        <div class="notes-list">
          ${(this.job.notes || []).length === 0
            ? html`<div class="note-item">No notes</div>`
            : html`${(this.job.notes || []).map(
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
