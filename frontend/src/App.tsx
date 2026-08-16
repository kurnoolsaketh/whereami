import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireSession } from './session/RequireSession'
import { AddJob } from './routes/AddJob'
import { AppLayout } from './routes/AppLayout'
import { BrowseJobs } from './routes/BrowseJobs'
import { MyApplications } from './routes/MyApplications'
import { SignIn } from './routes/SignIn'

export default function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignIn />} />
      <Route element={<RequireSession />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<MyApplications />} />
          <Route path="/jobs" element={<BrowseJobs />} />
          <Route path="/jobs/new" element={<AddJob />} />
        </Route>
      </Route>
      {/* anything unrecognised goes to the home route, which is itself behind the session */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
