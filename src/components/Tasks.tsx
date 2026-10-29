import { useMemo, useState } from 'react'
import { isStaffActive } from '../domain/active'
import { statusLabel } from '../domain/selectors'
import { canAdvanceTask, currentStep } from '../engine/apply'
import { actionLabel } from '../engine/outcomes'
import { activityLine, formatWhen } from '../lib/format'
import { EmptyBlock } from './Shell'
import type { AppState, Command, ConsequentialAction, Priority, TaskStatus } from '../types'

const statuses: Array<TaskStatus | 'all'> = [
  'all',
  'ready',
  'in_progress',
  'waiting_for_owner',
  'in_review',
  'blocked',
  'paused',
  'done',
]
const priorities: Priority[] = ['low', 'medium', 'high', 'urgent']
const actions: Array<{ id: '' | ConsequentialAction; label: string }> = [
  { id: '', label: 'No external effect' },
  { id: 'publish_public', label: 'Publishing public content' },
  { id: 'send_external', label: 'Sending an external message' },
  { id: 'purchase', label: 'Purchasing goods' },
  { id: 'finance_change', label: 'Changing financial records' },
  { id: 'hiring', label: 'A hiring decision' },
  { id: 'desktop_control', label: 'Controlling this computer' },
]

export function Tasks({
  state,
  dispatch,
  selectedId,
  now,
}: {
  state: AppState
  dispatch: (command: Command) => void
  selectedId?: string
  now: number
}) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<TaskStatus | 'all'>('all')
  const [priority, setPriority] = useState<Priority | 'all'>('all')
  const [departmentId, setDepartmentId] = useState('all')
  const [openForm, setOpenForm] = useState(false)

  const tasks = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return state.tasks.filter((task) => {
      if (status !== 'all' && task.status !== status) return false
      if (priority !== 'all' && task.priority !== priority) return false
      if (departmentId !== 'all' && task.departmentId !== departmentId) return false
      if (!needle) return true
      return `${task.title} ${task.description} ${task.result ?? ''}`.toLowerCase().includes(needle)
    })
  }, [state.tasks, query, status, priority, departmentId])

  const selected = state.tasks.find((task) => task.id === selectedId) ?? null

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Inbox</p>
          <h1>Tasks</h1>
          <p className="lede">Create work, set priority, and pause anything that should not move.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setOpenForm((value) => !value)}>
          {openForm ? 'Close form' : 'New task'}
        </button>
      </header>
      {openForm && <TaskForm state={state} dispatch={dispatch} onDone={() => setOpenForm(false)} />}
      <div className="toolbar">
        <label>
          Search
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Title or description" />
        </label>
        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value as TaskStatus | 'all')}>
            {statuses.map((item) => (
              <option key={item} value={item}>
                {item === 'all' ? 'All statuses' : statusLabel(item)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Priority
          <select value={priority} onChange={(event) => setPriority(event.target.value as Priority | 'all')}>
            <option value="all">All priorities</option>
            {priorities.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          Department
          <select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
            <option value="all">All departments</option>
            {state.departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {state.tasks.length === 0 ? (
        <EmptyBlock
          title="No tasks yet"
          body="The company has no work in the inbox. Create a task and assign it to someone on the floor."
          action={
            <button type="button" className="btn btn-primary" onClick={() => setOpenForm(true)}>
              Create the first task
            </button>
          }
        />
      ) : (
        <div className="split tasks">
          <div className="panel flush">
            {tasks.length === 0 ? (
              <p className="empty-inline">No tasks match these filters.</p>
            ) : (
              <ul className="task-list">
                {tasks.map((task) => {
                  const owner = state.staff.find((person) => person.id === task.assigneeId)
                  return (
                    <li key={task.id}>
                      <a href={`#/tasks/${task.id}`} aria-current={task.id === selectedId ? 'true' : undefined}>
                        <span className={`pri pri-${task.priority}`} />
                        <span>
                          <strong>{task.title}</strong>
                          <small>
                            {statusLabel(task.status)} · {task.priority} · {owner?.name ?? 'Unassigned'}
                          </small>
                        </span>
                      </a>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          <div className="panel">
            {selected ? (
              <TaskDetail state={state} taskId={selected.id} dispatch={dispatch} now={now} />
            ) : (
              <p className="empty-inline">Select a task to see ownership, blockers, history, and the result.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function TaskForm({
  state,
  dispatch,
  onDone,
}: {
  state: AppState
  dispatch: (command: Command) => void
  onDone: () => void
}) {
  const people = state.staff.filter((person) => isStaffActive(state, person))
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [assigneeId, setAssigneeId] = useState(people[0]?.id ?? '')
  const [action, setAction] = useState<'' | ConsequentialAction>('')
  const [summary, setSummary] = useState('')

  if (people.length === 0) {
    return <p className="note">Add an active person before creating a task.</p>
  }

  return (
    <form
      className="panel form-grid"
      onSubmit={(event) => {
        event.preventDefault()
        const person = people.find((item) => item.id === assigneeId)
        if (!person) return
        dispatch({
          type: 'CREATE_TASK',
          input: {
            title,
            description,
            priority,
            assigneeId,
            departmentId: person.departmentId,
            consequential: action ? { action, summary: summary.trim() || actionLabel(action) } : null,
          },
        })
        onDone()
      }}
    >
      <h2>New task</h2>
      <label>
        Title
        <input value={title} onChange={(event) => setTitle(event.target.value)} required />
      </label>
      <label>
        Description
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
      </label>
      <label>
        Priority
        <select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
          {priorities.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </label>
      <label>
        Assign to
        <select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name} · {person.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        Consequential effect
        <select value={action} onChange={(event) => setAction(event.target.value as '' | ConsequentialAction)}>
          {actions.map((item) => (
            <option key={item.label} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      {action && (
        <label>
          What needs approval
          <input value={summary} onChange={(event) => setSummary(event.target.value)} />
        </label>
      )}
      <p className="fine">
        Creating a task does not start it and does not contact an outside system. Consequential tasks still need a
        separate approval before anything external could happen.
      </p>
      <button type="submit" className="btn btn-primary">
        Add to inbox
      </button>
    </form>
  )
}

function TaskDetail({
  state,
  taskId,
  dispatch,
  now,
}: {
  state: AppState
  taskId: string
  dispatch: (command: Command) => void
  now: number
}) {
  const task = state.tasks.find((item) => item.id === taskId)
  const [blocker, setBlocker] = useState('')
  const [note, setNote] = useState('')
  if (!task) return <p className="empty-inline">That task is no longer in the inbox.</p>
  const owner = state.staff.find((person) => person.id === task.assigneeId)
  const department = state.departments.find((item) => item.id === task.departmentId)
  const events = state.events.filter((event) => event.taskId === task.id)
  const people = state.staff.filter((person) => isStaffActive(state, person))
  const step = currentStep(task)

  return (
    <article>
      <p className="eyebrow">{department?.name ?? 'Department'}</p>
      <h2>{task.title}</h2>
      <p>{task.description}</p>
      <dl className="facts">
        <div>
          <dt>Status</dt>
          <dd>{statusLabel(task.status)}</dd>
        </div>
        <div>
          <dt>Priority</dt>
          <dd className="cap">{task.priority}</dd>
        </div>
        <div>
          <dt>Owner</dt>
          <dd>{owner ? <a href={`#/people/${owner.id}`}>{owner.name}</a> : 'Unassigned'}</dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>{formatWhen(task.updatedAt, now)}</dd>
        </div>
      </dl>
      {task.handoff && (
        <p className="note">
          Handoff in progress: {task.handoff.phase === 'delivering' ? 'walking the request over' : 'returning to their desk'}.
          Pause waits until they arrive.
        </p>
      )}
      {task.blockers.length > 0 && (
        <>
          <h3>Blockers</h3>
          <ul className="plain">
            {task.blockers.map((item) => (
              <li key={item.id}>
                {item.text}{' '}
                <button type="button" className="linkish" onClick={() => dispatch({ type: 'CLEAR_BLOCKER', taskId: task.id, blockerId: item.id })}>
                  Clear
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {task.result && (
        <>
          <h3>Result</h3>
          <blockquote>{task.result}</blockquote>
        </>
      )}
      {task.playbook.length > 0 && (
        <>
          <h3>Demo playbook</h3>
          <p className="fine">The local engine follows these steps. A real backend would replace the script.</p>
          <ol className="playbook">
            {task.playbook.map((item, index) => (
              <li key={index} data-state={index < task.stepIndex ? 'done' : index === task.stepIndex ? 'now' : 'later'}>
                {item.kind === 'work' && item.startDetail}
                {item.kind === 'handoff' && item.detail}
                {item.kind === 'meet' && item.detail}
                {item.kind === 'approval' && item.summary}
                {item.kind === 'report' && item.detail}
              </li>
            ))}
          </ol>
        </>
      )}
      <div className="button-row">
        {task.status === 'ready' && (
          <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'START_TASK', taskId: task.id })}>
            Start
          </button>
        )}
        {task.status === 'paused' && (
          <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'RESUME_TASK', taskId: task.id })}>
            Resume
          </button>
        )}
        {task.status === 'in_progress' && !task.handoff && (
          <button type="button" className="btn" onClick={() => dispatch({ type: 'PAUSE_TASK', taskId: task.id })}>
            Pause
          </button>
        )}
        {canAdvanceTask(task) && (
          <button type="button" className="btn" onClick={() => dispatch({ type: 'ADVANCE_TASK', taskId: task.id })}>
            Advance demo step
          </button>
        )}
        {task.consequential && task.status !== 'done' && task.status !== 'waiting_for_owner' && task.status !== 'in_review' && (
          <button type="button" className="btn" onClick={() => dispatch({ type: 'REQUEST_APPROVAL', taskId: task.id })}>
            Submit for approval
          </button>
        )}
      </div>
      {task.status === 'waiting_for_owner' && <p className="note">This is waiting for you. Decide it on the Approvals page. No external system has been contacted.</p>}
      {task.status === 'in_review' && (
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault()
          }}
        >
          <label>
            Review note
            <input value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          <div className="button-row">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => dispatch({ type: 'REVIEW_TASK', taskId: task.id, decision: 'accept', note })}
            >
              Accept result
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => dispatch({ type: 'REVIEW_TASK', taskId: task.id, decision: 'changes', note })}
            >
              Request changes
            </button>
          </div>
        </form>
      )}
      <div className="form-grid compact">
        <label>
          Priority
          <select
            value={task.priority}
            onChange={(event) =>
              dispatch({ type: 'SET_PRIORITY', taskId: task.id, priority: event.target.value as Priority })
            }
          >
            {priorities.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Reassign
          <select
            value={task.assigneeId ?? ''}
            onChange={(event) => dispatch({ type: 'ASSIGN_TASK', taskId: task.id, staffId: event.target.value })}
          >
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {task.status !== 'done' && !task.handoff && (
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault()
            dispatch({ type: 'ADD_BLOCKER', taskId: task.id, text: blocker })
            setBlocker('')
          }}
        >
          <label>
            Add a blocker
            <input value={blocker} onChange={(event) => setBlocker(event.target.value)} />
          </label>
          <button type="submit" className="btn">
            Block
          </button>
        </form>
      )}
      {step?.kind === 'approval' && task.status === 'waiting_for_owner' && (
        <p className="fine">Current step: approval for {actionLabel(step.action)}.</p>
      )}
      <h3>Activity</h3>
      {events.length === 0 ? (
        <p className="empty-inline">No history on this task yet.</p>
      ) : (
        <ol className="activity">
          {events.map((event) => (
            <li key={event.id}>
              <time dateTime={event.at}>{formatWhen(event.at, now)}</time>
              <p>
                {activityLine(event.actorName, event.message)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </article>
  )
}
