import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { listCompanies, listRolesAtCompany } from '../api/client'
import type { Company, Role } from '../api/types'
import { useLoad } from '../api/useLoad'
import { roleUrl } from './links'

// there is no endpoint that lists every job any more, and nothing replaces it - the backend
// is organised by company and then by role. so browse is two levels: the companies someone
// has recorded a job at, and, on expanding one, the roles recorded there
export function Browse() {
  const load = useCallback(() => listCompanies(), [])
  const { data: companies, error, loading } = useLoad(load)

  const [expanded, setExpanded] = useState<Set<Company>>(new Set())
  const [rolesByCompany, setRolesByCompany] = useState<Record<Company, Role[]>>({})
  const [rolesError, setRolesError] = useState<string | null>(null)
  const [fetching, setFetching] = useState<Company | null>(null)

  async function toggle(company: Company) {
    setRolesError(null)
    setExpanded((open) => {
      const next = new Set(open)
      if (!next.delete(company)) {
        next.add(company)
      }
      return next
    })

    // cached from a previous expand. collapsing and reopening should not re-request
    if (rolesByCompany[company] !== undefined) {
      return
    }
    setFetching(company)
    try {
      const roles = await listRolesAtCompany(company)
      setRolesByCompany((previous) => ({ ...previous, [company]: roles }))
    } catch (failure) {
      setRolesError(failure instanceof Error ? failure.message : 'Could not load those roles')
    } finally {
      setFetching(null)
    }
  }

  return (
    <section>
      <div className="section-header">
        <h2>Browse roles</h2>
        <Link className="button-link" to="/jobs/new">
          Submit a job
        </Link>
      </div>

      {error !== null && <p className="error">{error}</p>}
      {rolesError !== null && <p className="error">{rolesError}</p>}
      {loading && companies === null && <p className="notice">Loading companies...</p>}

      {companies !== null && companies.length === 0 && (
        <p className="notice">
          No one has recorded a job yet. <Link to="/jobs/new">Submit the one you applied to.</Link>
        </p>
      )}

      <ul className="companies">
        {companies?.map((company) => {
          const open = expanded.has(company)
          const roles = rolesByCompany[company]
          return (
            <li key={company}>
              {/* company names come back normalised to lower case, and are shown exactly as
                  the API returned them - re-casing would turn eBay into Ebay */}
              <button
                type="button"
                className="toggle"
                aria-expanded={open}
                onClick={() => void toggle(company)}
              >
                <span aria-hidden="true">{open ? '▾' : '▸'}</span> {company}
              </button>

              {open && (
                <div className="roles">
                  {roles === undefined ? (
                    <p className="hint">
                      {fetching === company ? 'Loading roles...' : 'No roles loaded.'}
                    </p>
                  ) : (
                    <ul>
                      {roles.map((role) => (
                        <li key={role}>
                          <Link to={roleUrl(company, role)}>{role}</Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  {/* there is no "add a role" - roles are a fixed enum on the backend, and one
                      shows up here only once a job has been recorded against it */}
                  <p className="hint">
                    Role missing?{' '}
                    <Link to={`/jobs/new?company=${encodeURIComponent(company)}`}>
                      Submit a job
                    </Link>{' '}
                    to make it appear here.
                  </p>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
