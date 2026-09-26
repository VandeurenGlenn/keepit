import { LiteElement, html, css, property } from '@vandeurenglenn/lite'
import { User, Users } from '../../types/index.js'
import './../elements/list/item.js'
import { confirmAction } from '../helpers/confirmation.js'
import { showToast } from '../helpers/toast.js'

export class UsersView extends LiteElement {
  @property({ type: Object, consumes: true }) accessor users: Users
  @property({ type: Object, consumes: true }) accessor user: User
  @property({ type: Object, provides: true }) accessor error: { label: string; href: string; message: string }
  @property({ type: Boolean }) accessor inviteOpen = false
  @property({ type: Boolean }) accessor inviting = false
  @property({ type: String }) accessor inviteEmail = ''
  @property({ type: String }) accessor inviteError = ''

  invitedUsersLoaded = false
  teamChangeTimer?: ReturnType<typeof setTimeout>
  handleTeamChanged = () => {
    if (!this.canManageRoles()) return
    if (this.teamChangeTimer) clearTimeout(this.teamChangeTimer)
    this.teamChangeTimer = setTimeout(() => void this.loadUsersIncludingInvited(), 80)
  }

  static styles = [
    css`
      :host {
        --workspace-accent: var(--app-accent);
        --workspace-accent-strong: var(--app-accent-strong);
        --workspace-accent-soft: var(--app-accent-soft);
        --workspace-border: var(--app-border);
        --workspace-panel: var(--app-panel);
        --workspace-panel-strong: var(--app-panel-strong);
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        max-width: 1180px;
        gap: 16px;
        padding: 22px;
        box-sizing: border-box;
      }

      .workspace-panel {
        display: flex;
        flex-direction: column;
        gap: 16px;
        width: 100%;
        padding: 22px 24px;
        border-radius: var(--app-radius-panel);
        background: var(--workspace-panel);
        border: 1px solid var(--workspace-border);
        box-shadow: var(--app-shadow-soft);
        box-sizing: border-box;
      }

      .workspace-head {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .panel-kicker {
        display: inline-flex;
        width: fit-content;
        align-items: center;
        gap: 8px;
        padding: 0;
        border-radius: 0;
        background: transparent;
        color: var(--workspace-accent);
        font-size: 0.76rem;
        font-weight: 500;
        letter-spacing: 0;
      }

      .panel-title-row,
      .top-actions,
      .summary-row,
      .user-actions {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }

      .panel-title-row {
        justify-content: space-between;
        align-items: flex-start;
      }

      .panel-title {
        margin: 0;
        font-size: 1.5rem;
        font-weight: 600;
        line-height: 1.2;
      }

      .panel-description {
        margin: 0;
        max-width: 72ch;
        color: var(--md-sys-color-on-surface-variant);
        line-height: 1.55;
      }

      .users-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 10px;
        width: 100%;
      }

      .user-card {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 15px;
        border-radius: var(--app-radius-control);
        border: 1px solid color-mix(in srgb, var(--workspace-border) 88%, transparent 12%);
        background: var(--workspace-panel);
        box-shadow: none;
      }

      .user-header {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .avatar {
        width: 52px;
        height: 52px;
        display: grid;
        place-items: center;
        border-radius: 50%;
        object-fit: cover;
        background: color-mix(in srgb, var(--md-sys-color-primary) 18%, transparent 82%);
        color: var(--md-sys-color-primary);
        font-weight: 600;
      }

      .user-meta {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .role-list {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      .role-badge {
        display: inline-flex;
        align-items: center;
        padding: 4px 10px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--md-sys-color-primary) 16%, transparent 84%);
        color: var(--md-sys-color-primary);
        font-size: 0.82rem;
        font-weight: 600;
      }

      .muted {
        color: var(--md-sys-color-on-surface-variant);
        font-size: 0.9rem;
      }

      button {
        border: 1px solid color-mix(in srgb, var(--md-sys-color-outline) 45%, transparent 55%);
        background: var(--md-sys-color-surface);
        color: var(--md-sys-color-on-surface);
        min-height: 38px;
        border-radius: 10px;
        padding: 0 13px;
        font: inherit;
        font-size: 0.76rem;
        font-weight: 500;
        cursor: pointer;
      }

      button.primary {
        background: var(--workspace-accent);
        border-color: color-mix(in srgb, var(--workspace-accent) 82%, white 18%);
        color: var(--md-sys-color-on-primary);
      }

      button.danger {
        color: var(--md-sys-color-error);
        border-color: color-mix(in srgb, var(--md-sys-color-error) 40%, transparent 60%);
      }

      button:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }

      .badge {
        display: inline-flex;
        align-items: center;
        padding: 8px 12px;
        border-radius: 14px;
        background: color-mix(in srgb, var(--md-sys-color-surface-container-high) 72%, transparent 28%);
        border: 1px solid color-mix(in srgb, var(--workspace-border) 85%, transparent 15%);
        color: var(--md-sys-color-on-surface-variant);
        font-size: 0.84rem;
      }

      .badge strong {
        color: var(--md-sys-color-on-surface);
      }

      .dialog-layer {
        position: fixed;
        inset: 0;
        z-index: 30;
        display: grid;
        place-items: center;
        padding: 18px;
        background: rgb(0 0 0 / 56%);
        backdrop-filter: blur(4px);
      }

      .invite-dialog {
        width: min(100%, 460px);
        padding: 20px;
        border: 1px solid var(--workspace-border);
        border-radius: var(--app-radius-panel);
        background: var(--workspace-panel);
        box-shadow: var(--app-shadow-strong);
        box-sizing: border-box;
      }

      .invite-dialog h2,
      .invite-dialog p { margin: 0; }
      .invite-dialog p { margin-top: 6px; color: var(--md-sys-color-on-surface-variant); line-height: 1.5; }
      .invite-dialog label { display: flex; flex-direction: column; gap: 7px; margin-top: 18px; font-size: .78rem; font-weight: 600; }
      .invite-dialog input { width: 100%; height: 44px; padding: 0 12px; border: 1px solid var(--workspace-border); border-radius: var(--app-radius-control); background: var(--workspace-panel-strong); color: var(--md-sys-color-on-surface); font: inherit; box-sizing: border-box; }
      .dialog-error { color: var(--md-sys-color-error) !important; font-weight: 600; }
      .dialog-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }

      @media (max-width: 720px) {
        :host {
          padding: 12px;
          gap: 14px;
        }

        .workspace-panel,
        .user-card {
          padding: 16px;
          border-radius: var(--app-radius-panel);
        }

        .panel-title-row {
          flex-direction: column;
        }

        .top-actions,
        .summary-row,
        .user-header,
        .user-actions {
          flex-direction: column;
          align-items: stretch;
        }

        .users-grid {
          grid-template-columns: 1fr;
        }

        .user-header {
          align-items: flex-start;
        }

        .user-actions button,
        .top-actions button {
          width: 100%;
        }
      }
    `
  ]

