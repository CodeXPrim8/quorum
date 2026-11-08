import { Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { loadServerModel } from './agents/model'
import { ErrorState } from './components/Shell'
import { StoreProvider } from './store/Store'
import './styles/global.css'

class Boundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state = { message: null as string | null }

  static getDerivedStateFromError(error: unknown) {
    return { message: error instanceof Error ? error.message : 'The screen hit an unexpected error.' }
  }

  render() {
    if (this.state.message) {
      return (
        <ErrorState
          message={this.state.message}
          onReset={() => {
            localStorage.removeItem('quorum.state.v1')
            window.location.hash = '#/setup'
            window.location.reload()
          }}
        />
      )
    }
    return this.props.children
  }
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing root element')

void loadServerModel().finally(() => {
  createRoot(root).render(
    <Boundary>
      <StoreProvider>
        <App />
      </StoreProvider>
    </Boundary>,
  )
})
