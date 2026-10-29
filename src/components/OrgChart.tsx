import { buildOrg } from '../domain/selectors'
import type { AppState, OrgNode } from '../types'

export function OrgChart({ state }: { state: AppState }) {
  const tree = buildOrg(state)
  if (!tree) return null
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Reporting lines</p>
          <h1>Organization</h1>
          <p className="lede">
            {state.company?.management === 'managing_director'
              ? 'Executives report through the Managing Director unless you manage a desk directly.'
              : 'The Managing Director role is off. Managers report to you.'}
          </p>
        </div>
      </header>
      <div className="org-scroll">
        <ul className="org">
          <OrgBranch node={tree} />
        </ul>
      </div>
    </div>
  )
}

function OrgBranch({ node }: { node: OrgNode }) {
  const body = (
    <>
      <strong>{node.name}</strong>
      <span>{node.title}</span>
    </>
  )
  return (
    <li>
      {node.kind === 'person' && node.staffId ? (
        <a className="org-card" href={`#/people/${node.staffId}`}>
          {body}
        </a>
      ) : node.kind === 'vacant' ? (
        <a className="org-card vacant" href={`#/people/new/${node.roleId ?? ''}`}>
          {body}
        </a>
      ) : (
        <div className="org-card owner">{body}</div>
      )}
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <OrgBranch key={child.id} node={child} />
          ))}
        </ul>
      )}
    </li>
  )
}
