import { html, property, LiteElement, query } from '@vandeurenglenn/lite'
import { DataFlow } from '../flows/data.js'
import '../flows/data.js'
import '../flows/data-input.js'

export const JobsMixin = (base: typeof LiteElement) =>
  class JobsMixin extends base {
    @property({ type: Object, consumes: true }) accessor jobs

    @property({ type: Boolean }) accessor creatingJob = false

    @property({ type: Array }) accessor jobSteps = [
      {
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
        description: 'optional',
        template: html`<data-input label="description"></data-input> `,
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
      }
    ]

    _createJob = async () => {
      this.creatingJob = true
      const dataFlow = new DataFlow()
      dataFlow.steps = this.jobSteps
      dataFlow.label = 'Add Job'
      document.body.appendChild(dataFlow)
      const stepResults = await dataFlow.done
      if (!stepResults) {
        console.error('Error creating job: no step results')
        this.creatingJob = false
        return
      }
      const result = stepResults.reduce((acc, curr) => {
        return { ...acc, ...curr }
      }, {})

      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: localStorage.getItem('token')
        },
        body: JSON.stringify(result)
      })
      if (!response.ok) {
        console.error('Error creating job:', response.statusText)
        this.creatingJob = false
        return
      }
      const data = await response.json()
      this.jobs[data.uuid] = data.content
      this.creatingJob = false
      document.body.removeChild(dataFlow)
    }

    _deleteJob = async (uuid) => {
      const answer = confirm('Are you sure you want to delete this job?')
      if (!answer) return
      const response = await fetch(`/api/jobs/${uuid}`, {
        method: 'DELETE',
        headers: { Authorization: localStorage.getItem('token') }
      })
      if (!response.ok) {
        console.error('Error deleting job:', response.statusText)
        return
      }
      delete this.jobs[uuid]
      this.requestRender()
    }

    _handleFabKeyUp = (event) => {
      if (event.key === 'Enter' || event.key === 'Space') {
        event.preventDefault()
        this._createJob()
      }
    }
  }
