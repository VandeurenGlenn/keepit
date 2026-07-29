import { html, property, LiteElement } from '@vandeurenglenn/lite'
import { DataFlow } from '../flows/data.js'
import { api } from '../api/client.js'
import '../flows/data.js'
import '../flows/data-input.js'
import './../animations/success.js'

export const JobsMixin = (base: typeof LiteElement) =>
  class JobsMixin extends base {
    @property({ type: Object, consumes: true }) accessor jobs

    @property({ type: Boolean }) accessor creatingJob = false

    @property({ type: Array }) accessor jobSteps = [
      {
        name: 'Naam van de job',
        description: 'Geef de werf of opdracht een herkenbare naam.',
        template: html`<data-input label="name"></data-input> `,
        validateAndReturnValues: (inputs) => {
          const data = {}

          for (const input of inputs) {
            data[input.label] = input.value
            if (!data[input.label]) {
              return { valid: false, values: data }
            }
          }
          return { valid: true, values: data }
        }
      },
      {
        name: 'Werflocatie',
        description: 'Zoek het adres waar het werk uitgevoerd wordt.',
        template: html`
          <data-input
            label="place"
            type="place"></data-input>
        `,

        validateAndReturnValues: (inputs) => {
          const data = {}

          for (const input of inputs) {
            data[input.label] = input.place
            if (!data[input.label]) {
              return { valid: false, values: data }
            }
          }
          return { valid: true, values: data }
        }
      },
      {
        name: 'Omschrijving',
        description: 'Optioneel: voeg extra context voor het team toe.',
        template: html`<data-input label="description"></data-input> `,
        validateAndReturnValues: (inputs) => {
          const data = {}

          for (const input of inputs) {
            data[input.label] = input.value
          }
          return { valid: true, values: data }
        }
      }
    ]

    _createJob = async () => {
      this.creatingJob = true
      const dataFlow = new DataFlow()
      dataFlow.steps = this.jobSteps
      dataFlow.label = 'Nieuwe job'
      document.body.appendChild(dataFlow)
      const stepResults = await dataFlow.done
      if (!stepResults) {
        console.error('Error creating job: no step results')
        this.creatingJob = false
        return
      }
      const result = (stepResults as Array<Record<string, any>>).reduce(
        (acc, curr) => ({ ...acc, ...curr }),
        {}
      ) as { name: string; description?: string; place: any }

      try {
        const data = await api.createJob(result)
        this.jobs = { ...this.jobs, [data.uuid]: data.content }
        this.creatingJob = false
        document.body.removeChild(dataFlow)

        const success = document.createElement('success-animation') as HTMLElement & { message?: string }
        document.body.appendChild(success)
        success.message = 'Job aangemaakt'
        setTimeout(() => {
          document.body.removeChild(success)
        }, 1200) // 1.2s for animation
      } catch (error) {
        console.error('Error creating job:', error)
        this.creatingJob = false
        alert('De job kon niet aangemaakt worden.')
      }
    }

    _deleteJob = async (uuid) => {
      const answer = confirm('Ben je zeker dat je deze job wilt verwijderen?')
      if (!answer) return

      try {
        await api.deleteJob(uuid)
        delete this.jobs[uuid]
        this.requestRender()
      } catch (error) {
        console.error('Error deleting job:', error)
        alert('De job kon niet verwijderd worden.')
      }
    }

    _handleFabKeyUp = (event) => {
      if (event.key === 'Enter' || event.key === 'Space') {
        event.preventDefault()
        this._createJob()
      }
    }
  }