  get userEntries() {
    return Object.entries(this.users || {})
  }

  connectedCallback() {
    super.connectedCallback()
    window.addEventListener('keepit-team-changed', this.handleTeamChanged)
  }

  disconnectedCallback() {
    window.removeEventListener('keepit-team-changed', this.handleTeamChanged)
    if (this.teamChangeTimer) clearTimeout(this.teamChangeTimer)
    super.disconnectedCallback()
  }

  renderPanelHeader(title: string, description: string, kicker: string, meta: unknown = '') {
    return html`
      <div class="workspace-head">
        <span class="panel-kicker">${kicker}</span>
        <div class="panel-title-row">
          <div>
            <h2 class="panel-title">${title}</h2>
            <p class="panel-description">${description}</p>
          </div>
          ${meta}
        </div>
      </div>
    `
  }

  canManageRoles() {
    return Boolean(this.user?.roles?.includes('admin') || this.user?.roles?.includes('roles'))
  }

  beforeRender() {
    if (this.invitedUsersLoaded || !this.canManageRoles()) return
    this.invitedUsersLoaded = true
    void this.loadUsersIncludingInvited()
  }

  async loadUsersIncludingInvited() {
    const response = await fetch('/api/users?includeInvited=1', {
      method: 'GET',
      headers: {
        Authorization: localStorage.getItem('token') || ''
      }
    })

    if (!response.ok) {
      this.invitedUsersLoaded = false
      return
    }

    const teamEntries = (await response.json()) as Users
    this.users = teamEntries
    this.requestRender()
  }

  currentUserId() {
    return (this.user as User & { id?: string })?.id || ''
  }

  setUserRoles(uuid: string, roles: string[]) {
    this.users = {
      ...this.users,
      [uuid]: {
        ...this.users[uuid],
        roles
      }
    }

    if (this.currentUserId() === uuid) {
      this.user = {
        ...this.user,
        roles
      }
    }
  }

