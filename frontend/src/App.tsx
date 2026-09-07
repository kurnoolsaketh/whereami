import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireSession } from './session/RequireSession'
import { AddJob } from './routes/AddJob'
import { AppLayout } from './routes/AppLayout'
import { Applied } from './routes/Applied'
import { Browse } from './routes/Browse'
import { GraphShapes } from './routes/GraphShapes'
import { MyApplications } from './routes/MyApplications'
import { RoleView } from './routes/RoleView'
import { SignIn } from './routes/SignIn'
import { UserProfile } from './routes/UserProfile'

export default function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignIn />} />
      {/* the layout fixtures, for working on the graph. not linked from anywhere and outside the
          session on purpose: it renders every role shape from hand-written pipelines with no
          backend behind them, so needing to sign in would be needing the very thing it avoids */}
      <Route path="/dev/graph" element={<GraphShapes />} />
      <Route element={<RequireSession />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<MyApplications />} />
          <Route path="/browse" element={<Browse />} />
          <Route path="/jobs/new" element={<AddJob />} />
          {/* your own pipeline on one posting, keyed by job id so a link opens on its own */}
          <Route path="/applied/:jobId" element={<Applied />} />
          {/* everyone on one role at one company. both segments carry spaces, so both are
              encoded in every link that points here */}
          <Route path="/roles/:company/:role" element={<RoleView />} />
          <Route path="/users/:userId" element={<UserProfile />} />
        </Route>
      </Route>
      {/* anything unrecognised goes to the home route, which is itself behind the session */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
