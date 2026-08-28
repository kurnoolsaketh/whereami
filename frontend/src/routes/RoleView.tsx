import { useParams } from 'react-router-dom'

// everyone on one role at one company. filled in next: the merged pipeline graph, the roster,
// and the postings recorded for this role
export function RoleView() {
  // react-router decodes path params, so these are the display names the backend uses
  const { company = '', role = '' } = useParams<{ company: string; role: string }>()

  return (
    <section>
      <h2>{role}</h2>
      <p className="subtitle">{company}</p>
      <p className="notice">The pipeline and the applicants for this role land here next.</p>
    </section>
  )
}