  grantRole = async (uuid: string, role: string) => {
    const response = await fetch(`/api/roles/grant/${uuid}/${role}`, {
      method: 'POST',
      headers: {
        Authorization: localStorage.getItem('token')
      }
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: 'Rol toekennen mislukt' }))
      throw new Error(data.message || data.error || 'Rol toekennen mislukt')
    }

    const roles = Array.from(new Set([...(this.users[uuid]?.roles || []), role]))
    this.setUserRoles(uuid, roles)
  }

  revokeRole = async (uuid: string, role: string) => {
    const response = await fetch(`/api/roles/revoke/${uuid}/${role}`, {
      method: 'POST',
      headers: {
        Authorization: localStorage.getItem('token')
      }
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: 'Rol verwijderen mislukt' }))
      throw new Error(data.message || data.error || 'Rol verwijderen mislukt')
    }

    const roles = (this.users[uuid]?.roles || []).filter((item) => item !== role)
    this.setUserRoles(uuid, roles)
  }

  toggleRole = async (uuid: string, role: string, enabled: boolean) => {
    try {
      if (enabled) {
        await this.grantRole(uuid, role)
      } else {
        await this.revokeRole(uuid, role)
      }
      this.requestRender()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Rollen aanpassen mislukt'
      this.error = { label: 'Terug naar users', href: '#!/users', message }
      this.requestRender()
    }
  }

  openInviteDialog() {
    this.inviteEmail = ''
    this.inviteError = ''
    this.inviteOpen = true
    requestAnimationFrame(() => this.shadowRoot?.querySelector<HTMLInputElement>('#invite-email')?.focus())
  }

  closeInviteDialog() {
    if (this.inviting) return
    this.inviteOpen = false
  }

  _inviteUser = async (event?: Event) => {
    event?.preventDefault()
    const email = this.inviteEmail.trim().toLowerCase()
    if (!email) return
    this.inviting = true
    this.inviteError = ''
    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: localStorage.getItem('token')
        },
        body: JSON.stringify({ email })
      })
      if (!response.ok) {
        const { error, message } = await response.json()
        this.inviteError = message || error || 'Gebruiker toevoegen mislukt'
        return
      }
      await response.json()
      this.inviteOpen = false
      showToast(`Uitnodiging verstuurd naar ${email}.`)
      if (this.canManageRoles()) {
        this.invitedUsersLoaded = true
        await this.loadUsersIncludingInvited()
        return
      }
      this.requestRender()
    } catch (error) {
      this.inviteError = error instanceof Error ? error.message : 'Uitnodiging versturen mislukt.'
    } finally {
      this.inviting = false
    }
  }

  _deleteUser = async (uuid: string, invitation = false) => {
    const answer = await confirmAction(invitation
      ? { title: 'Uitnodiging verwijderen?', message: 'De persoonlijke uitnodigingslink werkt daarna niet meer.', confirmLabel: 'Uitnodiging verwijderen' }
      : { title: 'Medewerker verwijderen?', message: 'De medewerker verliest toegang tot Keepit. Bestaande uren blijven bewaard.', confirmLabel: 'Medewerker verwijderen' })
    if (!answer) return
    const response = await fetch(`/api/users/${uuid}`, {
      method: 'DELETE',
      headers: { Authorization: localStorage.getItem('token') }
    })
    if (!response.ok) {
      const { error, message } = await response.json()
      this.error = {
        label: 'Terug naar team',
        href: '#!/users',
        message: message || error || 'Gebruiker verwijderen mislukt'
      }
      this.requestRender()
      return
    }

    delete this.users[uuid]
    this.requestRender()
    showToast('Medewerker verwijderd.')
  }

  renderRoleBadges(roles: string[] = []) {
    if (!roles.length) {
      return html`<span class="muted">Geen extra rollen</span>`
    }

    return roles.map((role) => html`<span class="role-badge">${role}</span>`)
  }

  renderUserCard(uuid: string, user: User) {
    const roles = user.roles || []
    const isOwner = roles.includes('owner')
    const isAdmin = roles.includes('admin')
    const canManageRoles = roles.includes('roles')
    const allowRoleChanges = this.canManageRoles()
    const displayName = user.name?.trim() || user.email?.trim() || user.googleEmail?.trim() || 'Onbekende gebruiker'
    const workAddress = user.email?.trim() || ''
    const formattedAddress = user.place?.formattedAddress?.trim() || ''
    const avatarInitial = displayName.charAt(0).toUpperCase()
    const isPendingInvitation = user.invited === true && !user.googleEmail

    return html`
      <article class="user-card">
        <div class="user-header">
          ${user.picture
            ? html`<img
                class="avatar"
                src=${user.picture}
                alt=${displayName} />`
            : html`<div
                class="avatar"
                aria-hidden="true">
                ${avatarInitial}
              </div>`}

          <div class="user-meta">
            <strong>${displayName}</strong>
            ${workAddress ? html`<span class="muted">Werkadres: ${workAddress}</span>` : ''}
            ${user.googleEmail && user.googleEmail !== workAddress
              ? html`<span class="muted">Google-login: ${user.googleEmail}</span>`
              : ''}
            ${formattedAddress
              ? html`<span class="muted">${formattedAddress}</span>`
              : !workAddress
                ? html`<span class="muted">Geen adres ingesteld</span>`
                : ''}
          </div>
        </div>

        <div class="role-list">${this.renderRoleBadges(roles)}</div>
        ${isPendingInvitation ? html`<span class="muted">Uitgenodigd - wacht op registratie</span>` : ''}

        <div class="user-actions">
          <button
            class=${isAdmin ? '' : 'primary'}
            ?disabled=${!allowRoleChanges || isOwner}
            @click=${() => this.toggleRole(uuid, 'admin', !isAdmin)}>
            ${isAdmin ? 'Verwijder admin' : 'Maak admin'}
          </button>

          <button
            class=${canManageRoles ? '' : 'primary'}
            ?disabled=${!allowRoleChanges || isOwner}
            @click=${() => this.toggleRole(uuid, 'roles', !canManageRoles)}>
            ${canManageRoles ? 'Verwijder rolbeheer' : 'Mag rollen beheren'}
          </button>

          <button
            class="danger"
            ?disabled=${isOwner}
            @click=${() => this._deleteUser(uuid, isPendingInvitation)}>
            ${isPendingInvitation ? 'Uitnodiging verwijderen' : 'Verwijder gebruiker'}
          </button>
        </div>
      </article>
    `
  }

  render() {
    return html`
      <section class="workspace-panel">
        ${this.renderPanelHeader(
          'Team',
          'Beheer medewerkers, toegang en verantwoordelijkheden.',
          'Teambeheer',
          html`
            <div class="summary-row">
              <span class="badge"><strong>Totaal</strong>&nbsp;${this.userEntries.length}</span>
              <span class="badge"
                ><strong>Admins</strong>&nbsp;${this.userEntries.filter(([, entry]) =>
                  (entry.roles || []).includes('admin')
                ).length}</span
              >
            </div>
          `
        )}

        <div class="top-actions">
          <button
            class="primary"
            @click=${() => this.openInviteDialog()}>
            Nodig gebruiker uit
          </button>
          <span class="muted"
            >Uitnodigingen en rolbeheer blijven beperkt tot accounts met admin- of roles-rechten.</span
          >
        </div>
      </section>

      <section class="users-grid">${this.userEntries.map(([key, entry]) => this.renderUserCard(key, entry))}</section>
      ${this.inviteOpen ? html`<div class="dialog-layer" @click=${(event:Event)=>{if(event.target===event.currentTarget)this.closeInviteDialog()}}><form class="invite-dialog" role="dialog" aria-modal="true" aria-labelledby="invite-title" @submit=${(event:Event)=>this._inviteUser(event)} @keydown=${(event:KeyboardEvent)=>{if(event.key==='Escape')this.closeInviteDialog()}}><h2 id="invite-title">Medewerker uitnodigen</h2><p>De medewerker ontvangt een persoonlijke link om het account met Google te activeren.</p><label for="invite-email">E-mailadres<input id="invite-email" type="email" autocomplete="email" required placeholder="naam@bedrijf.be" .value=${this.inviteEmail} @input=${(event:Event)=>(this.inviteEmail=(event.target as HTMLInputElement).value)} /></label>${this.inviteError?html`<p class="dialog-error" role="alert">${this.inviteError}</p>`:''}<div class="dialog-actions"><button type="button" ?disabled=${this.inviting} @click=${()=>this.closeInviteDialog()}>Annuleren</button><button class="primary" type="submit" ?disabled=${this.inviting}>${this.inviting?'Versturen…':'Uitnodiging versturen'}</button></div></form></div>` : ''}
    `
  }
}

customElements.define('users-view', UsersView)
